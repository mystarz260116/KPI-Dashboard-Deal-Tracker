import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, Loader2, LogOut, Save, Search, Send, Sparkles, Trash2, TrendingUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../lib/authFetch';

type MetricKey = 'sales' | 'units' | 'unit_price';
type ForecastMethod = 'linear' | 'fixed_growth';
type ForecastSettings = { method: ForecastMethod; landing_adjustment_percent: number; sales_growth_percent: number; units_growth_percent: number };
type RegionKey = 'all' | 'tokyo' | 'osaka';
type Period = { key: string; fiscal_year: number; label: string; short_label: string; kind: 'actual' | 'forecast'; is_partial: boolean };
type ForecastInput = { units_growth_percent: number | null; unit_price_growth_percent: number | null; note: string };
type TrendValue = { period_key: string; sales: number; units: number; unit_price: number; clinic_keys?: string[]; previous_full_clinic_keys?: string[]; previous_same_period_clinic_keys?: string[]; baseline_units?: number; baseline_unit_price?: number; baseline_units_growth_percent?: number; baseline_unit_price_growth_percent?: number; forecast_input?: ForecastInput };
type TotalTrendValue = TrendValue & { clinic_count: number; clinic_unit_price: number };
type Category = { key: string; label: string; series: TrendValue[] };
type HistoryRow = { id: number; input_id: string; changed_at: string; changed_by_name: string; department_id: number; category_name: string; fiscal_year: number; units_growth_percent: number | null; unit_price_growth_percent: number | null; baseline_units_growth_percent: number | null; baseline_unit_price_growth_percent: number | null; baseline_units: number | null; baseline_unit_price: number | null; adjusted_units: number | null; adjusted_unit_price: number | null; note: string };
type TrendData = { as_of_date: string; current_fiscal_year: number; current_progress_rate: number; methodology: string; region: RegionKey; region_label: string; editable: boolean; scenario: { id: string; status: 'draft' | 'published'; updated_at: string } | null; history: HistoryRow[]; periods: Period[]; categories: Category[] };
type EditValue = { units_growth_percent?: string; unit_price_growth_percent?: string; note?: string };

const DEFAULTS: ForecastSettings = { method: 'linear', landing_adjustment_percent: 100, sales_growth_percent: 0, units_growth_percent: 0 };
const FIFTY_BILLION_YEN = 5_000_000_000;
const REGION_LABELS: Record<RegionKey, string> = { all: '全社（合算）', tokyo: '東京', osaka: '大阪' };
const isForecastCategory = (category: Category) => category.key !== '材料売上';
const METRICS: Array<{ key: MetricKey; label: string; color: string }> = [
  { key: 'sales', label: '売上', color: '#4f46e5' },
  { key: 'units', label: '本数', color: '#0f9f8f' },
  { key: 'unit_price', label: '平均単価', color: '#d97706' },
];

