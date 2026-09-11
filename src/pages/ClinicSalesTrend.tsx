import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { authFetch } from '../lib/authFetch';

type PeriodMetrics = {
  from: string; to: string; total: number; period_average: number; line_count: number; active_days: number;
  active_days_average: number; line_count_average: number; sales_per_active_day: number; sales_per_line: number;
};
type CategoryChange = {
  category: string; before: number; after: number; delta: number;
  before_period_average: number; after_period_average: number; period_average_delta: number;
};
type ClinicSeries = {
  requested_code: string; sales_code: string; display_name: string; ios_rental_start: string;
  monthly: Array<{ month: string; amount: number }>;
  ios_rental_analysis: {
    comparison_days: number; comparison_label: string; average_label: string; average_divisor: number; maturity: string;
    pre: PeriodMetrics; post: PeriodMetrics;
    changes: {
      total: number; total_rate: number | null; period_average: number;
      line_count: number; line_count_rate: number | null; active_days: number; active_days_rate: number | null;
      active_days_average: number; line_count_average: number;
      sales_per_active_day: number; sales_per_active_day_rate: number | null;
      sales_per_line: number; sales_per_line_rate: number | null;
    };
    category_changes: CategoryChange[];
  };
};
type TrendData = { from: string; to: string; is_current_month_partial: boolean; months: string[]; clinics: ClinicSeries[] };

const formatCurrency = (value: number) => `¥${Math.round(value).toLocaleString()}`;
const formatSignedCurrency = (value: number) => value === 0 ? '±¥0' : `${value > 0 ? '+' : '-'}¥${Math.abs(Math.round(value)).toLocaleString()}`;
const formatRate = (value: number | null) => value === null ? '新規' : value === 0 ? '±0%' : `${value > 0 ? '+' : ''}${value}%`;
const formatAxisCurrency = (value: number) => value >= 10_000 ? `${Math.round(value / 10_000)}万` : value.toLocaleString();
const formatDate = (value: string) => value.replaceAll('-', '/');

