import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../../api/_lib/auth.js';

const MONITORED_DEPARTMENT_IDS = [1, 2];
const EXCLUDED_CATEGORIES = new Set(['値引', '外注費', '材料売上', '未分類']);
const PAGE_SIZE = 1000;

function tokyoDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function parseMonth(value: unknown) {
  const raw = String(Array.isArray(value) ? value[0] : value ?? '').trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : tokyoDateString().slice(0, 7);
}

function addMonths(month: string, count: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parseStoredUnits(row: any) {
  const direct = Number(row.target_units ?? NaN);
  if (Number.isFinite(direct)) return direct;
  try {
    const notes = JSON.parse(String(row.notes ?? '{}'));
    const units = Number(notes.target_units ?? 0);
    return Number.isFinite(units) ? units : 0;
  } catch {
    return 0;
  }
}

function countOperatingDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let count = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (cursor.getUTCDay() !== 0) count += 1;
  }
  return count;
}

async function fetchAll(queryFactory: (from: number, to: number) => any) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryFactory(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchActualRows(startDate: string, endExclusive: string, dataKind: 'delivery' | 'order') {
  const headerTable = dataKind === 'order' ? 'ireba_order_headers' : 'ireba_delivery_headers';
  const detailTable = dataKind === 'order' ? 'ireba_order_details' : 'ireba_delivery_details';
  const dateColumn = dataKind === 'order' ? '受注日' : '納品日';
  const headers = await fetchAll((from, to) => supabaseAdmin
    .from(headerTable)
    .select('department_id,"内部コード"')
    .in('department_id', MONITORED_DEPARTMENT_IDS)
    .gte(dateColumn, startDate)
    .lt(dateColumn, endExclusive)
    .is('deleted_at', null)
    .range(from, to));

  const details: any[] = [];
  for (const departmentId of MONITORED_DEPARTMENT_IDS) {
    const internalCodes = Array.from(new Set(headers
      .filter((row) => Number(row.department_id) === departmentId)
      .map((row) => Number(row['内部コード']))
      .filter(Number.isFinite)));

    const chunks: number[][] = [];
    for (let index = 0; index < internalCodes.length; index += 500) {
      chunks.push(internalCodes.slice(index, index + 500));
    }
    for (let index = 0; index < chunks.length; index += 6) {
      const batch = await Promise.all(chunks.slice(index, index + 6).map((chunk) => fetchAll((from, to) => supabaseAdmin
        .from(detailTable)
        .select('department_id,"補綴物コード","金額","数量"')
        .eq('department_id', departmentId)
        .eq('明細区分', '1技工')
        .in('内部コード', chunk)
        .range(from, to))));
      batch.forEach((chunkRows) => details.push(...chunkRows));
    }
  }
  return details;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireDashboardAccess(profile, res)) return;

    const targetMonth = parseMonth(req.query?.month);
    const dataKind = req.query?.data_kind === 'order' ? 'order' : 'delivery';
    const nextMonth = addMonths(targetMonth, 1);
    const monthStart = `${targetMonth}-01`;
    const monthEnd = new Date(`${nextMonth}-01T00:00:00Z`);
    monthEnd.setUTCDate(0);
    const monthEndDate = monthEnd.toISOString().slice(0, 10);
    const today = tokyoDateString();
    const asOfDate = today < monthStart ? monthStart : today > monthEndDate ? monthEndDate : today;

    let budgetResult: any = await supabaseAdmin
      .from('product_department_budgets')
      .select('department_id,target_year_month,product_department_name,product_department_id,target_amount,target_units,notes')
      .in('department_id', MONITORED_DEPARTMENT_IDS)
      .eq('target_year_month', targetMonth);

    if (budgetResult.error && String(budgetResult.error.message ?? '').includes('target_units')) {
      budgetResult = await supabaseAdmin
        .from('product_department_budgets')
        .select('department_id,target_year_month,product_department_name,product_department_id,target_amount,notes')
        .in('department_id', MONITORED_DEPARTMENT_IDS)
        .eq('target_year_month', targetMonth);
    }
    if (budgetResult.error) throw budgetResult.error;

    const [monthsResult, mastersResult, departmentsResult, actualRows] = await Promise.all([
      supabaseAdmin
        .from('product_department_budgets')
        .select('target_year_month')
        .in('department_id', MONITORED_DEPARTMENT_IDS),
      supabaseAdmin
        .from('product_category_masters')
        .select('department_id,normalized_product_code,product_department_id')
        .in('department_id', MONITORED_DEPARTMENT_IDS),
      supabaseAdmin
        .from('product_departments')
        .select('id,department_id,name,sort_order')
        .in('department_id', MONITORED_DEPARTMENT_IDS),
      fetchActualRows(monthStart, `${nextMonth}-01`, dataKind),
    ]);
    if (monthsResult.error) throw monthsResult.error;
    if (mastersResult.error) throw mastersResult.error;
    if (departmentsResult.error) throw departmentsResult.error;

    const departmentNameById = new Map<string, string>();
    const sortOrderByName = new Map<string, number>();
    (departmentsResult.data ?? []).forEach((row: any) => {
      const name = String(row.name ?? '').trim();
      departmentNameById.set(String(row.id), name);
      sortOrderByName.set(name, Math.min(sortOrderByName.get(name) ?? 999999, Number(row.sort_order ?? 0)));
    });

    const categoryIdByProductCode = new Map<string, string>();
    (mastersResult.data ?? []).forEach((row: any) => {
      categoryIdByProductCode.set(
        `${row.department_id}|${String(row.normalized_product_code ?? '').trim()}`,
        String(row.product_department_id ?? ''),
      );
    });

    const metricByKey = new Map<string, { budgetSales: number; budgetUnits: number; actualSales: number; actualUnits: number }>();
    const ensureMetric = (departmentId: number, category: string) => {
      const key = `${departmentId}|${category}`;
      const current = metricByKey.get(key) ?? { budgetSales: 0, budgetUnits: 0, actualSales: 0, actualUnits: 0 };
      metricByKey.set(key, current);
      return current;
    };

    (budgetResult.data ?? []).forEach((row: any) => {
      const category = String(row.product_department_name ?? '').trim();
      if (!category || EXCLUDED_CATEGORIES.has(category)) return;
      const metric = ensureMetric(Number(row.department_id), category);
      metric.budgetSales += Number(row.target_amount ?? 0) || 0;
      metric.budgetUnits += parseStoredUnits(row);
    });

    actualRows.forEach((row: any) => {
      const departmentId = Number(row.department_id);
      const code = String(row['補綴物コード'] ?? '').trim();
      const categoryId = categoryIdByProductCode.get(`${departmentId}|${code}`) ?? '';
      const category = departmentNameById.get(categoryId) ?? '未分類';
      if (EXCLUDED_CATEGORIES.has(category)) return;
      const metric = ensureMetric(departmentId, category);
      metric.actualSales += Number(row['金額'] ?? 0) || 0;
      metric.actualUnits += Number(row['数量'] ?? 0) || 0;
    });

    const categories = Array.from(new Set(Array.from(metricByKey.keys()).map((key) => key.split('|').slice(1).join('|'))))
      .filter((name) => !EXCLUDED_CATEGORIES.has(name))
      .sort((left, right) => (sortOrderByName.get(left) ?? 999999) - (sortOrderByName.get(right) ?? 999999)
        || left.localeCompare(right, 'ja'));

    const buildRows = (departmentIds: number[]) => categories.map((category) => {
      const total = departmentIds.reduce((accumulator, departmentId) => {
        const metric = metricByKey.get(`${departmentId}|${category}`);
        if (metric) {
          accumulator.budgetSales += metric.budgetSales;
          accumulator.budgetUnits += metric.budgetUnits;
          accumulator.actualSales += metric.actualSales;
          accumulator.actualUnits += metric.actualUnits;
        }
        return accumulator;
      }, { budgetSales: 0, budgetUnits: 0, actualSales: 0, actualUnits: 0 });
      return { category, ...total };
    });

    const operatingDays = countOperatingDays(monthStart, monthEndDate);
    const elapsedOperatingDays = today < monthStart ? 0 : countOperatingDays(monthStart, asOfDate);

    return res.status(200).json({
      target_month: targetMonth,
      data_kind: dataKind,
      as_of_date: asOfDate,
      available_months: Array.from(new Set((monthsResult.data ?? []).map((row: any) => String(row.target_year_month)))).sort(),
      operating_days: operatingDays,
      elapsed_operating_days: elapsedOperatingDays,
      progress_rate: operatingDays > 0 ? Number(((elapsedOperatingDays / operatingDays) * 100).toFixed(1)) : 0,
      regions: {
        all: buildRows([1, 2]),
        tokyo: buildRows([2]),
        osaka: buildRows([1]),
      },
    });
  } catch (error) {
    console.error('product category progress error:', error);
    return res.status(500).json({ error: 'product category progress fetch failed' });
  }
}
