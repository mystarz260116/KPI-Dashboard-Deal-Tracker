import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { authFetch } from '../lib/authFetch';

type ClinicSeries = {
  requested_code: string;
  sales_code: string;
  display_name: string;
  ios_rental_start: string;
  monthly: Array<{ month: string; amount: number }>;
  ios_rental_analysis: {
    comparison_months: number;
    pre: PeriodMetrics;
    post: PeriodMetrics;
    changes: {
      total: number;
      total_rate: number | null;
      monthly_average: number;
      line_count: number;
      line_count_rate: number | null;
      active_days: number;
      active_days_rate: number | null;
      sales_per_active_day: number;
      sales_per_active_day_rate: number | null;
      sales_per_line: number;
      sales_per_line_rate: number | null;
    };
    category_changes: CategoryChange[];
  };
};

type PeriodMetrics = {
  from: string;
  to_exclusive: string;
  total: number;
  monthly_average: number;
  line_count: number;
  active_days: number;
  sales_per_active_day: number;
  sales_per_line: number;
};

type CategoryChange = {
  category: string;
  before: number;
  after: number;
  delta: number;
  before_monthly_average: number;
  after_monthly_average: number;
  monthly_average_delta: number;
  change_rate: number | null;
};

type TrendData = {
  from: string;
  to: string;
  is_current_month_partial: boolean;
  months: string[];
  clinics: ClinicSeries[];
};

function formatCurrency(value: number) {
  return `¥${Math.round(value).toLocaleString()}`;
}

function formatAxisCurrency(value: number) {
  if (value >= 10_000) return `${Math.round(value / 10_000)}万`;
  return value.toLocaleString();
}

function formatSignedCurrency(value: number) {
  if (value === 0) return '±¥0';
  return `${value > 0 ? '+' : '-'}¥${Math.abs(Math.round(value)).toLocaleString()}`;
}

function formatRate(value: number | null) {
  if (value === null) return '新規';
  if (value === 0) return '±0%';
  return `${value > 0 ? '+' : ''}${value}%`;
}

