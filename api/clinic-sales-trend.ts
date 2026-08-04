import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuthenticatedProfile, requireDashboardAccess } from './_lib/auth.js';
import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';

const CLINICS = [
  {
    requested_code: '30562',
    sales_code: '30562',
    display_name: 'しまだ歯科クリニック',
    ios_rental_start: '2025-10-01',
  },
  {
    requested_code: '4097',
    sales_code: '40979',
    display_name: '医療法人社団晃誠会 あおぞらデンタルクリニック',
    ios_rental_start: '2025-04-01',
  },
] as const;

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

type SalesRow = {
  delivery_date: string;
  amount: number | null;
  normalized_product_code: string | null;
  normalized_product_name: string | null;
};

async function fetchClinicSales(salesCode: string, from: string, to: string) {
  const rows: SalesRow[] = [];

  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseAdmin
      .from('sales_import_rows')
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

function addMonthKey(value: string, amount: number) {
  const [year, month] = value.split('-').map(Number);
  return monthKey(new Date(year, month - 1 + amount, 1));
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

function summarizePeriod(rows: SalesRow[], fromMonth: string, toMonthExclusive: string) {
  const scoped = rows.filter((row) => {
    const month = row.delivery_date.slice(0, 7);
    return month >= fromMonth && month < toMonthExclusive;
  });
  const total = scoped.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const activeDays = new Set(scoped.map((row) => row.delivery_date)).size;
  const categoryTotals = new Map<string, number>();
  scoped.forEach((row) => {
    const category = productCategory(row);
    if (!category) return;
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + Number(row.amount ?? 0));
  });

  return {
    from: fromMonth,
    to_exclusive: toMonthExclusive,
    total: Math.round(total),
    monthly_average: Math.round(total / 6),
    line_count: scoped.length,
    active_days: activeDays,
    sales_per_active_day: activeDays > 0 ? Math.round(total / activeDays) : 0,
    sales_per_line: scoped.length > 0 ? Math.round(total / scoped.length) : 0,
    categories: Object.fromEntries(categoryTotals),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const profile = await requireAuthenticatedProfile(req, res);
  if (!profile || !requireDashboardAccess(profile, res)) return;

  try {
    const now = new Date();
    const start = new Date(2024, 3, 1);
    const months: string[] = [];
    for (let cursor = start; cursor <= now; cursor = addMonths(cursor, 1)) {
      months.push(monthKey(cursor));
    }

    const from = '2024-04-01';
    const to = toDateString(now);
    const clinicRows = await Promise.all(
      CLINICS.map((clinic) => fetchClinicSales(clinic.sales_code, from, to))
    );

    const clinics = CLINICS.map((clinic, index) => {
      const totals = new Map(months.map((month) => [month, 0]));
      clinicRows[index].forEach((row) => {
        const month = String(row.delivery_date ?? '').slice(0, 7);
        if (!totals.has(month)) return;
        totals.set(month, (totals.get(month) ?? 0) + Number(row.amount ?? 0));
      });

      const iosRentalMonth = clinic.ios_rental_start.slice(0, 7);
      const pre = summarizePeriod(
        clinicRows[index],
        addMonthKey(iosRentalMonth, -6),
        iosRentalMonth
      );
      const post = summarizePeriod(
        clinicRows[index],
        iosRentalMonth,
        addMonthKey(iosRentalMonth, 6)
      );
      const categoryNames = new Set([
        ...Object.keys(pre.categories),
        ...Object.keys(post.categories),
      ]);
      const category_changes = Array.from(categoryNames)
        .map((category) => {
          const before = Number(pre.categories[category] ?? 0);
          const after = Number(post.categories[category] ?? 0);
          return {
            category,
            before,
            after,
            delta: after - before,
            before_monthly_average: Math.round(before / 6),
            after_monthly_average: Math.round(after / 6),
            monthly_average_delta: Math.round((after - before) / 6),
            change_rate: percentChange(after, before),
          };
        })
        .sort((a, b) => b.delta - a.delta);

      return {
        ...clinic,
        monthly: months.map((month) => ({
          month,
          amount: Math.round(totals.get(month) ?? 0),
        })),
        ios_rental_analysis: {
          comparison_months: 6,
          pre,
          post,
          changes: {
            total: post.total - pre.total,
            total_rate: percentChange(post.total, pre.total),
            monthly_average: post.monthly_average - pre.monthly_average,
            line_count: post.line_count - pre.line_count,
            line_count_rate: percentChange(post.line_count, pre.line_count),
            active_days: post.active_days - pre.active_days,
            active_days_rate: percentChange(post.active_days, pre.active_days),
            sales_per_active_day: post.sales_per_active_day - pre.sales_per_active_day,
            sales_per_active_day_rate: percentChange(post.sales_per_active_day, pre.sales_per_active_day),
            sales_per_line: post.sales_per_line - pre.sales_per_line,
            sales_per_line_rate: percentChange(post.sales_per_line, pre.sales_per_line),
          },
          category_changes,
        },
      };
    });

    return res.status(200).json({
      from,
      to,
      is_current_month_partial: true,
      months,
      clinics,
    });
  } catch (error) {
    console.error('clinic sales trend error:', error);
    return res.status(500).json({ error: 'Clinic sales trend fetch failed' });
  }
}