export default function ClinicSalesTrend() {
  const navigate = useNavigate();
  const [data, setData] = useState<TrendData | null>(null);
  const [selectedCode, setSelectedCode] = useState('4097');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    authFetch('/api/clinic-sales-trend').then(async (response) => {
      if (!response.ok) throw new Error('売上推移を取得できませんでした');
      return response.json();
    }).then((payload) => { if (active) setData(payload); })
      .catch((fetchError) => { if (active) setError(fetchError instanceof Error ? fetchError.message : '売上推移を取得できませんでした'); });
    return () => { active = false; };
  }, []);

  const selected = useMemo(() => data?.clinics.find((clinic) => clinic.requested_code === selectedCode) ?? data?.clinics[0] ?? null, [data, selectedCode]);
  const chartRows = useMemo(() => selected?.monthly.map((entry) => ({ ...entry, label: entry.month.replace('-', '/') })) ?? [], [selected]);
  const isAozora = selected?.requested_code === '4097';
  const seriesColor = isAozora ? '#2563eb' : '#059669';
  const analysis = selected?.ios_rental_analysis;

  const metricGroups = useMemo(() => !analysis ? [] : [
    { label: '売上', metrics: [
      { label: `${analysis.comparison_label}売上`, before: formatCurrency(analysis.pre.total), after: formatCurrency(analysis.post.total), delta: formatSignedCurrency(analysis.changes.total), rate: formatRate(analysis.changes.total_rate) },
      { label: `${analysis.average_label}売上`, before: formatCurrency(analysis.pre.period_average), after: formatCurrency(analysis.post.period_average), delta: formatSignedCurrency(analysis.changes.period_average), rate: formatRate(analysis.changes.total_rate) },
    ] },
    { label: '納品', metrics: [
      { label: `${analysis.average_label}納品日数`, before: `${analysis.pre.active_days_average.toFixed(1)}日`, after: `${analysis.post.active_days_average.toFixed(1)}日`, delta: `${analysis.changes.active_days_average > 0 ? '+' : ''}${analysis.changes.active_days_average.toFixed(1)}日`, rate: formatRate(analysis.changes.active_days_rate) },
      { label: '1納品日あたり売上', before: formatCurrency(analysis.pre.sales_per_active_day), after: formatCurrency(analysis.post.sales_per_active_day), delta: formatSignedCurrency(analysis.changes.sales_per_active_day), rate: formatRate(analysis.changes.sales_per_active_day_rate) },
    ] },
    { label: '明細', metrics: [
      { label: `${analysis.average_label}売上明細数`, before: `${analysis.pre.line_count_average.toFixed(1)}件`, after: `${analysis.post.line_count_average.toFixed(1)}件`, delta: `${analysis.changes.line_count_average > 0 ? '+' : ''}${analysis.changes.line_count_average.toFixed(1)}件`, rate: formatRate(analysis.changes.line_count_rate) },
      { label: '1明細あたり金額', before: formatCurrency(analysis.pre.sales_per_line), after: formatCurrency(analysis.post.sales_per_line), delta: formatSignedCurrency(analysis.changes.sales_per_line), rate: formatRate(analysis.changes.sales_per_line_rate) },
    ] },
  ], [analysis]);

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/clinic-assets')} className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-600 shadow-sm hover:bg-zinc-100" aria-label="医院アセットへ戻る"><ArrowLeft className="h-5 w-5" /></button>
            <div><h1 className="text-2xl font-black">医院別 IOSレンタル分析</h1><p className="mt-1 text-sm text-zinc-500">納品日基準・開始前後の同期間比較</p></div>
          </div>
          {data && <div className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-600 shadow-sm">{data.from} ～ {data.to}</div>}
        </div>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
        {!data && !error && <div className="flex min-h-[420px] items-center justify-center rounded-2xl bg-white shadow-sm"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>}
        {data && selected && analysis && <>
          <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.clinics.map((clinic) => {
              const active = clinic.requested_code === selected.requested_code;
              const a = clinic.ios_rental_analysis;
              return <button key={clinic.requested_code} type="button" onClick={() => setSelectedCode(clinic.requested_code)} className={`rounded-xl border p-4 text-left shadow-sm transition ${active ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white hover:border-zinc-400'}`}>
                <div className="flex items-start justify-between gap-2"><span className={`text-xs font-bold ${active ? 'text-zinc-300' : 'text-zinc-400'}`}>{clinic.requested_code}</span><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${active ? 'bg-white/15 text-white' : 'bg-zinc-100 text-zinc-600'}`}>{a.maturity}</span></div>
                <p className="mt-2 font-black">{clinic.display_name}</p><p className={`mt-1 text-xs ${active ? 'text-zinc-300' : 'text-zinc-500'}`}>IOS開始 {formatDate(clinic.ios_rental_start)}</p>
              </button>;
            })}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">{selected.display_name}</h2><p className="text-sm text-zinc-500">月別売上推移</p></div><span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">IOS開始 {formatDate(selected.ios_rental_start)}</span></div>
            <div className="h-[420px] w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows} margin={{ top: 16, right: 24, bottom: 12, left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" /><XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" angle={-35} textAnchor="end" height={64} /><YAxis tickFormatter={formatAxisCurrency} tick={{ fontSize: 12 }} width={66} />
              <Tooltip formatter={(value) => [formatCurrency(Number(value)), selected.display_name]} labelFormatter={(label) => `${label} 月`} />
              <Line type="monotone" dataKey="amount" name={selected.display_name} stroke={seriesColor} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 7 }} />
              <ReferenceLine x={selected.ios_rental_start.slice(0, 7).replace('-', '/')} stroke={seriesColor} strokeDasharray="5 5" label={{ value: 'IOS開始', position: 'insideTopRight', fill: seriesColor, fontSize: 11 }} />
            </LineChart></ResponsiveContainer></div>
            {data.is_current_month_partial && <p className="mt-2 text-right text-xs font-semibold text-zinc-400">最新月は本日時点の月途中集計です</p>}
          </section>

          <article className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className={`border-l-4 px-5 py-5 sm:px-6 ${isAozora ? 'border-blue-600' : 'border-emerald-600'}`}>
              <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-zinc-400">IOSレンタル開始前後 {analysis.comparison_label}比較</p><span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-bold text-zinc-600">{analysis.maturity}</span></div>
              <h2 className="mt-1 text-xl font-black">{selected.display_name}</h2>
              <p className="mt-1 text-sm font-semibold text-zinc-500">IOS開始 {formatDate(selected.ios_rental_start)} ／ 前：{formatDate(analysis.pre.from)}〜{formatDate(analysis.pre.to)} ／ 後：{formatDate(analysis.post.from)}〜{formatDate(analysis.post.to)}</p>
            </div>
            <div className="grid gap-px bg-zinc-200 lg:grid-cols-3">{metricGroups.map((group) => <div key={group.label} className="bg-zinc-50"><h3 className="border-b border-zinc-200 px-5 py-3 text-sm font-black text-zinc-700">{group.label}</h3><div className="divide-y divide-zinc-100">{group.metrics.map((metric) => {
              const positive = metric.delta.startsWith('+'); const negative = metric.delta.startsWith('-');
              return <div key={metric.label} className="bg-white p-5"><p className="text-sm font-bold text-zinc-500">{metric.label}</p><div className="mt-3 flex items-end justify-between gap-3"><div><p className="text-xs text-zinc-400">IOS開始前 → IOS開始後</p><p className="mt-1 font-black text-zinc-800">{metric.before} → {metric.after}</p></div><div className="text-right"><p className={`text-lg font-black ${positive ? 'text-emerald-600' : negative ? 'text-rose-600' : 'text-zinc-500'}`}>{metric.delta}</p><p className="text-xs font-bold text-zinc-400">{metric.rate}</p></div></div></div>;
            })}</div></div>)}</div>
            <div className="border-t border-zinc-100 p-5 sm:p-6"><h3 className="font-black">商品カテゴリ別の増減</h3><p className="mt-1 text-sm text-zinc-500">IOSレンタル料を除き、開始前後の同期間合計と{analysis.average_label}を比較</p><div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead className="border-b border-zinc-200 text-left text-xs font-bold text-zinc-400"><tr><th className="px-3 py-3">カテゴリ</th><th className="px-3 py-3 text-right">開始前<br />期間合計</th><th className="px-3 py-3 text-right">開始後<br />期間合計</th><th className="px-3 py-3 text-right">合計増減</th><th className="px-3 py-3 text-right">開始前<br />{analysis.average_label}</th><th className="px-3 py-3 text-right">開始後<br />{analysis.average_label}</th><th className="px-3 py-3 text-right">平均増減</th></tr></thead><tbody className="divide-y divide-zinc-100">{analysis.category_changes.map((category) => <tr key={category.category}><td className="px-3 py-3 font-bold">{category.category}</td><td className="px-3 py-3 text-right">{formatCurrency(category.before)}</td><td className="px-3 py-3 text-right">{formatCurrency(category.after)}</td><td className={`px-3 py-3 text-right font-black ${category.delta > 0 ? 'text-emerald-600' : category.delta < 0 ? 'text-rose-600' : ''}`}>{formatSignedCurrency(category.delta)}</td><td className="px-3 py-3 text-right">{formatCurrency(category.before_period_average)}</td><td className="px-3 py-3 text-right">{formatCurrency(category.after_period_average)}</td><td className={`px-3 py-3 text-right font-black ${category.period_average_delta > 0 ? 'text-emerald-600' : category.period_average_delta < 0 ? 'text-rose-600' : ''}`}>{formatSignedCurrency(category.period_average_delta)}</td></tr>)}</tbody></table></div></div>
          </article>
          <p className="mt-5 px-1 text-xs leading-5 text-zinc-400">短期医院はIOS開始後に蓄積した日数と同じ日数を開始前から取り、同期間で比較しています。前後比較は変化の把握を目的とし、IOSレンタルだけが原因であることを証明するものではありません。</p>
        </>}
      </main>
    </div>
  );
}
