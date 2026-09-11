import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuthenticatedProfile, requireDashboardAccess } from './_lib/auth.js';
import { DASHBOARD_SALES_ROWS_TABLE } from './_lib/regions.js';
import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';

const CLINICS = [
  { requested_code: '30562', sales_code: '1030562', display_name: 'しまだ歯科クリニック', ios_rental_start: '2025-10-01' },
  { requested_code: '4097', sales_code: '1040979', display_name: '医療法人社団晃誠会 あおぞらデンタルクリニック', ios_rental_start: '2025-04-01' },
  { requested_code: '40401', sales_code: '1040401', display_name: 'ささはら歯科クリニック', ios_rental_start: '2026-07-07' },
  { requested_code: '40402', sales_code: '1040402', display_name: '栗田歯科クリニック', ios_rental_start: '2026-07-14' },
  { requested_code: '40398', sales_code: '1040398', display_name: '宝塚ファミリー歯科クリニック', ios_rental_start: '2026-07-08' },
  { requested_code: '30186', sales_code: '1030186', display_name: '光成歯科', ios_rental_start: '2026-07-17' },
  { requested_code: '30760', sales_code: '1030760', display_name: '医療法人 小西歯科医院', ios_rental_start: '2026-06-26' },
  { requested_code: '324', sales_code: '1000324', display_name: '医療法人誠智会 南与野駅歯科クリニック', ios_rental_start: '2026-04-15' },
] as const;

type SalesRow = {
  delivery_date: string;
  amount: number | null;
  normalized_product_code: string | null;
  normalized_product_name: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, amount: number) {
  return toDateString(new Date(parseDate(value).getTime() + amount * DAY_MS));
}