function monthBefore(value: string) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function ClinicSalesTrend() {
  const navigate = useNavigate();
  const [data, setData] = useState<TrendData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    authFetch('/api/clinic-sales-trend')
      .then(async (response) => {
        if (!response.ok) throw new Error('売上推移を取得できませんでした');
        return response.json();
      })
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((fetchError) => {
        if (active) setError(fetchError instanceof Error ? fetchError.message : '売上推移を取得できませんでした');
      });

    return () => {
      active = false;
    };
  }, []);

  const chartRows = useMemo(() => {
    if (!data) return [];
    return data.months.map((month) => {
      const row: Record<string, string | number> = {
        month,
        label: month.replace('-', '/'),
      };
      data.clinics.forEach((clinic) => {
        row[clinic.requested_code] = clinic.monthly.find((entry) => entry.month === month)?.amount ?? 0;
      });
      return row;
    });
  }, [data]);

  const summary = useMemo(() => (data?.clinics ?? []).map((clinic) => {
    const total = clinic.monthly.reduce((sum, entry) => sum + entry.amount, 0);
    const peak = clinic.monthly.reduce(
      (current, entry) => entry.amount > current.amount ? entry : current,
      clinic.monthly[0] ?? { month: '-', amount: 0 }
    );
    return { clinic, total, peak };
  }), [data]);

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/clinic-assets')}
              className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-600 shadow-sm transition hover:bg-zinc-100"
              aria-label="医院アセットへ戻る"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black">医院別 売上推移比較</h1>
              <p className="mt-1 text-sm text-zinc-500">納品日基準・月別売上</p>
            </div>
          </div>
          {data && (
            <div className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-600 shadow-sm">
              {data.from} ～ {data.to}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="flex min-h-[420px] items-center justify-center rounded-2xl bg-white shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        )}

        {data && (
          <>
            <section className="mb-5 grid gap-4 md:grid-cols-2">
              {summary.map(({ clinic, total, peak }, index) => (
                <div key={clinic.requested_code} className="rounded-2xl bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-zinc-500">取引先コード {clinic.requested_code}</p>
                      <h2 className="mt-1 text-lg font-black">{clinic.display_name}</h2>
                    </div>
                    <span className={`rounded-full p-2 ${index === 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                      <TrendingUp className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
                    <div>
                      <p className="text-xs font-bold text-zinc-400">期間合計</p>
                      <p className="mt-1 text-2xl font-black">{formatCurrency(total)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-zinc-400">最高月</p>
                      <p className="mt-1 text-base font-black">{peak.month.replace('-', '/')}・{formatCurrency(peak.amount)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
              <div className="h-[480px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows} margin={{ top: 16, right: 24, bottom: 12, left: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} angle={-35} textAnchor="end" height={64} />
                    <YAxis tickFormatter={formatAxisCurrency} tick={{ fontSize: 12 }} width={66} />
                    <Tooltip
                      formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
                      labelFormatter={(label) => `${label} 月`}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="30562"
                      name="しまだ歯科クリニック"
                      stroke="#059669"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                      activeDot={{ r: 7 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="4097"
                      name="あおぞらデンタルクリニック"
                      stroke="#2563eb"
                      strokeWidth={3}
                      dot={{ r: 4 }}
                      activeDot={{ r: 7 }}
                    />
                    <ReferenceLine
                      x="2025/04"
                      stroke="#2563eb"
                      strokeDasharray="5 5"
                      label={{ value: 'あおぞら IOS開始', position: 'insideTopRight', fill: '#1d4ed8', fontSize: 11 }}
                    />
                    <ReferenceLine
                      x="2025/10"
                      stroke="#059669"
                      strokeDasharray="5 5"
                      label={{ value: 'しまだ IOS開始', position: 'insideTopRight', fill: '#047857', fontSize: 11 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {data.is_current_month_partial && (
                <p className="mt-2 text-right text-xs font-semibold text-zinc-400">
                  最新月は本日時点の月途中集計です
                </p>
              )}
            </section>

            <section className="mt-6 space-y-6">
              {data.clinics.map((clinic, clinicIndex) => {
                const analysis = clinic.ios_rental_analysis;
                const metricGroups = [
                  {
                    label: '売上',
                    metrics: [
                      {
                        label: '6か月売上',
                        before: formatCurrency(analysis.pre.total),
                        after: formatCurrency(analysis.post.total),
                        delta: formatSignedCurrency(analysis.changes.total),
                        rate: formatRate(analysis.changes.total_rate),
                      },
                      {
                        label: '月平均売上',
                        before: formatCurrency(analysis.pre.monthly_average),
                        after: formatCurrency(analysis.post.monthly_average),
                        delta: formatSignedCurrency(analysis.changes.monthly_average),
                        rate: formatRate(analysis.changes.total_rate),
                      },
                    ],
                  },
                  {
                    label: '納品',
                    metrics: [
                      {
                        label: '月平均納品日数',
                        before: `${(analysis.pre.active_days / analysis.comparison_months).toFixed(1)}日/月`,
                        after: `${(analysis.post.active_days / analysis.comparison_months).toFixed(1)}日/月`,
                        delta: `${analysis.changes.active_days > 0 ? '+' : ''}${(analysis.changes.active_days / analysis.comparison_months).toFixed(1)}日/月`,
                        rate: formatRate(analysis.changes.active_days_rate),
                      },
                      {
                        label: '1納品日あたり売上',
                        before: formatCurrency(analysis.pre.sales_per_active_day),
                        after: formatCurrency(analysis.post.sales_per_active_day),
                        delta: formatSignedCurrency(analysis.changes.sales_per_active_day),
                        rate: formatRate(analysis.changes.sales_per_active_day_rate),
                      },
                    ],
                  },
                  {
                    label: '明細',
                    metrics: [
                      {
                        label: '売上明細数',
                        before: `${analysis.pre.line_count.toLocaleString()}件`,
                        after: `${analysis.post.line_count.toLocaleString()}件`,
                        delta: `${analysis.changes.line_count > 0 ? '+' : ''}${analysis.changes.line_count.toLocaleString()}件`,
                        rate: formatRate(analysis.changes.line_count_rate),
                      },
                      {
                        label: '1明細あたり金額',
                        before: formatCurrency(analysis.pre.sales_per_line),
                        after: formatCurrency(analysis.post.sales_per_line),
                        delta: formatSignedCurrency(analysis.changes.sales_per_line),
                        rate: formatRate(analysis.changes.sales_per_line_rate),
                      },
                    ],
                  },
                ];

                return (
                  <article key={`analysis-${clinic.requested_code}`} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                    <div className={`border-l-4 px-5 py-5 sm:px-6 ${clinicIndex === 0 ? 'border-emerald-600' : 'border-blue-600'}`}>
                      <p className="text-xs font-bold text-zinc-400">IOSレンタル開始前後6か月比較</p>
                      <h2 className="mt-1 text-xl font-black">{clinic.display_name}</h2>
                      <p className="mt-1 text-sm font-semibold text-zinc-500">
                        IOSレンタル開始 {clinic.ios_rental_start.slice(0, 7).replace('-', '/')} ／
                        前：{analysis.pre.from.replace('-', '/')}〜{monthBefore(analysis.pre.to_exclusive).replace('-', '/')} ／
                        後：{analysis.post.from.replace('-', '/')}〜{monthBefore(analysis.post.to_exclusive).replace('-', '/')}
                      </p>
                    </div>

                    <div className="grid gap-px bg-zinc-200 lg:grid-cols-3">
                      {metricGroups.map((group) => (
                        <div key={group.label} className="bg-zinc-50">
                          <h3 className="border-b border-zinc-200 px-5 py-3 text-sm font-black text-zinc-700">{group.label}</h3>
                          <div className="divide-y divide-zinc-100">
                            {group.metrics.map((metric) => {
                              const isPositive = metric.delta.startsWith('+');
                              const isNegative = metric.delta.startsWith('-');
                              return (
                                <div key={metric.label} className="bg-white p-5">
                                  <p className="text-sm font-bold text-zinc-500">{metric.label}</p>
                                  <div className="mt-3 flex items-end justify-between gap-3">
                                    <div>
                                      <p className="text-xs text-zinc-400">IOS開始前 → IOS開始後</p>
                                      <p className="mt-1 font-black text-zinc-800">{metric.before} → {metric.after}</p>
                                    </div>
                                    <div className="text-right">
                                      <p className={`text-lg font-black ${isPositive ? 'text-emerald-600' : isNegative ? 'text-rose-600' : 'text-zinc-500'}`}>
                                        {metric.delta}
                                      </p>
                                      <p className="text-xs font-bold text-zinc-400">{metric.rate}</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-zinc-100 p-5 sm:p-6">
                      <h3 className="font-black text-zinc-900">商品カテゴリ別の増減</h3>
                      <p className="mt-1 text-sm text-zinc-500">IOSレンタル料を除き、商品名を主要カテゴリへまとめて開始前後の6か月合計と1か月平均を比較</p>
                      <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="border-b border-zinc-200 text-left text-xs font-bold text-zinc-400">
                            <tr>
                              <th className="px-3 py-3">カテゴリ</th>
                              <th className="px-3 py-3 text-right">開始前<br />6か月合計</th>
                              <th className="px-3 py-3 text-right">開始後<br />6か月合計</th>
                              <th className="px-3 py-3 text-right">合計増減</th>
                              <th className="px-3 py-3 text-right">開始前<br />月平均</th>
                              <th className="px-3 py-3 text-right">開始後<br />月平均</th>
                              <th className="px-3 py-3 text-right">月平均増減</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {analysis.category_changes.map((category) => (
                              <tr key={category.category}>
                                <td className="px-3 py-3 font-bold text-zinc-800">{category.category}</td>
                                <td className="px-3 py-3 text-right text-zinc-600">{formatCurrency(category.before)}</td>
                                <td className="px-3 py-3 text-right text-zinc-600">{formatCurrency(category.after)}</td>
                                <td className={`px-3 py-3 text-right font-black ${category.delta > 0 ? 'text-emerald-600' : category.delta < 0 ? 'text-rose-600' : 'text-zinc-500'}`}>
                                  {formatSignedCurrency(category.delta)}
                                </td>
                                <td className="px-3 py-3 text-right text-zinc-600">{formatCurrency(category.before_monthly_average)}</td>
                                <td className="px-3 py-3 text-right text-zinc-600">{formatCurrency(category.after_monthly_average)}</td>
                                <td className={`px-3 py-3 text-right font-black ${category.monthly_average_delta > 0 ? 'text-emerald-600' : category.monthly_average_delta < 0 ? 'text-rose-600' : 'text-zinc-500'}`}>
                                  {formatSignedCurrency(category.monthly_average_delta)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </article>
                );
              })}
              <p className="px-1 text-xs leading-5 text-zinc-400">
                前後比較は変化の把握を目的としたもので、IOSレンタルだけが変化の原因であることを証明するものではありません。
                「1納品日あたり売上」を客単価に近い指標、「1明細あたり金額」を商品単価・構成の指標として表示しています。
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
