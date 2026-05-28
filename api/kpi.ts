import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';
import {
  getPeriodRange,
  getYearMonthsBetween,
  toDateString,
  type Period,
} from '../src/lib/dateUtils.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from './_lib/auth.js';
import {
  fetchRegionalSalesRows,
  fetchRegionalSalesTotal,
} from './_lib/regionalReads.js';
import newOrdersHandler from '../src/server-handlers/kpi/new-orders.js';
import salesPerformanceHandler from '../src/server-handlers/kpi/sales-performance.js';


type Granularity = 'all' | 'department' | 'individual';
const EXCLUDED_DASHBOARD_DEPARTMENTS = new Set(['管理部']);
const HEAD_OFFICE_SALES_NAME = '本社売上';
const UNCLASSIFIED_PRODUCT_LABEL = '未分類';

function expandBudgetYearMonthFormats(yearMonths: string[]) {
  const variants = new Set<string>();

  yearMonths.forEach((value) => {
    const normalized = String(value).trim();
    if (!normalized) return;

    variants.add(normalized);

    const [year, monthRaw] = normalized.split('-');
    const monthNumber = Number.parseInt(monthRaw ?? '', 10);

    if (year && Number.isFinite(monthNumber)) {
      const paddedMonth = String(monthNumber).padStart(2, '0');
      const shortMonth = new Date(Number(year), monthNumber - 1, 1).toLocaleString('en-US', { month: 'short' });
      const shortYear = year.slice(-2);
      variants.add(`${year}/${monthNumber}`);
      variants.add(`${year}/${paddedMonth}`);
      variants.add(`${year}-${monthNumber}`);
      variants.add(`${year}-${paddedMonth}`);
      variants.add(`${shortMonth}-${shortYear}`);
      variants.add(`${shortMonth}-${year}`);
    }
  });

  return Array.from(variants);
}

function normalizeRoutePath(pathValue: string | string[] | undefined) {
  if (Array.isArray(pathValue)) {
    return pathValue.join('/');
  }

  return pathValue ?? '';
}

function getKpiRoute(req: any) {
  const queryRoute = normalizeRoutePath(req.query?.path as string | string[] | undefined);
  if (queryRoute) {
    return queryRoute.replace(/^\/+|\/+$/g, '');
  }

  const pathname = new URL(req.url ?? '/api/kpi', 'http://localhost').pathname;
  return pathname.replace(/^\/api\/kpi\/?/, '');
}

function getPreviousYearRange(start: Date, endExclusive: Date) {
  const prevStart = new Date(start);
  prevStart.setFullYear(prevStart.getFullYear() - 1);

  const prevEnd = new Date(endExclusive);
  prevEnd.setFullYear(prevEnd.getFullYear() - 1);

  return { prevStart, prevEnd };
}