function addMonths(value: string, amount: number) {
  const date = parseDate(value);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return toDateString(date);
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysInclusive(from: string, to: string) {
  return Math.floor((parseDate(to).getTime() - parseDate(from).getTime()) / DAY_MS) + 1;
}

async function fetchClinicSales(salesCode: string, from: string, to: string) {
  const rows: SalesRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from(DASHBOARD_SALES_ROWS_TABLE)
      .select('delivery_date, amount, normalized_product_code, normalized_product_name')
      .eq('data_kind', 'delivery')
      .eq('customer_code', salesCode)
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .order('delivery_date')
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  return rows;
}

function productCategory(row: SalesRow) {
  const label = `${row.normalized_product_name ?? ''} ${row.normalized_product_code ?? ''}`;
  if (/IOS/i.test(label)) return null;
  if (/CAD\s*\/\s*CAM/i.test(label)) return 'CAD/CAM';
  if (/ジル|zircon/i.test(label)) return 'ジルコニア';
  if (/e[\s-]*max/i.test(label)) return 'e.max';
  if (/ＦＭＣ|FMC/i.test(label)) return 'FMC';
  if (/インレー|Inlay/i.test(label)) return 'その他インレー';
  if (/義歯|ﾃﾞﾝﾁｬｰ|デンチャー|床|バー/i.test(label)) return '義歯・デンチャー';
  if (/硬質.*ﾚｼﾞﾝ|硬質.*レジン/i.test(label)) return '硬質レジン';
  return 'その他';
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function summarizePeriod(rows: SalesRow[], from: string, to: string, averageDivisor: number) {
  const scoped = rows.filter((row) => row.delivery_date >= from && row.delivery_date <= to);
  const total = scoped.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const activeDays = new Set(scoped.map((row) => row.delivery_date)).size;
  const categoryTotals = new Map<string, number>();
  scoped.forEach((row) => {
    const category = productCategory(row);
    if (!category) return;
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + Number(row.amount ?? 0));
  });
  return {
    from,
    to,
    total: Math.round(total),
    period_average: Math.round(total / averageDivisor),
    line_count: scoped.length,
    active_days: activeDays,
    active_days_average: Math.round((activeDays / averageDivisor) * 10) / 10,
    line_count_average: Math.round((scoped.length / averageDivisor) * 10) / 10,
    sales_per_active_day: activeDays > 0 ? Math.round(total / activeDays) : 0,
    sales_per_line: scoped.length > 0 ? Math.round(total / scoped.length) : 0,
    categories: Object.fromEntries(categoryTotals),
  };
}

function analysisWindow(start: string, today: string) {
  const elapsedDays = Math.max(1, daysInclusive(start, today));
  if (elapsedDays >= 180) {
    return {
      preFrom: addMonths(start, -6), preTo: addDays(start, -1),
      postFrom: start, postTo: addDays(addMonths(start, 6), -1),
      comparisonDays: daysInclusive(start, addDays(addMonths(start, 6), -1)),
      averageDivisor: 6, averageLabel: '月平均', comparisonLabel: '6か月', maturity: '6か月比較',
    };
  }
  const comparisonDays = elapsedDays;
  const useWeekly = comparisonDays < 90;
  return {
    preFrom: addDays(start, -comparisonDays), preTo: addDays(start, -1),
    postFrom: start, postTo: today,
    comparisonDays,
    averageDivisor: comparisonDays / (useWeekly ? 7 : 30.4375),
    averageLabel: useWeekly ? '週平均' : '月平均',
    comparisonLabel: `${comparisonDays}日間`,
    maturity: comparisonDays < 30 ? '初期観測' : comparisonDays < 90 ? '短期分析' : '3か月分析',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const profile = await requireAuthenticatedProfile(req, res);
  if (!profile || !requireDashboardAccess(profile, res)) return;

  try {
    const today = '2026-07-31';
    const from = '2024-04-01';
    const months: string[] = [];
    for (let cursor = parseDate(from); cursor <= parseDate(today); cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
      months.push(monthKey(cursor));
    }
    const clinicRows = await Promise.all(CLINICS.map((clinic) => fetchClinicSales(clinic.sales_code, from, today)));
    const clinics = CLINICS.map((clinic, index) => {
      const rows = clinicRows[index];
      const totals = new Map(months.map((month) => [month, 0]));
      rows.forEach((row) => {
        const month = row.delivery_date.slice(0, 7);
        if (totals.has(month)) totals.set(month, (totals.get(month) ?? 0) + Number(row.amount ?? 0));
      });
      const window = analysisWindow(clinic.ios_rental_start, today);
      const pre = summarizePeriod(rows, window.preFrom, window.preTo, window.averageDivisor);
      const post = summarizePeriod(rows, window.postFrom, window.postTo, window.averageDivisor);
      const categoryNames = new Set([...Object.keys(pre.categories), ...Object.keys(post.categories)]);
      const category_changes = Array.from(categoryNames).map((category) => {
        const before = Number(pre.categories[category] ?? 0);
        const after = Number(post.categories[category] ?? 0);
        return {
          category, before, after, delta: after - before,
          before_period_average: Math.round(before / window.averageDivisor),
          after_period_average: Math.round(after / window.averageDivisor),
          period_average_delta: Math.round((after - before) / window.averageDivisor),
        };
      }).sort((a, b) => b.delta - a.delta);
      return {
        ...clinic,
        monthly: months.map((month) => ({ month, amount: Math.round(totals.get(month) ?? 0) })),
        ios_rental_analysis: {
          comparison_days: window.comparisonDays,
          comparison_label: window.comparisonLabel,
          average_label: window.averageLabel,
          average_divisor: window.averageDivisor,
          maturity: window.maturity,
          pre, post,
          changes: {
            total: post.total - pre.total,
            total_rate: percentChange(post.total, pre.total),
            period_average: post.period_average - pre.period_average,
            line_count: post.line_count - pre.line_count,
            line_count_rate: percentChange(post.line_count, pre.line_count),
            active_days: post.active_days - pre.active_days,
            active_days_rate: percentChange(post.active_days, pre.active_days),
            active_days_average: Math.round((post.active_days_average - pre.active_days_average) * 10) / 10,
            line_count_average: Math.round((post.line_count_average - pre.line_count_average) * 10) / 10,
            sales_per_active_day: post.sales_per_active_day - pre.sales_per_active_day,
            sales_per_active_day_rate: percentChange(post.sales_per_active_day, pre.sales_per_active_day),
            sales_per_line: post.sales_per_line - pre.sales_per_line,
            sales_per_line_rate: percentChange(post.sales_per_line, pre.sales_per_line),
          },
          category_changes,
        },
      };
    });
    return res.status(200).json({ from, to: today, is_current_month_partial: false, months, clinics });
  } catch (error) {
    console.error('clinic sales trend error:', error);
    return res.status(500).json({ error: 'Clinic sales trend fetch failed' });
  }
}
