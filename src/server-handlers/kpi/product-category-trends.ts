import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../../api/_lib/auth.js';

type RegionKey = 'all' | 'tokyo' | 'osaka';
type ForecastMethod = 'linear' | 'fixed_growth';
type ActualRow = { department_id: number; category_name: string | null; sort_order: number | null; fiscal_year: number; sales_total: number | string | null; units_total: number | string | null };
type ClinicGroupRow = { department_id: number; category_name: string | null; fiscal_year: number; clinic_keys: string[] | null };
type ForecastInput = { department_id: number; category_name: string; fiscal_year: number; units_growth_percent: number | null; unit_price_growth_percent: number | null; note: string | null };
type TrendValue = { period_key: string; sales: number; units: number; unit_price: number; clinic_keys?: string[]; previous_full_clinic_keys?: string[]; previous_same_period_clinic_keys?: string[]; baseline_units?: number; baseline_unit_price?: number; baseline_units_growth_percent?: number; baseline_unit_price_growth_percent?: number; forecast_input?: { units_growth_percent: number | null; unit_price_growth_percent: number | null; note: string } };
type CategoryResult = { key: string; label: string; sort_order: number; series: TrendValue[] };

const EXCLUDED_CATEGORIES = new Set(['値引', '未分類']);
const FORECAST_AS_OF_DATE = '2026-08-31';
function tokyoDateString(date = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function parseAsOfDate(value: unknown) { const raw = String(value ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : tokyoDateString(); }
function parseBoundedNumber(value: unknown, fallback: number, min: number, max: number) { const parsed = Number(Array.isArray(value) ? value[0] : value); return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
function fiscalYearOf(date: Date) { return date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1; }
function roundMetric(value: number, digits = 0) { if (!Number.isFinite(value)) return 0; const scale = 10 ** digits; return Math.round(value * scale) / scale; }
function linearProjection(values: number[], targetIndex: number) {
  if (!values.length) return 0; if (values.length === 1) return Math.max(0, values[0]);
  const count = values.length; const sumX = values.reduce((sum, _v, i) => sum + i, 0); const sumY = values.reduce((sum, v) => sum + v, 0);
  const sumXY = values.reduce((sum, v, i) => sum + i * v, 0); const sumXX = values.reduce((sum, _v, i) => sum + i * i, 0);
  const denominator = count * sumXX - sumX * sumX; const slope = denominator ? (count * sumXY - sumX * sumY) / denominator : 0;
  return Math.max(0, (sumY - slope * sumX) / count + slope * targetIndex);
}
function linearProjectionPoints(points: Array<{ x: number; y: number }>, targetIndex: number) {
  if (!points.length) return 0; if (points.length === 1) return Math.max(0, points[0].y);
  const count = points.length; const sumX = points.reduce((sum, point) => sum + point.x, 0); const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0); const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = count * sumXX - sumX * sumX; const slope = denominator ? (count * sumXY - sumX * sumY) / denominator : 0;
  return Math.max(0, (sumY - slope * sumX) / count + slope * targetIndex);
}
function fiscalLabel(fiscalYear: number) { return `${String(fiscalYear).slice(-2)}/04～${String(fiscalYear + 1).slice(-2)}/03`; }
function normalizeRegion(value: unknown): RegionKey { return value === 'tokyo' || value === 'osaka' ? value : 'all'; }
function bodyOf(req: any) { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {}); }

async function saveForecast(req: any, res: any, profile: any) {
  const body = bodyOf(req); const asOfDate = parseAsOfDate(body.as_of_date); const status = body.status === 'published' ? 'published' : 'draft';
  const inputs = Array.isArray(body.inputs) ? body.inputs : []; let scenarioId = String(body.scenario_id ?? '').trim();
  if (!scenarioId) {
    const { data, error } = await supabaseAdmin.from('product_category_forecast_scenarios').insert({ name: '商品カテゴリ予測', as_of_date: asOfDate,
      status, created_by: profile.id, updated_by: profile.id, published_at: status === 'published' ? new Date().toISOString() : null }).select('id').single();
    if (error) throw error; scenarioId = data.id;
  } else {
    const { error } = await supabaseAdmin.from('product_category_forecast_scenarios').update({ status, updated_by: profile.id, updated_at: new Date().toISOString(),
      ...(status === 'published' ? { published_at: new Date().toISOString() } : {}) }).eq('id', scenarioId);
    if (error) throw error;
  }
  const rows = inputs.map((input: any) => ({ scenario_id: scenarioId, department_id: Number(input.department_id), category_name: String(input.category_name ?? '').trim(),
    fiscal_year: Number(input.fiscal_year), units_growth_percent: input.units_growth_percent === '' || input.units_growth_percent == null ? null : parseBoundedNumber(input.units_growth_percent, 0, -100, 300),
    unit_price_growth_percent: input.unit_price_growth_percent === '' || input.unit_price_growth_percent == null ? null : parseBoundedNumber(input.unit_price_growth_percent, 0, -100, 300),
    baseline_units_growth_percent: input.baseline_units_growth_percent == null ? null : Number(input.baseline_units_growth_percent),
    baseline_unit_price_growth_percent: input.baseline_unit_price_growth_percent == null ? null : Number(input.baseline_unit_price_growth_percent),
    baseline_units: input.baseline_units == null ? null : Number(input.baseline_units),
    baseline_unit_price: input.baseline_unit_price == null ? null : Number(input.baseline_unit_price),
    adjusted_units: input.adjusted_units == null ? null : Number(input.adjusted_units),
    adjusted_unit_price: input.adjusted_unit_price == null ? null : Number(input.adjusted_unit_price),
    note: String(input.note ?? '').slice(0, 2000), updated_by: profile.id, updated_at: new Date().toISOString() }))
    .filter((row: any) => [1, 2].includes(row.department_id) && row.category_name && Number.isInteger(row.fiscal_year));
  if (rows.length) { const { error } = await supabaseAdmin.from('product_category_forecast_inputs').upsert(rows, { onConflict: 'scenario_id,department_id,category_name,fiscal_year' }); if (error) throw error; }
  return res.status(200).json({ scenario_id: scenarioId, status, saved_count: rows.length, updated_at: new Date().toISOString() });
}

async function deleteForecastAdjustment(req: any, res: any) {
  const historyId = Number(bodyOf(req).history_id);
  if (!Number.isInteger(historyId)) return res.status(400).json({ error: 'history_id is required' });
  const { data: historyRow, error: historyError } = await supabaseAdmin.from('product_category_forecast_input_history')
    .select('input_id').eq('id', historyId).maybeSingle();
  if (historyError) throw historyError;
  if (!historyRow?.input_id) return res.status(404).json({ error: 'history not found' });
  const { error: inputError } = await supabaseAdmin.from('product_category_forecast_inputs').delete().eq('id', historyRow.input_id);
  if (inputError) throw inputError;
  const { error: cleanupError } = await supabaseAdmin.from('product_category_forecast_input_history').delete().eq('input_id', historyRow.input_id);
  if (cleanupError) throw cleanupError;
  return res.status(200).json({ deleted: true });
}

export default async function handler(req: any, res: any) {
  try {
    const profile = await requireAuthenticatedProfile(req, res); if (!profile || !requireDashboardAccess(profile, res)) return;
    if (req.method === 'POST') return await saveForecast(req, res, profile);
    if (req.method === 'DELETE') return await deleteForecastAdjustment(req, res);
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    // 進行期着地はユーザー指定の2026年8月末実績を基準として固定する。
    const asOfDate = FORECAST_AS_OF_DATE; const region = normalizeRegion(req.query?.region);
    const forecastMethod: ForecastMethod = req.query?.forecast_method === 'fixed_growth' ? 'fixed_growth' : 'linear';
    const landingAdjustmentPercent = parseBoundedNumber(req.query?.landing_adjustment_percent, 100, 0, 300);
    const salesGrowthPercent = parseBoundedNumber(req.query?.sales_growth_percent, 0, -100, 300); const unitsGrowthPercent = parseBoundedNumber(req.query?.units_growth_percent, 0, -100, 300);
    const asOf = new Date(`${asOfDate}T00:00:00Z`); const currentFiscalYear = fiscalYearOf(asOf);
    const previousYearAsOf = new Date(asOf); previousYearAsOf.setUTCFullYear(previousYearAsOf.getUTCFullYear() - 1);
    const previousYearAsOfDate = previousYearAsOf.toISOString().slice(0, 10);
    const currentFiscalStart = new Date(Date.UTC(currentFiscalYear, 3, 1)); const nextFiscalStart = new Date(Date.UTC(currentFiscalYear + 1, 3, 1));
    const fiscalDays = Math.max(1, Math.round((nextFiscalStart.getTime() - currentFiscalStart.getTime()) / 86_400_000));
    const elapsedDays = Math.min(fiscalDays, Math.max(1, Math.floor((asOf.getTime() - currentFiscalStart.getTime()) / 86_400_000) + 1)); const currentProgressRate = elapsedDays / fiscalDays;
    const [actualResult, materialActualResult, previousPeriodActualResult, previousPeriodMaterialActualResult, clinicResult, materialClinicResult, previousPeriodClinicResult, previousPeriodMaterialClinicResult, scenarioResult] = await Promise.all([
      supabaseAdmin.rpc('product_category_department_fiscal_actuals', { p_as_of_date: asOfDate }),
      supabaseAdmin.rpc('material_category_department_fiscal_actuals', { p_as_of_date: asOfDate }),
      supabaseAdmin.rpc('product_category_department_fiscal_actuals', { p_as_of_date: previousYearAsOfDate }),
      supabaseAdmin.rpc('material_category_department_fiscal_actuals', { p_as_of_date: previousYearAsOfDate }),
      supabaseAdmin.rpc('product_category_department_fiscal_clinic_groups', { p_as_of_date: asOfDate }),
      supabaseAdmin.rpc('material_category_department_fiscal_clinic_groups', { p_as_of_date: asOfDate }),
      supabaseAdmin.rpc('product_category_department_fiscal_clinic_groups', { p_as_of_date: previousYearAsOfDate }),
      supabaseAdmin.rpc('material_category_department_fiscal_clinic_groups', { p_as_of_date: previousYearAsOfDate }),
      supabaseAdmin.from('product_category_forecast_scenarios').select('id,name,status,updated_at,updated_by,published_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (actualResult.error) throw actualResult.error; if (materialActualResult.error) throw materialActualResult.error; if (previousPeriodActualResult.error) throw previousPeriodActualResult.error; if (previousPeriodMaterialActualResult.error) throw previousPeriodMaterialActualResult.error; if (clinicResult.error) throw clinicResult.error; if (materialClinicResult.error) throw materialClinicResult.error; if (previousPeriodClinicResult.error) throw previousPeriodClinicResult.error; if (previousPeriodMaterialClinicResult.error) throw previousPeriodMaterialClinicResult.error; if (scenarioResult.error) throw scenarioResult.error;
    const scenario = scenarioResult.data; let forecastInputs: ForecastInput[] = []; let history: any[] = [];
    if (scenario?.id) { const { data, error } = await supabaseAdmin.from('product_category_forecast_inputs').select('department_id,category_name,fiscal_year,units_growth_percent,unit_price_growth_percent,note').eq('scenario_id', scenario.id); if (error) throw error; forecastInputs = (data ?? []) as ForecastInput[]; }
    if (scenario?.id) {
      const { data: historyRows, error: historyError } = await supabaseAdmin.from('product_category_forecast_input_history')
        .select('id,input_id,changed_by,new_value,changed_at').eq('scenario_id', scenario.id).order('changed_at', { ascending: false }).limit(200);
      if (historyError) throw historyError;
      const profileIds = Array.from(new Set((historyRows ?? []).map((row: any) => row.changed_by).filter(Boolean)));
      const profileNames = new Map<string, string>();
      if (profileIds.length) {
        const { data: profiles } = await supabaseAdmin.from('profiles').select('id,name').in('id', profileIds);
        (profiles ?? []).forEach((row: any) => profileNames.set(row.id, row.name ?? ''));
      }
      history = (historyRows ?? []).filter((row: any) => row.new_value).map((row: any) => ({
        id: row.id, input_id: row.input_id, changed_at: row.changed_at, changed_by: row.changed_by, changed_by_name: profileNames.get(row.changed_by) || '不明',
        department_id: row.new_value.department_id, category_name: row.new_value.category_name, fiscal_year: row.new_value.fiscal_year,
        units_growth_percent: row.new_value.units_growth_percent, unit_price_growth_percent: row.new_value.unit_price_growth_percent,
        baseline_units_growth_percent: row.new_value.baseline_units_growth_percent, baseline_unit_price_growth_percent: row.new_value.baseline_unit_price_growth_percent,
        baseline_units: row.new_value.baseline_units, baseline_unit_price: row.new_value.baseline_unit_price,
        adjusted_units: row.new_value.adjusted_units, adjusted_unit_price: row.new_value.adjusted_unit_price, note: row.new_value.note ?? '',
      }));
    }
    const inputMap = new Map(forecastInputs.map((input) => [`${input.department_id}\u0000${input.category_name}\u0000${input.fiscal_year}`, input]));
    const clinicMap = new Map<string, Set<string>>();
    ([...(clinicResult.data ?? []), ...(materialClinicResult.data ?? [])] as ClinicGroupRow[]).forEach((row) => { const label = String(row.category_name ?? '').trim() || '未分類'; if (EXCLUDED_CATEGORIES.has(label)) return;
      const key = `${row.department_id}\u0000${label}\u0000${row.fiscal_year}`; clinicMap.set(key, new Set((row.clinic_keys ?? []).map(String).filter(Boolean))); });
    const previousPeriodClinicMap = new Map<string, Set<string>>();
    ([...(previousPeriodClinicResult.data ?? []), ...(previousPeriodMaterialClinicResult.data ?? [])] as ClinicGroupRow[]).forEach((row) => {
      const label = String(row.category_name ?? '').trim() || '未分類';
      if (!EXCLUDED_CATEGORIES.has(label)) previousPeriodClinicMap.set(`${row.department_id}\u0000${label}\u0000${row.fiscal_year}`, new Set((row.clinic_keys ?? []).map(String).filter(Boolean)));
    });
    const firstActualFiscalYear = currentFiscalYear - 2; const actualFiscalYears = [firstActualFiscalYear, firstActualFiscalYear + 1, currentFiscalYear];
    const forecastFiscalYears = Array.from({ length: 5 }, (_v, i) => currentFiscalYear + i + 1);
    const periods = [...actualFiscalYears.map((fiscalYear) => ({ key: `fy${fiscalYear}`, fiscal_year: fiscalYear, label: fiscalLabel(fiscalYear), short_label: fiscalYear === currentFiscalYear ? `${String(fiscalYear).slice(-2)}年度着地予測` : `${String(fiscalYear).slice(-2)}年度`, kind: fiscalYear === currentFiscalYear ? 'forecast' as const : 'actual' as const, is_partial: fiscalYear === currentFiscalYear })),
      ...forecastFiscalYears.map((fiscalYear) => ({ key: `fy${fiscalYear}`, fiscal_year: fiscalYear, label: `${fiscalLabel(fiscalYear)}予測`, short_label: `${String(fiscalYear).slice(-2)}年度予測`, kind: 'forecast' as const, is_partial: false }))];
    const rows = ([...(actualResult.data ?? []), ...(materialActualResult.data ?? [])]) as ActualRow[];
    const previousPeriodActualMap = new Map(([
      ...(previousPeriodActualResult.data ?? []), ...(previousPeriodMaterialActualResult.data ?? []),
    ] as ActualRow[]).map((row) => [`${row.department_id}\u0000${String(row.category_name ?? '').trim()}\u0000${row.fiscal_year}`, {
      sales: Number(row.sales_total ?? 0), units: Number(row.units_total ?? 0),
    }]));
    const buildDepartment = (departmentId: number): CategoryResult[] => {
      const map = new Map<string, { label: string; sort_order: number; actuals: Map<number, { sales: number; units: number }> }>();
      rows.filter((row) => Number(row.department_id) === departmentId).forEach((row) => { const label = String(row.category_name ?? '').trim() || '未分類'; if (EXCLUDED_CATEGORIES.has(label)) return;
        const item = map.get(label) ?? { label, sort_order: Number(row.sort_order ?? 999999), actuals: new Map() }; item.sort_order = Math.min(item.sort_order, Number(row.sort_order ?? 999999));
        item.actuals.set(Number(row.fiscal_year), { sales: Number(row.sales_total ?? 0), units: Number(row.units_total ?? 0) }); map.set(label, item); });
      return Array.from(map.values()).map((category) => {
        const actualValues = actualFiscalYears.map((fiscalYear): TrendValue => { const source = category.actuals.get(fiscalYear) ?? { sales: 0, units: 0 }; const partial = fiscalYear === currentFiscalYear;
          const previousFull = category.actuals.get(currentFiscalYear - 1) ?? { sales: 0, units: 0 };
          const previousSamePeriod = previousPeriodActualMap.get(`${departmentId}\u0000${category.label}\u0000${currentFiscalYear - 1}`) ?? { sales: 0, units: 0 };
          const seasonalSalesLanding = previousSamePeriod.sales > 0 ? previousFull.sales * source.sales / previousSamePeriod.sales : source.sales / currentProgressRate;
          const seasonalUnitsLanding = previousSamePeriod.units > 0 ? previousFull.units * source.units / previousSamePeriod.units : source.units / currentProgressRate;
          const sales = roundMetric(partial ? seasonalSalesLanding * landingAdjustmentPercent / 100 : source.sales); const units = roundMetric(partial ? seasonalUnitsLanding * landingAdjustmentPercent / 100 : source.units, 1);
          const isCurrent = fiscalYear === currentFiscalYear;
          return { period_key: `fy${fiscalYear}`, sales, units, unit_price: units ? roundMetric(sales / units) : 0,
            clinic_keys: Array.from(clinicMap.get(`${departmentId}\u0000${category.label}\u0000${fiscalYear}`) ?? []),
            previous_full_clinic_keys: isCurrent ? Array.from(clinicMap.get(`${departmentId}\u0000${category.label}\u0000${currentFiscalYear - 1}`) ?? []) : undefined,
            previous_same_period_clinic_keys: isCurrent ? Array.from(previousPeriodClinicMap.get(`${departmentId}\u0000${category.label}\u0000${currentFiscalYear - 1}`) ?? []) : undefined }; });
        const materialPricePoints = actualValues.map((value, index) => ({
          x: index, y: value.unit_price, rawUnits: Math.abs(category.actuals.get(actualFiscalYears[index])?.units ?? 0),
        })).filter((point) => point.y > 0 && point.rawUnits >= 30);
        const sortedMaterialPrices = materialPricePoints.map((point) => point.y).sort((a, b) => a - b);
        const materialMedian = sortedMaterialPrices.length ? sortedMaterialPrices[Math.floor(sortedMaterialPrices.length / 2)] : 0;
        const validMaterialPricePoints = materialPricePoints.filter((point) => !materialMedian || (point.y >= materialMedian * 0.5 && point.y <= materialMedian * 2));
        const fallbackMaterialPrice = (() => {
          const values = actualValues.map((value) => value.unit_price).filter((value) => value > 0).sort((a, b) => a - b);
          return values.length ? values[Math.floor(values.length / 2)] : 0;
        })();
        const forecastValues: TrendValue[] = [];
        forecastFiscalYears.forEach((fiscalYear, index) => { const previous = index ? forecastValues[index - 1] : actualValues[2]; const autoPreviousUnits = index ? (forecastValues[index - 1].baseline_units ?? forecastValues[index - 1].units) : actualValues[2].units;
          const autoPreviousUnitPrice = index ? (forecastValues[index - 1].baseline_unit_price ?? forecastValues[index - 1].unit_price) : actualValues[2].unit_price;
          const input = inputMap.get(`${departmentId}\u0000${category.label}\u0000${fiscalYear}`); const projectionIndex = actualValues.length + index;
          const autoUnits = forecastMethod === 'fixed_growth' ? autoPreviousUnits * (1 + unitsGrowthPercent / 100) : linearProjection(actualValues.map((v) => v.units), projectionIndex);
          const isMaterial = category.label.startsWith('__material__');
          const autoUnitPrice = forecastMethod === 'fixed_growth'
            ? autoPreviousUnitPrice * ((1 + salesGrowthPercent / 100) / Math.max(0.01, 1 + unitsGrowthPercent / 100))
            : isMaterial
              ? (validMaterialPricePoints.length >= 2 ? linearProjectionPoints(validMaterialPricePoints, projectionIndex) : fallbackMaterialPrice)
              : linearProjection(actualValues.map((v) => v.unit_price), projectionIndex);
          const baselineUnitsGrowthPercent = autoPreviousUnits ? (autoUnits / autoPreviousUnits - 1) * 100 : 0;
          const baselineUnitPriceGrowthPercent = autoPreviousUnitPrice ? (autoUnitPrice / autoPreviousUnitPrice - 1) * 100 : 0;
          // 手入力の影響は翌年度以降にも引き継ぐ。入力のない年度は、自動予測の
          // 前年比を直前の調整後値へ適用し、東京・大阪・全社で同じ系列にする。
          const appliedUnitsGrowthPercent = input?.units_growth_percent != null ? Number(input.units_growth_percent) : baselineUnitsGrowthPercent;
          const appliedUnitPriceGrowthPercent = input?.unit_price_growth_percent != null ? Number(input.unit_price_growth_percent) : baselineUnitPriceGrowthPercent;
          const units = roundMetric(previous.units * (1 + appliedUnitsGrowthPercent / 100), 1);
          const unitPrice = roundMetric(previous.unit_price * (1 + appliedUnitPriceGrowthPercent / 100));
          forecastValues.push({ period_key: `fy${fiscalYear}`, sales: roundMetric(units * unitPrice), units, unit_price: unitPrice,
            baseline_units: roundMetric(autoUnits, 1), baseline_unit_price: roundMetric(autoUnitPrice),
            baseline_units_growth_percent: roundMetric(baselineUnitsGrowthPercent, 2),
            baseline_unit_price_growth_percent: roundMetric(baselineUnitPriceGrowthPercent, 2),
            forecast_input: input ? { units_growth_percent: input.units_growth_percent == null ? null : Number(input.units_growth_percent), unit_price_growth_percent: input.unit_price_growth_percent == null ? null : Number(input.unit_price_growth_percent), note: input.note ?? '' } : undefined }); });
        return { key: category.label, label: category.label, sort_order: category.sort_order, series: [...actualValues, ...forecastValues] };
      }).sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, 'ja'));
    };
    const combineMaterialCategories = (departmentId: number, source: CategoryResult[]): CategoryResult[] => {
      const material = source.filter((category) => category.label.startsWith('__material__'));
      if (!material.length) return source;
      const series: TrendValue[] = [];
      periods.forEach((period, index) => {
        const parts = material.map((materialCategory) => {
          const productCategoryName = materialCategory.label.replace(/^__material__/, '');
          const productCategory = source.find((category) => category.label === productCategoryName);
          const currentMaterialSales = materialCategory.series[2]?.sales ?? 0;
          const currentProductUnits = productCategory?.series[2]?.units ?? 0;
          const materialCostPerProduct = currentProductUnits > 0 ? currentMaterialSales / currentProductUnits : 0;
          const productUnits = productCategory?.series[index]?.units ?? 0;
          const actualMaterialSales = materialCategory.series[index]?.sales ?? 0;
          return {
            sales: index < 3 ? actualMaterialSales : productUnits * materialCostPerProduct,
            units: productUnits,
            unit_price: materialCostPerProduct,
            source: materialCategory.series[index],
          };
        });
        const sales = parts.reduce((sum, value) => sum + value.sales, 0);
        const units = parts.reduce((sum, value) => sum + value.units, 0);
        series.push({
          period_key: period.key,
          sales: roundMetric(sales), units: roundMetric(units, 1), unit_price: roundMetric(units ? sales / units : 0),
          clinic_keys: Array.from(new Set(parts.flatMap((value) => value.source?.clinic_keys ?? []))),
          previous_full_clinic_keys: Array.from(new Set(parts.flatMap((value) => value.source?.previous_full_clinic_keys ?? []))),
          previous_same_period_clinic_keys: Array.from(new Set(parts.flatMap((value) => value.source?.previous_same_period_clinic_keys ?? []))),
        });
      });
      return [...source.filter((category) => !category.label.startsWith('__material__')), { key: '材料売上', label: '材料売上', sort_order: 1000, series }]
        .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, 'ja'));
    };
    // マスタ上の正式な拠点ID: 大阪=1、東京=2
    const tokyo = combineMaterialCategories(2, buildDepartment(2)); const osaka = combineMaterialCategories(1, buildDepartment(1));
    const categories = region === 'tokyo' ? tokyo : region === 'osaka' ? osaka : Array.from(new Set([...tokyo, ...osaka].map((c) => c.label))).map((label) => {
      const left = tokyo.find((c) => c.label === label); const right = osaka.find((c) => c.label === label);
      const series = periods.map((period, index): TrendValue => { const a = left?.series[index]; const b = right?.series[index]; const sales = (a?.sales ?? 0) + (b?.sales ?? 0); const units = (a?.units ?? 0) + (b?.units ?? 0);
        return { period_key: period.key, sales, units, unit_price: units ? roundMetric(sales / units) : 0,
          clinic_keys: [...(a?.clinic_keys ?? []), ...(b?.clinic_keys ?? [])],
          previous_full_clinic_keys: [...(a?.previous_full_clinic_keys ?? []), ...(b?.previous_full_clinic_keys ?? [])],
          previous_same_period_clinic_keys: [...(a?.previous_same_period_clinic_keys ?? []), ...(b?.previous_same_period_clinic_keys ?? [])] }; });
      return { key: label, label, sort_order: Math.min(left?.sort_order ?? 999999, right?.sort_order ?? 999999), series };
    }).sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label, 'ja'));
    return res.status(200).json({ as_of_date: asOfDate, current_fiscal_year: currentFiscalYear, current_progress_rate: roundMetric(currentProgressRate * 100, 1), region,
      region_label: region === 'tokyo' ? '東京' : region === 'osaka' ? '大阪' : '全社', editable: region !== 'all', scenario, history, periods, categories,
      methodology: '今期着地は2026年8月末実績を前年同期進捗率で通期換算します。翌年度以降は東京・大阪の品目ごとに、保存されたユーザー入力成長率を優先して前年予測へ積み上げます。材料売上は対象外です。',
      forecast_settings: { method: forecastMethod, landing_adjustment_percent: landingAdjustmentPercent, sales_growth_percent: salesGrowthPercent, units_growth_percent: unitsGrowthPercent } });
  } catch (error) { console.error('product category trends unexpected error:', error); return res.status(500).json({ error: 'product category trends failed' }); }
}
