import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../lib/authFetch';
import logoImg from '../assets/M.png';

type ProgressRow = { category: string; budgetSales: number; budgetUnits: number; actualSales: number; actualUnits: number };
type ProgressData = {
  target_month: string;
  data_kind: 'delivery' | 'order';
  as_of_date: string;
  available_months: string[];
  operating_days: number;
  elapsed_operating_days: number;
  progress_rate: number;
  regions: { all: ProgressRow[]; tokyo: ProgressRow[]; osaka: ProgressRow[] };
};
type Metric = 'sales' | 'units';

const REGION_STYLES = {
  all: { label: '全社', bar: 'from-indigo-600 to-violet-600', tint: 'bg-indigo-50 text-indigo-700' },
  tokyo: { label: '東京', bar: 'from-amber-500 to-orange-500', tint: 'bg-amber-50 text-amber-700' },
  osaka: { label: '大阪', bar: 'from-sky-600 to-cyan-500', tint: 'bg-sky-50 text-sky-700' },
} as const;

function formatMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${year}年${monthNumber}月`;
}

function formatValue(value: number, metric: Metric) {
  const normalized = metric === 'sales' ? Math.round(value / 1000) : Math.round(value);
  return normalized.toLocaleString('ja-JP');
}

function MetricTable({ region, metric, rows }: { region: keyof typeof REGION_STYLES; metric: Metric; rows: ProgressRow[] }) {
  const style = REGION_STYLES[region];
  const normalizedRows = rows.map((row) => {
    const budget = metric === 'sales' ? row.budgetSales : row.budgetUnits;
    const actual = metric === 'sales' ? row.actualSales : row.actualUnits;
    return { category: row.category, budget, actual, difference: actual - budget };
  });
  const total = normalizedRows.reduce((sum, row) => ({
    budget: sum.budget + row.budget,
    actual: sum.actual + row.actual,
    difference: sum.difference + row.difference,
  }), { budget: 0, actual: 0, difference: 0 });
  const renderRate = (budget: number, actual: number) => budget > 0 ? `${((actual / budget) * 100).toFixed(1)}%` : '—';

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-white/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.08)] ring-1 ring-zinc-200/70 transition-shadow hover:shadow-[0_12px_30px_rgba(15,23,42,0.12)] xl:flex xl:h-full xl:min-h-0 xl:flex-col">
      <div className={`flex items-center justify-between bg-gradient-to-r ${style.bar} px-3 py-1 text-xs font-black tracking-wide text-white sm:text-sm`}>
        <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-white/90 shadow-[0_0_0_3px_rgba(255,255,255,0.2)]" />{style.label}</span>
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-[8px] font-bold tracking-normal backdrop-blur-sm xl:text-[9px]">{metric === 'sales' ? '金額ベース' : '数量ベース'}</span>
      </div>
      <div className="overflow-x-auto xl:min-h-0 xl:flex-1">
        <table className="w-full min-w-[540px] table-fixed border-collapse text-[11px] tabular-nums xl:h-full xl:min-w-0 xl:text-[10px] xl:leading-tight 2xl:text-[11px]">
          <thead>
            <tr className="bg-zinc-50/90 text-zinc-500">
              <th className="w-[34%] border-b border-r border-zinc-200 px-2 py-1.5 text-left font-black">品目 <span className="ml-1 text-[8px] font-medium text-zinc-400">{metric === 'sales' ? '千円' : '本・床'}</span></th>
              <th className="border-b border-r border-zinc-200 px-1 py-1.5 text-right font-bold">予算</th>
              <th className="border-b border-r border-zinc-200 px-1 py-1.5 text-right font-bold">実績</th>
              <th className="border-b border-r border-zinc-200 px-1 py-1.5 text-right font-bold">差分</th>
              <th className="border-b border-zinc-200 px-1 py-1.5 text-right font-bold">達成率</th>
            </tr>
          </thead>
          <tbody>
            {normalizedRows.map((row) => (
              <tr key={row.category} className="border-b border-zinc-100 odd:bg-zinc-50/50 hover:bg-indigo-50/50">
                <th className="truncate border-r border-zinc-200 px-2 py-0.5 text-left font-semibold" title={row.category}>{row.category}</th>
                <td className="border-r border-zinc-200 px-1.5 py-0.5 text-right">{formatValue(row.budget, metric)}</td>
                <td className="border-r border-zinc-200 px-1.5 py-0.5 text-right">{formatValue(row.actual, metric)}</td>
                <td className={`border-r border-zinc-200 px-1.5 py-0.5 text-right font-semibold ${row.difference < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatValue(row.difference, metric)}</td>
                <td className="px-1.5 py-0.5 text-right font-semibold">{renderRate(row.budget, row.actual)}</td>
              </tr>
            ))}
            <tr className={`${style.tint} border-t-2 border-zinc-300 font-black`}>
              <th className="border-r border-zinc-200 px-2 py-1 text-left">合計</th>
              <td className="border-r border-zinc-200 px-1.5 py-1 text-right">{formatValue(total.budget, metric)}</td>
              <td className="border-r border-zinc-200 px-1.5 py-1 text-right">{formatValue(total.actual, metric)}</td>
              <td className={`border-r border-zinc-200 px-1.5 py-1 text-right ${total.difference < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatValue(total.difference, metric)}</td>
              <td className="px-1.5 py-1 text-right">{renderRate(total.budget, total.actual)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function ProductCategoryProgress() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData] = useState<ProgressData | null>(null);
  const [dataKind, setDataKind] = useState<'delivery' | 'order'>('order');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (user && user.can_view_dashboard === false) navigate('/deals/new', { replace: true });
  }, [navigate, user]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const query = new URLSearchParams({ path: 'product-category-progress', month: selectedMonth, data_kind: dataKind });
        const response = await authFetch(`/api/kpi?${query}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('product category progress fetch failed');
        const payload = await response.json() as ProgressData;
        if (!cancelled) setData(payload);
      } catch (loadError) {
        console.error('product category progress load error:', loadError);
        if (!cancelled) setError('品目別売上進捗の取得に失敗しました');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [dataKind, reloadKey, selectedMonth]);

  const availableMonths = useMemo(() => {
    const values = new Set(data?.available_months ?? []);
    values.add(selectedMonth);
    return Array.from(values).sort().reverse();
  }, [data?.available_months, selectedMonth]);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-zinc-100 to-indigo-50/50 text-zinc-950 xl:h-screen xl:overflow-hidden">
      <header className="border-b border-white/80 bg-white/90 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-100 shadow-inner"><img src={logoImg} alt="Mystarz" className="h-6 w-auto" /></div><div><h1 className="text-base font-black tracking-tight sm:text-lg">品目別技工売上進捗</h1><p className="hidden text-[11px] font-medium text-zinc-400 sm:block">TOKYO × OSAKA PERFORMANCE MONITOR</p></div></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => navigate('/dashboard')} className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-xs font-bold text-zinc-600 hover:bg-zinc-50"><ArrowLeft className="h-4 w-4" />ダッシュボード</button><button type="button" onClick={handleLogout} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800" aria-label="ログアウト"><LogOut className="h-5 w-5" /></button></div>
        </div>
      </header>
      <div className="mx-auto max-w-[1700px] px-3 py-2 sm:px-5 xl:flex xl:h-[calc(100vh-61px)] xl:flex-col">
        <div className="grid gap-3 rounded-2xl border border-white/90 bg-white/90 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.07)] ring-1 ring-zinc-200/60 backdrop-blur md:grid-cols-[1fr_auto_1fr_1fr_auto] md:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-zinc-500">対象月</span>
            <span className="relative block">
              <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="h-9 w-full rounded-lg border border-zinc-300 bg-white py-1 pl-9 pr-3 text-sm font-black outline-none focus:border-indigo-500">
                {availableMonths.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}
              </select>
            </span>
          </label>
          <div>
            <p className="mb-1 text-xs font-bold text-zinc-500">集計基準</p>
            <div className="flex rounded-xl bg-zinc-100 p-1 ring-1 ring-inset ring-zinc-200/60">
              {([{ value: 'order', label: '受注' }, { value: 'delivery', label: '納品' }] as const).map((option) => (
                <button key={option.value} type="button" onClick={() => setDataKind(option.value)} className={`rounded-md px-4 py-1.5 text-xs font-bold transition ${dataKind === option.value ? 'bg-white text-indigo-700 shadow-sm' : 'text-zinc-500'}`}>{option.label}</button>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 px-3 py-1.5 ring-1 ring-inset ring-indigo-100"><p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Progress</p><p className="text-xl font-black text-indigo-700">{data?.progress_rate.toFixed(1) ?? '—'}%</p></div>
          <div className="rounded-xl bg-zinc-50 px-3 py-1.5 ring-1 ring-inset ring-zinc-200/70">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Business days</p>
            <p className="font-black">{data?.elapsed_operating_days ?? '—'}日 <span className="font-medium text-zinc-400">/</span> {data?.operating_days ?? '—'}日 <span className="ml-2 text-[10px] font-medium text-zinc-400">{data?.as_of_date}時点</span></p>
          </div>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={isLoading} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />更新</button>
        </div>

        {error && <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700">{error}</div>}

        {isLoading && !data ? (
          <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-blue-600" /></div>
        ) : data ? (
          <div className={`transition xl:flex xl:min-h-0 xl:flex-1 xl:flex-col ${isLoading ? 'opacity-60' : ''}`}>
            <div className="mt-2 grid gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[1.35fr_1fr_1fr]">
              <MetricTable region="all" metric="sales" rows={data.regions.all} />
              <MetricTable region="tokyo" metric="sales" rows={data.regions.tokyo} />
              <MetricTable region="osaka" metric="sales" rows={data.regions.osaka} />
            </div>
            <div className="mt-2 grid gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[1.35fr_1fr_1fr]">
              <MetricTable region="all" metric="units" rows={data.regions.all} />
              <MetricTable region="tokyo" metric="units" rows={data.regions.tokyo} />
              <MetricTable region="osaka" metric="units" rows={data.regions.osaka} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