function formatMetric(metric: MetricKey, value: number) {
  if (metric === 'units') return `${Number(value).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}本`;
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function formatGrowthRate(current: number, previous: number | undefined) {
  if (previous === undefined || previous === 0) return null;
  return ((current / previous) - 1) * 100;
}

function TrendChart({ metric, periods, series }: { metric: typeof METRICS[number]; periods: Period[]; series: TrendValue[] }) {
  const byPeriod = new Map(series.map((value) => [value.period_key, value]));
  const chartData = periods.map((period) => ({
    label: period.short_label.replace('年度着地予測', '着地予測').replace('年度予測', '予測'),
    value: byPeriod.get(period.key)?.[metric.key] ?? 0,
  }));
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <h3 className="mb-3 text-sm font-black text-zinc-800">{metric.label}</h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis width={66} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(value) => new Intl.NumberFormat('ja-JP', { notation: 'compact' }).format(Number(value))} />
            <Tooltip formatter={(value: number | string) => [formatMetric(metric.key, Number(value)), metric.label]} />
            <Line type="monotone" dataKey="value" stroke={metric.color} strokeWidth={3} dot={{ r: 4, fill: metric.color }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function ProductCategoryTrends() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<TrendData | null>(null);
  const applied = DEFAULTS;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [region, setRegion] = useState<RegionKey>('all');
  const [edits, setEdits] = useState<Record<string, EditValue>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [search, setSearch] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fiftyBillionMode, setFiftyBillionMode] = useState(false);
  const [openCategoryNotes, setOpenCategoryNotes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [regionMessage, setRegionMessage] = useState('');
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const query = new URLSearchParams({
          path: 'product-category-trends',
          forecast_method: applied.method,
          landing_adjustment_percent: String(applied.landing_adjustment_percent),
          sales_growth_percent: String(applied.sales_growth_percent),
          units_growth_percent: String(applied.units_growth_percent),
          region,
        });
        const response = await authFetch(`/api/kpi?${query}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('fetch failed');
        const payload = await response.json() as TrendData;
        if (!cancelled) {
          setData(payload);
          setSelected((current) => current.size ? current : new Set(payload.categories.map((category) => category.key)));
          if (hasLoadedRef.current) setRegionMessage(`${REGION_LABELS[payload.region]}へ切り替えました`);
          hasLoadedRef.current = true;
        }
      } catch (loadError) {
        console.error(loadError); if (!cancelled) setError('商品カテゴリトレンドの取得に失敗しました');
      } finally { if (!cancelled) setLoading(false); }
    };
    void load(); return () => { cancelled = true; };
  }, [applied, region, reloadNonce]);

  useEffect(() => {
    if (!regionMessage) return;
    const timer = window.setTimeout(() => setRegionMessage(''), 2400);
    return () => window.clearTimeout(timer);
  }, [regionMessage]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (Object.keys(edits).length) event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [edits]);

  // マスタ上の正式な拠点ID: 大阪=1、東京=2
  const departmentId = region === 'tokyo' ? 2 : region === 'osaka' ? 1 : null;
  const effectiveCategories = useMemo(() => (data?.categories ?? []).map((category) => {
    const hasUnsavedEdit = data?.periods.some((period) => edits[`${departmentId}\u0000${category.key}\u0000${period.fiscal_year}`]);
    if (!hasUnsavedEdit) return category;
    const series = category.series.map((value) => ({ ...value }));
    for (let index = 3; index < series.length; index += 1) {
      const period = data?.periods[index];
      const previous = series[index - 1];
      const rawPrevious = category.series[index - 1];
      const rawCurrent = category.series[index];
      if (!period || !previous) continue;
      const editKey = `${departmentId}\u0000${category.key}\u0000${period.fiscal_year}`;
      const edit = edits[editKey];
      const saved = rawCurrent.forecast_input;
      const unitsText = edit?.units_growth_percent ?? (saved?.units_growth_percent == null ? '' : String(saved.units_growth_percent));
      const priceText = edit?.unit_price_growth_percent ?? (saved?.unit_price_growth_percent == null ? '' : String(saved.unit_price_growth_percent));
      // 保存済みの手入力値から自動成長率を逆算すると、過年度の編集が混ざる。
      // APIが保持する未調整の自動予測成長率を正として使う。
      const autoUnitsGrowth = rawCurrent.baseline_units_growth_percent
        ?? (rawPrevious.units ? (rawCurrent.units / rawPrevious.units - 1) * 100 : 0);
      const autoPriceGrowth = rawCurrent.baseline_unit_price_growth_percent
        ?? (rawPrevious.unit_price ? (rawCurrent.unit_price / rawPrevious.unit_price - 1) * 100 : 0);
      const unitsGrowth = unitsText === '' ? autoUnitsGrowth : Number(unitsText);
      const priceGrowth = priceText === '' ? autoPriceGrowth : Number(priceText);
      const baselineUnits = Math.max(0, previous.units * (1 + autoUnitsGrowth / 100));
      const baselineUnitPrice = Math.max(0, previous.unit_price * (1 + autoPriceGrowth / 100));
      const units = Math.max(0, previous.units * (1 + (Number.isFinite(unitsGrowth) ? unitsGrowth : autoUnitsGrowth) / 100));
      const unitPrice = Math.max(0, previous.unit_price * (1 + (Number.isFinite(priceGrowth) ? priceGrowth : autoPriceGrowth) / 100));
      series[index] = { ...rawCurrent, units, unit_price: unitPrice, sales: units * unitPrice,
        baseline_units: baselineUnits, baseline_unit_price: baselineUnitPrice,
        baseline_units_growth_percent: autoUnitsGrowth, baseline_unit_price_growth_percent: autoPriceGrowth,
        forecast_input: { units_growth_percent: unitsText === '' ? null : Number(unitsText), unit_price_growth_percent: priceText === '' ? null : Number(priceText), note: edit?.note ?? saved?.note ?? '' } };
    }
    return { ...category, series };
  }), [data, departmentId, edits]);

  const fiftyBillionScale = useMemo(() => {
    if (!fiftyBillionMode || !data?.periods.length) return 1;
    const finalPeriodKey = data.periods[data.periods.length - 1].key;
    const finalSales = effectiveCategories.filter((category) => selected.has(category.key) && isForecastCategory(category)).reduce((sum, category) =>
      sum + (category.series.find((value) => value.period_key === finalPeriodKey)?.sales ?? 0), 0);
    return finalSales > 0 ? FIFTY_BILLION_YEN / finalSales : 1;
  }, [data, effectiveCategories, fiftyBillionMode, selected]);

  const projectedCategories = useMemo(() => {
    if (!fiftyBillionMode || fiftyBillionScale === 1) return effectiveCategories;
    return effectiveCategories.map((category) => {
      if (!selected.has(category.key) || !isForecastCategory(category)) return category;
      return { ...category, series: category.series.map((value, index) => {
        if (index < 3) return value;
        const units = value.units * fiftyBillionScale;
        return { ...value, units, sales: units * value.unit_price };
      }) };
    });
  }, [effectiveCategories, fiftyBillionMode, fiftyBillionScale, selected]);

  const filtered = useMemo(() => projectedCategories.filter((category) => category.label.toLowerCase().includes(search.trim().toLowerCase())), [projectedCategories, search]);
  const displayed = projectedCategories.filter((category) => selected.has(category.key));
  const selectedForecastCount = projectedCategories.filter((category) => selected.has(category.key) && isForecastCategory(category)).length;
  const selectedTotalSeries = useMemo<TotalTrendValue[]>(() => {
    if (!data) return [];
    const selectedCategories = projectedCategories.filter((category) => selected.has(category.key) && isForecastCategory(category));
    const actualClinicCounts = data.periods.slice(0, 3).map((period) => new Set(
      selectedCategories.flatMap((category) => category.series.find((item) => item.period_key === period.key)?.clinic_keys ?? [])
    ).size);
    const currentValues = selectedCategories.map((category) => category.series[2]).filter(Boolean);
    const previousFullClinicCount = new Set(currentValues.flatMap((value) => value.previous_full_clinic_keys ?? [])).size || (actualClinicCounts[1] ?? 0);
    const previousSamePeriodClinicCount = new Set(currentValues.flatMap((value) => value.previous_same_period_clinic_keys ?? [])).size;
    const currentSamePeriodClinicCount = actualClinicCounts[2] ?? 0;
    const clinicLanding = previousSamePeriodClinicCount > 0
      ? Math.max(currentSamePeriodClinicCount, Math.round(previousFullClinicCount * currentSamePeriodClinicCount / previousSamePeriodClinicCount))
      : Math.max(currentSamePeriodClinicCount, previousFullClinicCount);
    const clinicCountBase = [
      actualClinicCounts[0] ?? 0,
      actualClinicCounts[1] ?? 0,
      clinicLanding,
    ];
    const totalsByPeriod = data.periods.map((period) => selectedCategories.reduce((sum, category) => {
        const value = category.series.find((item) => item.period_key === period.key);
        return { sales: sum.sales + (value?.sales ?? 0), units: sum.units + (value?.units ?? 0) };
      }, { sales: 0, units: 0 }));
    const historicalMonthlyClinicPrices = clinicCountBase.map((clinicCount, index) =>
      clinicCount > 0 ? totalsByPeriod[index].sales / clinicCount / 12 : 0
    );
    // 将来の医院単価は急激な実績変動を引き継がず、年率2%で安定成長させる。
    // 予測売上との差分は下段の取引医院数で吸収する。
    const monthlyClinicPriceAnnualGrowth = 0.02;
    let forecastMonthlyClinicPrice = historicalMonthlyClinicPrices[2] ?? 0;
    return data.periods.map((period, periodIndex) => {
      const totals = totalsByPeriod[periodIndex];
      if (periodIndex > 2) forecastMonthlyClinicPrice *= 1 + monthlyClinicPriceAnnualGrowth;
      const clinicCount = periodIndex <= 2
        ? clinicCountBase[periodIndex]
        : forecastMonthlyClinicPrice > 0 ? totals.sales / forecastMonthlyClinicPrice / 12 : 0;
      return {
        period_key: period.key,
        sales: totals.sales,
        units: totals.units,
        unit_price: totals.units > 0 ? totals.sales / totals.units : 0,
        clinic_count: clinicCount,
        clinic_unit_price: periodIndex <= 2
          ? (clinicCount > 0 ? totals.sales / clinicCount / 12 : 0)
          : forecastMonthlyClinicPrice,
      };
    });
  }, [data, projectedCategories, selected]);
  const toggle = (key: string) => setSelected((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const updateEdit = (category: string, fiscalYear: number, patch: EditValue) => {
    if (!departmentId) return;
    const key = `${departmentId}\u0000${category}\u0000${fiscalYear}`;
    setEdits((current) => ({ ...current, [key]: { ...current[key], ...patch } })); setSaveMessage('');
  };
  const saveForecast = async (status: 'draft' | 'published') => {
    if (!data || !departmentId) return;
    setSaving(true); setError(''); setSaveMessage('');
    try {
      const inputs = Object.keys(edits).filter((key) => key.startsWith(`${departmentId}\u0000`)).map((key) => {
        const [, categoryName, fiscalYearText] = key.split('\u0000'); const category = effectiveCategories.find((item) => item.key === categoryName);
        const periodIndex = data.periods.findIndex((period) => period.fiscal_year === Number(fiscalYearText)); const value = category?.series[periodIndex]; const input = value?.forecast_input;
        return { department_id: departmentId, category_name: categoryName, fiscal_year: Number(fiscalYearText),
          units_growth_percent: input?.units_growth_percent ?? null, unit_price_growth_percent: input?.unit_price_growth_percent ?? null, note: input?.note ?? '',
          baseline_units_growth_percent: value?.baseline_units_growth_percent ?? null, baseline_unit_price_growth_percent: value?.baseline_unit_price_growth_percent ?? null,
          baseline_units: value?.baseline_units ?? null, baseline_unit_price: value?.baseline_unit_price ?? null,
          adjusted_units: value?.units ?? null, adjusted_unit_price: value?.unit_price ?? null };
      });
      const response = await authFetch('/api/kpi?path=product-category-trends', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: data.scenario?.id, as_of_date: data.as_of_date, status, inputs }) });
      if (!response.ok) throw new Error('save failed');
      const saved = await response.json();
      setData((current) => current ? { ...current, scenario: { id: saved.scenario_id, status: saved.status, updated_at: saved.updated_at } } : current);
      setEdits({}); setSaveMessage(status === 'published' ? '予測を確定しました' : '下書きを保存しました'); setReloadNonce((value) => value + 1);
    } catch (saveError) { console.error(saveError); setError('予測の保存に失敗しました'); } finally { setSaving(false); }
  };
  const deleteHistory = async (historyId: number) => {
    if (!window.confirm('この手入力調整を削除し、自動予測へ戻しますか？')) return;
    setSaving(true); setError('');
    try {
      const response = await authFetch('/api/kpi?path=product-category-trends', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history_id: historyId }) });
      if (!response.ok) throw new Error('delete failed');
      setSaveMessage('手入力調整を削除し、自動予測へ戻しました'); setReloadNonce((value) => value + 1);
    } catch (deleteError) { console.error(deleteError); setError('編集履歴の削除に失敗しました'); } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-[#eef2f7] p-4 sm:p-8">
      {loading && data && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4 backdrop-blur-[2px]" role="status" aria-live="polite">
        <div className="flex min-w-[280px] flex-col items-center rounded-2xl border border-white/70 bg-white px-8 py-7 text-center shadow-2xl">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50"><span className="absolute inset-0 animate-ping rounded-full bg-indigo-200/60" /><Loader2 className="relative h-8 w-8 animate-spin text-indigo-600" /></div>
          <p className="mt-4 text-base font-black text-zinc-900">{REGION_LABELS[region]}を読み込み中</p>
          <p className="mt-1 text-xs font-bold text-zinc-500">予測データを切り替えています…</p>
        </div>
      </div>}
      <div className="mx-auto max-w-[1700px]">
        <header className="mb-6 flex items-center justify-between">
          <button type="button" onClick={() => navigate('/clinic-assets')} className="flex items-center text-sm font-bold text-zinc-500 hover:text-zinc-900"><ArrowLeft className="mr-1 h-4 w-4" />医院アセット</button>
          <div className="text-center"><h1 className="text-2xl font-black">商品カテゴリ別 8カ年トレンド</h1><p className="mt-1 text-sm text-zinc-500">2024年度から2031年度末（2032年3月）までの実績と予測</p></div>
          <button type="button" onClick={async () => { await logout(); navigate('/login'); }} className="rounded-lg bg-white p-3 text-zinc-400 shadow-sm" aria-label="ログアウト"><LogOut className="h-5 w-5" /></button>
        </header>

        <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div><p className="text-xs font-black uppercase tracking-wider text-zinc-400">表示拠点</p><div className="mt-2 flex rounded-xl bg-zinc-100 p-1">{([['all', '全社（合算）'], ['tokyo', '東京'], ['osaka', '大阪']] as const).map(([key, label]) => <button key={key} type="button" disabled={loading} aria-pressed={region === key} onClick={() => { if (key === region) return; setRegionMessage(''); setRegion(key); setSaveMessage(''); }} className={`inline-flex min-w-24 items-center justify-center gap-2 rounded-lg px-5 py-2 text-sm font-black transition disabled:cursor-wait ${region === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'} ${loading ? 'opacity-70' : ''}`}>{loading && region === key && <Loader2 className="h-4 w-4 animate-spin" />}{label}</button>)}</div></div>
          <div className="flex items-center gap-3">
            {data?.scenario && <div className="text-right text-xs text-zinc-500"><p className="font-bold">{data.scenario.status === 'published' ? '確定済み' : '下書き'}</p><p>{new Date(data.scenario.updated_at).toLocaleString('ja-JP')}</p></div>}
            {region === 'all' ? <span className="rounded-xl bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700">東京＋大阪の自動合算</span> : <><button type="button" disabled={saving} onClick={() => void saveForecast('draft')} className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-black disabled:opacity-50"><Save className="h-4 w-4" />下書き保存</button><button type="button" disabled={saving} onClick={() => void saveForecast('published')} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}予測を確定</button></>}
          </div>
          {saveMessage && <p className="w-full text-right text-sm font-bold text-emerald-600">{saveMessage}</p>}
          {regionMessage && <p className="flex w-full items-center justify-end gap-1.5 text-sm font-black text-emerald-600" role="status"><Check className="h-4 w-4" />{regionMessage}</p>}
        </section>

        {error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-600">{error}</div>}
        {loading && !data ? <div className="flex min-h-[500px] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-indigo-600" /></div> : data && <>
          <section className="mb-6 rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><TrendingUp className="h-5 w-5" /></div><div><p className="font-black">集計基準日：{data.as_of_date}</p><p className="mt-1 text-sm leading-6 text-zinc-500">{data.methodology}</p></div></div><span className="shrink-0 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">進行期経過率 {data.current_progress_rate}%</span></div>
          </section>

          <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-black">カテゴリフィルタ</h2><p className="text-sm text-zinc-500">複数カテゴリを選択できます（{selected.size}/{data.categories.length}件選択中）</p></div><div className="flex gap-2"><button onClick={() => setSelected(new Set(data.categories.map((category) => category.key)))} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white">すべて選択</button><button onClick={() => setSelected(new Set())} className="rounded-lg border px-4 py-2 text-sm font-bold">選択解除</button></div></div>
            <div className="relative mt-4 max-w-xl"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="カテゴリ名を検索" className="w-full rounded-lg border py-2.5 pl-10 pr-4 text-sm" /></div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{filtered.map((category) => <button key={category.key} onClick={() => toggle(category.key)} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-bold ${selected.has(category.key) ? 'border-indigo-200 bg-indigo-50 text-indigo-800' : 'text-zinc-500'}`}><span className={`flex h-5 w-5 items-center justify-center rounded border ${selected.has(category.key) ? 'bg-indigo-600 text-white' : ''}`}>{selected.has(category.key) && <Check className="h-3.5 w-3.5" />}</span>{category.label}</button>)}</div>
          </section>

          <section className="mb-6 overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm">
            <div className="flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
              <div><h2 className="text-lg font-black">選択品目 合計</h2><p className="mt-0.5 text-xs text-indigo-100">予測対象の{selectedForecastCount}品目を期間ごとに集計（材料売上は対象外）{fiftyBillionMode ? `・本数 ${fiftyBillionScale.toFixed(2)}倍` : ''}</p></div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setFiftyBillionMode((enabled) => !enabled)} disabled={!selectedForecastCount} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${fiftyBillionMode ? 'bg-amber-300 text-amber-950 hover:bg-amber-200' : 'bg-white text-indigo-700 hover:bg-indigo-50'}`}><Sparkles className="h-4 w-4" />{fiftyBillionMode ? '通常予測に戻す' : '50億予測'}</button>
                <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">平均単価＝合計売上 ÷ 合計本数</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] border-collapse text-sm">
                <thead><tr className="bg-zinc-100 text-zinc-600"><th className="border-r px-4 py-3 text-left font-black">指標</th>{data.periods.map((period) => <th key={period.key} className={`min-w-36 px-4 py-3 text-right font-black ${period.kind === 'forecast' ? 'bg-indigo-50 text-indigo-700' : ''}`}>{period.label}{period.is_partial && <span className="block text-[10px] text-amber-600">期末着地予測</span>}</th>)}</tr></thead>
                <tbody>{METRICS.map((metric) => <tr key={metric.key} className="border-t"><th className="border-r px-4 py-3 text-left font-black text-zinc-700">{metric.label}</th>{data.periods.map((period) => { const value = selectedTotalSeries.find((item) => item.period_key === period.key); return <td key={period.key} className={`px-4 py-3 text-right font-black ${period.kind === 'forecast' ? 'bg-indigo-50/60' : ''}`}>{formatMetric(metric.key, value?.[metric.key] ?? 0)}</td>; })}</tr>)}</tbody>
                <tbody className="border-t-2 border-violet-200 bg-violet-50/30">
                  {([
                    ['本数成長率', 'units'],
                    ['平均単価成長率', 'unit_price'],
                  ] as const).map(([label, key]) => <tr key={key} className="border-t"><th className="border-r px-4 py-3 text-left font-black text-zinc-700">{label}<span className="ml-1 text-[10px] font-bold text-zinc-400">前年比</span></th>{data.periods.map((period, index) => {
                    const current = selectedTotalSeries[index]?.[key] ?? 0;
                    const growth = formatGrowthRate(current, selectedTotalSeries[index - 1]?.[key]);
                    return <td key={period.key} className={`px-4 py-3 text-right font-black ${period.kind === 'forecast' ? 'bg-indigo-50/60' : ''} ${growth === null ? 'text-zinc-400' : growth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{growth === null ? '—' : `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`}</td>;
                  })}</tr>)}
                </tbody>
                <tbody className="border-t-2 border-indigo-200">
                  <tr><th className="border-r px-4 py-3 text-left font-black text-zinc-700">取引医院数</th>{data.periods.map((period) => { const value = selectedTotalSeries.find((item) => item.period_key === period.key); return <td key={period.key} className={`px-4 py-3 text-right font-black ${period.kind === 'forecast' ? 'bg-indigo-50/60' : ''}`}>{Math.round(value?.clinic_count ?? 0).toLocaleString('ja-JP')}院</td>; })}</tr>
                  <tr className="border-t"><th className="border-r px-4 py-3 text-left font-black text-zinc-700">月間医院単価<br /><span className="text-[10px] font-bold text-zinc-400">将来成長率は年率2%固定</span></th>{data.periods.map((period) => { const value = selectedTotalSeries.find((item) => item.period_key === period.key); return <td key={period.key} className={`px-4 py-3 text-right font-black ${period.kind === 'forecast' ? 'bg-indigo-50/60' : ''}`}>¥{Math.round(value?.clinic_unit_price ?? 0).toLocaleString('ja-JP')}</td>; })}</tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <button type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)} className={`flex w-full items-center justify-between bg-zinc-50 px-5 py-4 text-left transition hover:bg-zinc-100 ${historyOpen ? 'border-b' : ''}`}>
              <div><h2 className="text-lg font-black">手入力の編集履歴</h2><p className="text-sm text-zinc-500">保存時点の自動予測と比較し、上乗せ・下振れを記録します</p></div>
              <div className="flex items-center gap-3"><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-zinc-500 shadow-sm">最新200件</span><ChevronDown className={`h-5 w-5 text-zinc-500 transition-transform ${historyOpen ? 'rotate-180' : ''}`} /></div>
            </button>
            {historyOpen && <div className="overflow-x-auto"><table className="w-full min-w-[1200px] text-sm">
              <thead className="bg-zinc-100 text-xs text-zinc-500"><tr><th className="px-4 py-3 text-left">更新日時・更新者</th><th className="px-4 py-3 text-left">拠点／品目／年度</th><th className="px-4 py-3 text-left">本数成長率</th><th className="px-4 py-3 text-left">本数への影響</th><th className="px-4 py-3 text-left">平均単価成長率</th><th className="px-4 py-3 text-left">単価への影響</th><th className="px-4 py-3 text-left">備考</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
              <tbody>{(data.history ?? []).filter((row) => (region === 'all' || row.department_id === departmentId) && selected.has(row.category_name)).slice(0, 50).map((row) => {
                const unitsPoint = row.units_growth_percent == null || row.baseline_units_growth_percent == null ? null : row.units_growth_percent - row.baseline_units_growth_percent;
                const pricePoint = row.unit_price_growth_percent == null || row.baseline_unit_price_growth_percent == null ? null : row.unit_price_growth_percent - row.baseline_unit_price_growth_percent;
                // 影響値は、過年度の手入力を共通の前年値として当年度の成長率差だけを比較する。
                // これにより「成長率を上げたのに本数影響がマイナス」といった逆転を防ぐ。
                const unitsManualFactor = row.units_growth_percent == null ? null : 1 + row.units_growth_percent / 100;
                const priceManualFactor = row.unit_price_growth_percent == null ? null : 1 + row.unit_price_growth_percent / 100;
                const unitsDelta = row.adjusted_units == null || unitsPoint == null || unitsManualFactor == null || unitsManualFactor === 0
                  ? null : row.adjusted_units / unitsManualFactor * unitsPoint / 100;
                const priceDelta = row.adjusted_unit_price == null || pricePoint == null || priceManualFactor == null || priceManualFactor === 0
                  ? null : row.adjusted_unit_price / priceManualFactor * pricePoint / 100;
                const tone = (value: number | null) => value == null ? 'text-zinc-400' : value >= 0 ? 'text-emerald-600' : 'text-rose-600';
                const signed = (value: number | null, suffix = '') => value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toLocaleString('ja-JP', { maximumFractionDigits: 1 })}${suffix}`;
                return <tr key={row.id} className="border-t align-top"><td className="px-4 py-3"><p className="font-bold">{new Date(row.changed_at).toLocaleString('ja-JP')}</p><p className="text-xs text-zinc-500">{row.changed_by_name}</p></td><td className="px-4 py-3"><p className="font-black">{row.department_id === 2 ? '東京' : '大阪'}・{row.category_name}</p><p className="text-xs text-zinc-500">{row.fiscal_year}年度</p></td>
                  <td className="px-4 py-3"><p className="text-xs text-zinc-500">自動 {row.baseline_units_growth_percent == null ? '—' : `${row.baseline_units_growth_percent.toFixed(1)}%`} → 手入力 {row.units_growth_percent == null ? '自動' : `${row.units_growth_percent.toFixed(1)}%`}</p><p className={`mt-1 font-black ${tone(unitsPoint)}`}>{signed(unitsPoint, 'pt')}</p></td>
                  <td className={`px-4 py-3 font-black ${tone(unitsDelta)}`}>{signed(unitsDelta, '本')}</td>
                  <td className="px-4 py-3"><p className="text-xs text-zinc-500">自動 {row.baseline_unit_price_growth_percent == null ? '—' : `${row.baseline_unit_price_growth_percent.toFixed(1)}%`} → 手入力 {row.unit_price_growth_percent == null ? '自動' : `${row.unit_price_growth_percent.toFixed(1)}%`}</p><p className={`mt-1 font-black ${tone(pricePoint)}`}>{signed(pricePoint, 'pt')}</p></td>
                  <td className={`px-4 py-3 font-black ${tone(priceDelta)}`}>{priceDelta == null ? '—' : `${priceDelta >= 0 ? '+' : ''}¥${Math.round(priceDelta).toLocaleString('ja-JP')}`}</td><td className="max-w-xs whitespace-pre-wrap px-4 py-3 text-xs text-zinc-600">{row.note || '—'}</td><td className="px-4 py-3 text-right">{region !== 'all' && <button type="button" disabled={saving} onClick={() => void deleteHistory(row.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-100 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />削除</button>}</td></tr>;
              })}{!(data.history ?? []).some((row) => (region === 'all' || row.department_id === departmentId) && selected.has(row.category_name)) && <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-zinc-400">選択中の品目に該当する編集履歴はありません</td></tr>}</tbody>
            </table></div>}
          </section>

          <div className="space-y-6">{displayed.map((category) => {
            if (category.key === '材料売上') return <section key={category.key} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">材料売上</h2><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-500">現在予測対象外</span></div>
              <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50"><div className="text-center"><p className="text-4xl font-black text-zinc-300">N/A</p><p className="mt-2 text-sm font-bold text-zinc-500">材料売上は予測・合計・50億モードに含めていません</p></div></div>
            </section>;
            const valueByPeriod = new Map(category.series.map((value) => [value.period_key, value]));
            return <section key={category.key} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{category.label}</h2>{category.key === '材料売上' ? <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">商品予測本数 × 直近1本当たり材料原価</span> : data.editable && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">予測年度を編集できます</span>}</div>
              <div className="grid gap-4 xl:grid-cols-3">{METRICS.map((metric) => <TrendChart key={metric.key} metric={metric} periods={data.periods} series={category.series} />)}</div>
              <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-200">
                <table className="w-full min-w-[940px] border-collapse text-sm">
                  <thead><tr className="bg-zinc-100 text-zinc-600"><th className="border-r px-4 py-3 text-left font-black">指標</th>{data.periods.map((period) => <th key={period.key} className={`min-w-36 px-4 py-3 text-right font-black ${period.kind === 'forecast' ? 'bg-indigo-50 text-indigo-700' : ''}`}>{period.label}{period.is_partial && <span className="block text-[10px] text-amber-600">期末着地予測</span>}</th>)}</tr></thead>
                  <tbody>{METRICS.map((metric) => <tr key={metric.key} className="border-t"><th className="border-r px-4 py-3 text-left font-black text-zinc-700">{metric.label}</th>{data.periods.map((period) => <td key={period.key} className={`px-4 py-3 text-right font-bold ${period.kind === 'forecast' ? 'bg-indigo-50/60' : ''}`}>{formatMetric(metric.key, valueByPeriod.get(period.key)?.[metric.key] ?? 0)}</td>)}</tr>)}</tbody>
                  <tbody className="border-t-2 border-violet-200">{([
                    ['本数成長率', 'units_growth_percent', 'units'],
                    ['平均単価成長率', 'unit_price_growth_percent', 'unit_price'],
                  ] as const).map(([label, inputKey, metricKey]) => <tr key={inputKey} className="border-t"><th className="border-r px-4 py-3 text-left font-black text-zinc-700">{label}<span className="ml-1 text-[10px] text-zinc-400">前年比</span></th>{data.periods.map((period, index) => {
                    const current = category.series[index]?.[metricKey] ?? 0; const growth = formatGrowthRate(current, category.series[index - 1]?.[metricKey]);
                    const input = category.series[index]?.forecast_input?.[inputKey]; const isMaterialForecast = category.key === '材料売上' && index >= 3; const editable = data.editable && index >= 3 && category.key !== '材料売上';
                    if (isMaterialForecast && inputKey === 'unit_price_growth_percent') return <td key={period.key} className="bg-indigo-50/60 px-3 py-2 text-right font-black text-zinc-400">—</td>;
                    return <td key={period.key} className={`px-3 py-2 text-right font-black ${period.kind === 'forecast' ? 'bg-indigo-50/60' : ''}`}>{editable ? <div className="relative ml-auto w-24"><input type="number" step="0.1" value={input ?? ''} placeholder={growth == null ? '' : growth.toFixed(1)} onChange={(event) => updateEdit(category.key, period.fiscal_year, { [inputKey]: event.target.value })} className="w-full rounded-lg border border-indigo-200 bg-white py-2 pl-2 pr-6 text-right font-black text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-300" /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">%</span></div> : <span className={growth == null ? 'text-zinc-400' : growth >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{growth == null ? '—' : `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`}</span>}</td>;
                  })}</tr>)}</tbody>
                </table>
              </div>
              {data.editable && category.key !== '材料売上' && <div className="mt-3 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/40">
                <button type="button" aria-expanded={openCategoryNotes.has(category.key)} onClick={() => setOpenCategoryNotes((current) => { const next = new Set(current); next.has(category.key) ? next.delete(category.key) : next.add(category.key); return next; })} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-black text-amber-900 transition hover:bg-amber-50">
                  <span>変更理由を入力 <span className="ml-2 text-xs font-bold text-amber-700">保存後は編集履歴に表示されます</span></span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${openCategoryNotes.has(category.key) ? 'rotate-180' : ''}`} />
                </button>
                {openCategoryNotes.has(category.key) && <div className="grid gap-3 border-t border-amber-200 p-4 md:grid-cols-2 xl:grid-cols-5">{data.periods.map((period, index) => index >= 3 && <label key={period.key} className="block"><span className="mb-1 block text-xs font-black text-zinc-600">{period.short_label}</span><textarea rows={3} value={category.series[index]?.forecast_input?.note ?? ''} onChange={(event) => updateEdit(category.key, period.fiscal_year, { note: event.target.value })} placeholder="変更理由・前提を入力" className="w-full resize-y rounded-lg border border-amber-200 bg-white p-2 text-xs outline-none focus:ring-2 focus:ring-amber-300" /></label>)}</div>}
              </div>}
            </section>;
          })}</div>
        </>}
      </div>
    </div>
  );
}