export default async function handler(req: any, res: any) {
  const route = getKpiRoute(req);

  if (route === 'new-orders') {
    return newOrdersHandler(req, res);
  }

  if (route === 'sales-performance') {
    return salesPerformanceHandler(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireDashboardAccess(profile, res)) return;

    const period = (req.query.period as Period | undefined) ?? 'monthly';
    const granularity = (req.query.granularity as Granularity | undefined) ?? 'all';
    const departmentIdParam = (req.query.departmentId as string | undefined) ?? '';
    const legacyDepartment = (req.query.department as string | undefined) ?? '';
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
      const previousRange = getPreviousYearRange(start, end);
      prevStart = previousRange.prevStart;
      prevEnd = previousRange.prevEnd;
    } else {
      const range = getPeriodRange(period);
      start = range.start;
      end = range.end;
      const previousRange = getPreviousYearRange(start, end);
      prevStart = previousRange.prevStart;
      prevEnd = previousRange.prevEnd;
    }

    const currentStart = toDateString(start);
    const currentEnd = toDateString(end);
    const previousStart = toDateString(prevStart);
    const previousEnd = toDateString(prevEnd);

    const endForBudget = new Date(end);
    endForBudget.setDate(endForBudget.getDate() - 1);
    const targetYearMonths = getYearMonthsBetween(start, endForBudget);
    const budgetMonthKeys = expandBudgetYearMonthFormats(targetYearMonths);

    const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, department_id, departments(name)')
      .order('name', { ascending: true });

    if (profilesError) {
      console.error('kpi profiles error:', profilesError);
      return res.status(500).json({ error: 'kpi profiles fetch failed' });
    }

    const users = (profilesData ?? [])
      .map((p: any) => ({
        id: p.id,
        name: p.name,
        department_id: p.department_id,
        department: p.departments?.name ?? '',
      }))
      .filter((user) => !EXCLUDED_DASHBOARD_DEPARTMENTS.has(user.department));

    let filteredUsers = users;
    const selectedDepartment = departmentIdParam
      ? Number(departmentIdParam)
      : legacyDepartment
        ? users.find((u) => u.department === legacyDepartment)?.department_id ?? null
        : null;

    if (granularity === 'department' && selectedDepartment) {
      filteredUsers = filteredUsers.filter((u) => u.department_id === selectedDepartment);
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

    const { data: currentDeals, error: currentDealsError } = await supabaseAdmin
      .from('deals')
      .select('id, user_id, customer_code, prospect_customer_id, deal_date, activity_type, executed_action_type, amount, created_at, customers(name), prospect_customers(name)')
      .gte('deal_date', currentStart)
      .lt('deal_date', currentEnd);

    if (currentDealsError) {
      console.error('kpi current deals error:', currentDealsError);
      return res.status(500).json({ error: 'current deals fetch failed' });
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
      mergedSalesTotal = await fetchRegionalSalesTotal({
        startDate: currentStart,
        endExclusiveDate: currentEnd,
        customerCodes: mergedCustomerCodesInPeriod,
      });
    } catch (e) {
      console.error('kpi merged sales error:', e);
    }

    const buildBudgetsQuery = (selectClause: string) => {
      let query = supabaseAdmin
        .from('budgets')
        .select(selectClause)
        .in('target_year_month', budgetMonthKeys);

      if (granularity === 'department' && allowedDepartmentIds.length > 0) {
        query = query.in('department_id', allowedDepartmentIds);
      }
      if (granularity === 'individual' && userId) {
        query = query.eq('user_id', userId);
      }

      return query;
    };

    let budgetsResult = await buildBudgetsQuery('user_id, external_staff_code, department_id, target_year_month, target_amount, "KPI"');

    if (budgetsResult.error && String(budgetsResult.error.message ?? '').includes('KPI')) {
      console.warn('kpi budgets fallback: KPI column not available yet, retrying without KPI');
      budgetsResult = await buildBudgetsQuery('user_id, external_staff_code, department_id, target_year_month, target_amount');
    }

    const { data: budgetsData, error: budgetsError } = budgetsResult;

    if (budgetsError) {
      console.error('kpi budgets error:', budgetsError);
      return res.status(500).json({ error: 'budgets fetch failed' });
    }

    const scopedCreatedProspects = (createdProspects ?? []).filter((p: any) =>
      allowedUserIds.has(p.created_by)
    );

    const scopedCurrentDeals = (currentDeals ?? []).filter((d: any) => allowedUserIds.has(d.user_id));
    const scopedBudgets = (budgetsData ?? []).filter((b: any) => {
      if (granularity === 'individual') return b.user_id === userId;
      if (granularity === 'department') return allowedDepartmentIds.includes(b.department_id);
      return allowedUserIds.has(b.user_id);
    });

    let currentSalesRows: any[] = [];
    let previousSalesRows: any[] = [];

    try {
      [currentSalesRows, previousSalesRows] = await Promise.all([
        fetchRegionalSalesRows({
          startDate: currentStart,
          endExclusiveDate: currentEnd,
        }),
        fetchRegionalSalesRows({
          startDate: previousStart,
          endExclusiveDate: previousEnd,
        }),
      ]);
    } catch (salesImportRowsError) {
      console.error('kpi sales import rows error:', salesImportRowsError);
      return res.status(500).json({ error: 'sales import rows fetch failed' });
    }

    const salesRowDepartmentIds = Array.from(new Set(
      [...currentSalesRows, ...previousSalesRows]
        .map((row: any) => Number(row.department_id))
        .filter((value) => Number.isFinite(value) && value > 0)
    ));

    let productCategoryMasters: any[] = [];
    if (salesRowDepartmentIds.length > 0) {
      const { data: productCategoryMastersData, error: productCategoryMastersError } = await supabaseAdmin
        .from('product_category_masters')
        .select('department_id, normalized_product_code, normalized_product_name, proposal_category, major_category')
        .in('department_id', salesRowDepartmentIds);

      if (productCategoryMastersError) {
        console.error('kpi product category masters error:', productCategoryMastersError);
        return res.status(500).json({ error: 'product category masters fetch failed' });
      }

      productCategoryMasters = productCategoryMastersData ?? [];
    }

    const budgetTotal = scopedBudgets.reduce((sum: number, b: any) => {
      const amount = Number(b.target_amount ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

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
    const salesRankingMap = new Map<string, number>();
    const budgetByUserMap = new Map<string, number>();
    const visitGoalByUserMap = new Map<string, number>();
    const userById = new Map(users.map((user) => [user.id, user]));
    const headOfficeSalesUserId = users.find(
      (user) => user.name === HEAD_OFFICE_SALES_NAME || user.department === HEAD_OFFICE_SALES_NAME
    )?.id ?? null;

    const mappableUsers = users.filter((u) => u.id !== headOfficeSalesUserId);
    const profileIdsByDepartment = new Map<number, string[]>();
    mappableUsers.forEach((u) => {
      if (!u.department_id) return;
      const current = profileIdsByDepartment.get(u.department_id) ?? [];
      current.push(u.id);
      profileIdsByDepartment.set(u.department_id, current);
    });

    const profileStaffCodeMap = new Map<string, string>();
    const scopedCodeOwners = new Map<string, Set<string>>();

    for (const [departmentId, profileIds] of profileIdsByDepartment.entries()) {
      const { data: profileStaffMapsData, error: profileStaffMapsError } = await supabaseAdmin
        .from('profile_external_staff_maps')
        .select('profile_id, external_staff_code')
        .eq('department_id', departmentId)
        .in('profile_id', profileIds);

      if (profileStaffMapsError) {
        console.error('kpi profile external staff maps error:', profileStaffMapsError);
        return res.status(500).json({ error: 'profile external staff maps fetch failed' });
      }

      (profileStaffMapsData ?? []).forEach((row: any) => {
        if (row.profile_id && row.external_staff_code) {
          const code = String(row.external_staff_code);
          profileStaffCodeMap.set(
            `${departmentId}|${code}`,
            String(row.profile_id)
          );

          const owners = scopedCodeOwners.get(code) ?? new Set<string>();
          owners.add(String(row.profile_id));
          scopedCodeOwners.set(code, owners);
        }
      });
    }

    const uniqueScopedCodeMap = new Map<string, string>();
    scopedCodeOwners.forEach((owners, code) => {
      if (owners.size === 1) {
        uniqueScopedCodeMap.set(code, Array.from(owners)[0]);
      }
    });

    const resolveSalesRowProfileId = (row: any) => {
      const staffCode = row.external_staff_code ? String(row.external_staff_code) : '';
      if (!staffCode) return headOfficeSalesUserId;

      const departmentKey = `${row.department_id}|${staffCode}`;
      const exactProfileId = profileStaffCodeMap.get(departmentKey);
      if (exactProfileId) {
        return exactProfileId;
      }

      return uniqueScopedCodeMap.get(staffCode) ?? headOfficeSalesUserId;
    };

    scopedBudgets.forEach((b: any) => {
      const amount = Number(b.target_amount ?? 0);
      if (!Number.isFinite(amount) || !b.user_id) return;
      budgetByUserMap.set(String(b.user_id), (budgetByUserMap.get(String(b.user_id)) ?? 0) + amount);

      const visitGoal = Number(b.KPI ?? 0);
      if (Number.isFinite(visitGoal) && visitGoal > 0) {
        visitGoalByUserMap.set(
          String(b.user_id),
          (visitGoalByUserMap.get(String(b.user_id)) ?? 0) + visitGoal
        );
      }
    });

    scopedCurrentDeals.forEach((d: any) => {
      const user = userById.get(d.user_id);
      if (!user) return;

      const isVisitAction = d.executed_action_type
        ? d.executed_action_type === '訪問'
        : d.activity_type === 'visit';

      if (isVisitAction) {
        visitRankingMap.set(user.id, (visitRankingMap.get(user.id) ?? 0) + 1);
      }
    });

    scopedMergedProspectsInPeriod.forEach((p: any) => {
      const user = userById.get(p.created_by);
      if (!user) return;

      wonRankingMap.set(user.id, (wonRankingMap.get(user.id) ?? 0) + 1);
    });

    const buildSalesByUserMap = (rows: any[], options?: { includeHeadOffice?: boolean }) => {
      const result = new Map<string, number>();

      rows.forEach((row: any) => {
        const profileId = resolveSalesRowProfileId(row);
        if (!profileId || !allowedUserIds.has(profileId)) {
          return;
        }

        if (!options?.includeHeadOffice && profileId === headOfficeSalesUserId) {
          return;
        }

        const user = userById.get(profileId);
        if (!user) return;

        const amount = Number(row.amount ?? 0);
        if (!Number.isFinite(amount)) return;

        result.set(user.id, (result.get(user.id) ?? 0) + amount);
      });

      return result;
    };

    const currentSalesAllMap = buildSalesByUserMap(currentSalesRows, { includeHeadOffice: true });
    const previousSalesAllMap = buildSalesByUserMap(previousSalesRows, { includeHeadOffice: true });
    const previousSalesRankingMap = buildSalesByUserMap(previousSalesRows);
    buildSalesByUserMap(currentSalesRows).forEach((amount, userId) => {
      salesRankingMap.set(userId, amount);
    });

    const firstNonEmpty = (...values: Array<unknown>) => {
      for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized) return normalized;
      }
      return '';
    };

    const productCategoryLabelMap = new Map<string, string>();
    productCategoryMasters.forEach((row: any) => {
      const departmentId = Number(row.department_id);
      const productCode = String(row.normalized_product_code ?? '').trim();
      if (!Number.isFinite(departmentId) || !productCode) return;

      productCategoryLabelMap.set(
        `${departmentId}|${productCode}`,
        firstNonEmpty(
          row.major_category,
          row.proposal_category,
          row.normalized_product_name,
          row.normalized_product_code,
          UNCLASSIFIED_PRODUCT_LABEL,
        )
      );
    });

    const buildProductDepartmentMap = (rows: any[]) => {
      const result = new Map<string, number>();

      rows.forEach((row: any) => {
        const profileId = resolveSalesRowProfileId(row);
        if (!profileId || !allowedUserIds.has(profileId)) {
          return;
        }

        const amount = Number(row.amount ?? 0);
        if (!Number.isFinite(amount)) return;

        const productCode = String(row.normalized_product_code ?? '').trim();
        const safeLabel = firstNonEmpty(
          productCategoryLabelMap.get(`${row.department_id}|${productCode}`),
          UNCLASSIFIED_PRODUCT_LABEL,
        );

        result.set(safeLabel, (result.get(safeLabel) ?? 0) + amount);
      });

      return result;
    };

    const currentProductDepartmentMap = buildProductDepartmentMap(currentSalesRows);
    const previousProductDepartmentMap = buildProductDepartmentMap(previousSalesRows);

    const sumSalesMap = (salesMap: Map<string, number>) =>
      Array.from(salesMap.entries()).reduce((sum, [userId, amount]) => {
        if (!allowedUserIds.has(userId)) return sum;
        return sum + amount;
      }, 0);

    const sharedSalesTotal = sumSalesMap(currentSalesAllMap);
    const sharedPreviousSalesTotal = sumSalesMap(previousSalesAllMap);
    const achievementRate = budgetTotal > 0 ? Number(((sharedSalesTotal / budgetTotal) * 100).toFixed(1)) : 0;
    const changeRate = sharedPreviousSalesTotal > 0
      ? Number((((sharedSalesTotal - sharedPreviousSalesTotal) / sharedPreviousSalesTotal) * 100).toFixed(1))
      : sharedSalesTotal > 0
        ? null
        : 0;

    const currentProductDepartmentTotal = Array.from(currentProductDepartmentMap.values())
      .reduce((sum, value) => sum + value, 0);

    const product_department_sales = Array.from(currentProductDepartmentMap.entries())
      .map(([label, sales]) => {
        const previousSales = previousProductDepartmentMap.get(label) ?? 0;
        const departmentChangeRate = previousSales > 0
          ? Number((((sales - previousSales) / previousSales) * 100).toFixed(1))
          : sales > 0
            ? null
            : 0;

        return {
          key: label,
          label,
          sales: Math.round(sales),
          share: currentProductDepartmentTotal > 0
            ? Number(((sales / currentProductDepartmentTotal) * 100).toFixed(1))
            : 0,
          change_rate: departmentChangeRate,
        };
      })
      .sort((a, b) => b.sales - a.sales || a.label.localeCompare(b.label, 'ja'));

    const visit_ranking = Array.from(visitRankingMap.entries())
      .map(([userId, count]) => ({ name: userById.get(userId)?.name ?? '', count }))
      .filter((item) => item.name)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const won_ranking = Array.from(wonRankingMap.entries())
      .map(([userId, count]) => ({ name: userById.get(userId)?.name ?? '', count }))
      .filter((item) => item.name)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const sales_ranking = Array.from(salesRankingMap.entries())
      .map(([userId, sales]) => ({ user_id: userId, name: userById.get(userId)?.name ?? '', sales: Math.round(sales) }))
      .filter((item) => item.user_id !== headOfficeSalesUserId)
      .filter((item) => item.name)
      .map(({ name, sales }) => ({ name, sales }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);

    const performance_ranking = filteredUsers
      .map((user) => ({
        user_id: user.id,
        name: user.name,
        sales: Math.round(salesRankingMap.get(user.id) ?? 0),
        budget: Math.round(budgetByUserMap.get(user.id) ?? 0),
        visits: visitRankingMap.get(user.id) ?? 0,
        visit_goal: visitGoalByUserMap.get(user.id) ?? null,
        won_count: wonRankingMap.get(user.id) ?? 0,
      }))
      .filter((row) => row.user_id !== headOfficeSalesUserId)
      .sort((a, b) => b.sales - a.sales || b.visits - a.visits || a.name.localeCompare(b.name, 'ja'));

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
        sales: sharedSalesTotal,
        budget: budgetTotal,
        achievement_rate: achievementRate,
        target_year_months: targetYearMonths,
        budget_month_keys: budgetMonthKeys,
      },
      sales: {
        sales: sharedSalesTotal,
        prev_sales: sharedPreviousSalesTotal,
        change_rate: changeRate,
      },
      performance_ranking,
      sales_ranking,
      visit_ranking,
      won_ranking,
      conversion_rate: conversionRate,
      new_prospects_count: newProspectsCount,
      merged_new_orders_count: mergedProspectsCount,
      avg_order_value: avgOrderValue,
      product_department_sales,
      new_orders,
    });
  } catch (error) {
    console.error('kpi api unexpected error:', error);
    return res.status(500).json({ error: 'kpi api failed' });
  }
}
