import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';
import {
  getPeriodRange,
  getYearMonthsBetween,
  toDateString,
  type Period,
} from '../src/lib/dateUtils.js';


type Granularity = 'all' | 'department' | 'individual';

async function fetchSalesSumByStaff(startDate: string, endDate: string) {
  const { data, error } = await supabaseAdmin.rpc('get_sales_sum_by_staff', {
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const period = (req.query.period as Period | undefined) ?? 'monthly';
    const granularity = (req.query.granularity as Granularity | undefined) ?? 'all';
    const department = (req.query.department as string | undefined) ?? '';
    const userId = (req.query.userId as string | undefined) ?? '';

    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;

    let start: Date;
    let end: Date;
    let prevStart: Date;
    let prevEnd: Date;

    if (fromParam && toParam) {
      start = new Date(fromParam);
      end = new Date(toParam);
      end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);

      // Previous period = same range one year earlier
      prevStart = new Date(start);
      prevStart.setFullYear(prevStart.getFullYear() - 1);

      prevEnd = new Date(end);
      prevEnd.setFullYear(prevEnd.getFullYear() - 1);
    } else {
      const range = getPeriodRange(period);
      start = range.start;
      end = range.end;
      prevStart = new Date(start);
      prevStart.setFullYear(prevStart.getFullYear() - 1);
      prevEnd = new Date(end);
      prevEnd.setFullYear(prevEnd.getFullYear() - 1);
    }

    const currentStart = toDateString(start);
    const currentEnd = toDateString(end);
    const previousStart = toDateString(prevStart);
    const previousEnd = toDateString(prevEnd);

    const endForBudget = new Date(end);
    endForBudget.setDate(endForBudget.getDate() - 1);
    const targetYearMonths = getYearMonthsBetween(start, endForBudget);

    const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, department_id, departments(name)')
      .order('name', { ascending: true });

    if (profilesError) {
      console.error('kpi profiles error:', profilesError);
      return res.status(500).json({ error: 'kpi profiles fetch failed' });
    }

    const users = (profilesData ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      department_id: p.department_id,
      department: p.departments?.name ?? '',
    }));

    let filteredUsers = users;
    if (granularity === 'department' && department) {
      filteredUsers = filteredUsers.filter((u) => u.department === department);
    }
    if (granularity === 'individual' && userId) {
      filteredUsers = filteredUsers.filter((u) => u.id === userId);
    }

    const allowedUserIds = new Set(filteredUsers.map((u) => u.id));
    const allowedDepartmentIds = Array.from(new Set(filteredUsers.map((u) => u.department_id).filter(Boolean)));

    const { data: createdProspects, error: createdProspectsError } = await supabaseAdmin
      .from('prospect_customers')
      .select('id, status, merged_customer_code, merged_at, created_by, created_at')
      .gte('created_at', currentStart)
      .lt('created_at', currentEnd);

    if (createdProspectsError) {
      console.error('kpi prospects error:', createdProspectsError);
      return res.status(500).json({ error: 'prospects fetch failed' });
    }

    const { data: mergedProspectsInPeriod, error: mergedProspectsInPeriodError } = await supabaseAdmin
      .from('prospect_customers')
      .select('id, name, created_by, merged_customer_code, merged_at, status')
      .eq('status', 'merged')
      .not('merged_customer_code', 'is', null)
      .gte('merged_at', currentStart)
      .lt('merged_at', currentEnd);

    if (mergedProspectsInPeriodError) {
      console.error('kpi merged prospects error:', mergedProspectsInPeriodError);
      return res.status(500).json({ error: 'merged prospects fetch failed' });
    }

    const { data: profileStaffMaps, error: profileStaffMapsError } = await supabaseAdmin
      .from('profile_external_staff_maps')
      .select('profile_id, external_staff_code');

    if (profileStaffMapsError) {
      console.error('kpi profile staff map error:', profileStaffMapsError);
      return res.status(500).json({ error: 'profile staff map fetch failed' });
    }

    const filteredStaffMaps = (profileStaffMaps ?? []).filter((m: any) => allowedUserIds.has(m.profile_id));
    const allowedExternalStaffCodes = new Set(
      filteredStaffMaps.map((m: any) => String(m.external_staff_code))
    );

    const { data: currentDeals, error: currentDealsError } = await supabaseAdmin
      .from('deals')
      .select('id, user_id, customer_code, prospect_customer_id, deal_date, activity_type, amount, created_at, customers(name), prospect_customers(name)')
      .gte('deal_date', currentStart)
      .lt('deal_date', currentEnd);

    if (currentDealsError) {
      console.error('kpi current deals error:', currentDealsError);
      return res.status(500).json({ error: 'current deals fetch failed' });
    }

    const { data: previousDeals, error: previousDealsError } = await supabaseAdmin
      .from('deals')
      .select('id, user_id, deal_date, activity_type, amount')
      .gte('deal_date', previousStart)
      .lt('deal_date', previousEnd);

    if (previousDealsError) {
      console.error('kpi previous deals error:', previousDealsError);
      return res.status(500).json({ error: 'previous deals fetch failed' });
    }

    let currentSalesRows: any[] = [];
    try {
      currentSalesRows = await fetchSalesSumByStaff(currentStart, currentEnd);
    } catch (currentSalesRowsError) {
      console.error('kpi current sales rows error:', currentSalesRowsError);
      return res.status(500).json({ error: 'current sales rows fetch failed' });
    }

    let previousSalesRows: any[] = [];
    try {
      previousSalesRows = await fetchSalesSumByStaff(previousStart, previousEnd);
    } catch (previousSalesRowsError) {
      console.error('kpi previous sales rows error:', previousSalesRowsError);
      return res.status(500).json({ error: 'previous sales rows fetch failed' });
    }

    const scopedMergedProspectsInPeriod = (mergedProspectsInPeriod ?? []).filter((p: any) =>
      allowedUserIds.has(p.created_by)
    );

    const mergedCustomerCodesInPeriod = Array.from(
      new Set(scopedMergedProspectsInPeriod.map((p: any) => p.merged_customer_code).filter(Boolean))
    );

    const { data: mergedCustomersData, error: mergedCustomersError } = await supabaseAdmin
      .from('customers')
      .select('code, name')
      .in('code', mergedCustomerCodesInPeriod.length > 0 ? mergedCustomerCodesInPeriod : ['__none__']);

    if (mergedCustomersError) {
      console.error('kpi merged customers error:', mergedCustomersError);
      return res.status(500).json({ error: 'merged customers fetch failed' });
    }

    const mergedCustomerNameMap = new Map<string, string>();
    (mergedCustomersData ?? []).forEach((c: any) => {
      mergedCustomerNameMap.set(c.code, c.name ?? c.code);
    });

    let mergedSalesTotal = 0;
    try {
      const { data: mergedSalesData, error: mergedSalesError } = await supabaseAdmin.rpc(
        'get_merged_sales_total',
        {
          p_start_date: currentStart,
          p_end_date: currentEnd,
          p_customer_codes: mergedCustomerCodesInPeriod,
        }
      );

      if (mergedSalesError) throw mergedSalesError;

      mergedSalesTotal = Number(mergedSalesData?.[0]?.sales_total ?? 0);
    } catch (e) {
      console.error('kpi merged sales error:', e);
    }

    let budgetsQuery = supabaseAdmin
      .from('budgets')
      .select('user_id, department_id, target_year_month, target_amount')
      .in('target_year_month', targetYearMonths);

    if (granularity === 'department' && allowedDepartmentIds.length > 0) {
      budgetsQuery = budgetsQuery.in('department_id', allowedDepartmentIds);
    }
    if (granularity === 'individual' && userId) {
      budgetsQuery = budgetsQuery.eq('user_id', userId);
    }

    const { data: budgetsData, error: budgetsError } = await budgetsQuery;

    if (budgetsError) {
      console.error('kpi budgets error:', budgetsError);
      return res.status(500).json({ error: 'budgets fetch failed' });
    }

    const scopedCreatedProspects = (createdProspects ?? []).filter((p: any) =>
      allowedUserIds.has(p.created_by)
    );

    const scopedCurrentDeals = (currentDeals ?? []).filter((d: any) => allowedUserIds.has(d.user_id));
    const scopedCurrentSalesRows = (currentSalesRows ?? []).filter((row: any) =>
      allowedExternalStaffCodes.has(String(row.external_staff_code))
    );
    const scopedPreviousSalesRows = (previousSalesRows ?? []).filter((row: any) =>
      allowedExternalStaffCodes.has(String(row.external_staff_code))
    );

    const scopedBudgets = (budgetsData ?? []).filter((b: any) => {
      if (granularity === 'individual') return b.user_id === userId;
      if (granularity === 'department') return allowedDepartmentIds.includes(b.department_id);
      return allowedUserIds.has(b.user_id);
    });

    const salesTotal = scopedCurrentSalesRows.reduce((sum: number, row: any) => {
      const amount = Number(row.sales_total ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const previousSalesTotal = scopedPreviousSalesRows.reduce((sum: number, row: any) => {
      const amount = Number(row.sales_total ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const budgetTotal = scopedBudgets.reduce((sum: number, b: any) => {
      const amount = Number(b.target_amount ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const achievementRate = budgetTotal > 0 ? Number(((salesTotal / budgetTotal) * 100).toFixed(1)) : 0;
    const changeRate = previousSalesTotal > 0
      ? Number((((salesTotal - previousSalesTotal) / previousSalesTotal) * 100).toFixed(1))
      : salesTotal > 0
        ? null
        : 0;

    const newProspectsCount = scopedCreatedProspects.length;
    const mergedProspectsCount = scopedCreatedProspects.filter((p: any) =>
      p.status === 'merged' && p.merged_customer_code
    ).length;
    const conversionRate = newProspectsCount > 0
      ? Number(((mergedProspectsCount / newProspectsCount) * 100).toFixed(1))
      : 0;
    const avgOrderValue = mergedProspectsCount > 0
      ? Math.round(mergedSalesTotal / mergedProspectsCount)
      : 0;

    const visitRankingMap = new Map<string, number>();
    const wonRankingMap = new Map<string, number>();

    scopedCurrentDeals.forEach((d: any) => {
      const user = users.find((u) => u.id === d.user_id);
      if (!user) return;

      if (d.activity_type === 'visit') {
        visitRankingMap.set(user.name, (visitRankingMap.get(user.name) ?? 0) + 1);
      }
    });

    scopedMergedProspectsInPeriod.forEach((p: any) => {
      const user = users.find((u) => u.id === p.created_by);
      if (!user) return;

      wonRankingMap.set(user.name, (wonRankingMap.get(user.name) ?? 0) + 1);
    });

    const visit_ranking = Array.from(visitRankingMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const won_ranking = Array.from(wonRankingMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const new_orders = scopedMergedProspectsInPeriod
      .slice()
      .sort((a: any, b: any) => new Date(b.merged_at).getTime() - new Date(a.merged_at).getTime())
      .slice(0, 10)
      .map((p: any) => {
        const user = users.find((u) => u.id === p.created_by);
        const customerCode = p.merged_customer_code;
        return {
          clinic: mergedCustomerNameMap.get(customerCode) ?? p.name ?? customerCode,
          sales: user?.name ?? '',
        };
      });

    return res.status(200).json({
      budget: {
        sales: salesTotal,
        budget: budgetTotal,
        achievement_rate: achievementRate,
        target_year_months: targetYearMonths,
      },
      sales: {
        sales: salesTotal,
        prev_sales: previousSalesTotal,
        change_rate: changeRate,
      },
      visit_ranking,
      won_ranking,
      conversion_rate: conversionRate,
      new_prospects_count: newProspectsCount,
      merged_new_orders_count: mergedProspectsCount,
      avg_order_value: avgOrderValue,
      new_orders,
    });
  } catch (error) {
    console.error('kpi api unexpected error:', error);
    return res.status(500).json({ error: 'kpi api failed' });
  }
}