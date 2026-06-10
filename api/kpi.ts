import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';
import {
  getPeriodRange,
  getYearMonthsBetween,
  toDateString,
  type Period,
} from '../src/lib/dateUtils.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from './_lib/auth.js';
import {
  fetchRegionalSalesTotal,
  normalizeSalesImportDataKind,
} from './_lib/regionalReads.js';
import { fetchFirstOrderDateByCustomerCode, filterMergedProspectsByFirstOrderDate } from './_lib/newOrderDates.js';
import { detectExistingDealWins } from './_lib/existingDealWins.js';
import newOrdersHandler from '../src/server-handlers/kpi/new-orders.js';
import salesPerformanceHandler from '../src/server-handlers/kpi/sales-performance.js';
import clinicAssetsHandler from '../src/server-handlers/kpi/clinic-assets.js';


type Granularity = 'all' | 'department' | 'individual';
const EXCLUDED_DASHBOARD_DEPARTMENTS = new Set(['管理部']);
const HEAD_OFFICE_SALES_NAME = '本社売上';
const UNCLASSIFIED_PRODUCT_LABEL = '未分類';

type DebugStep = {
  stage: string;
  ms: number;
  totalMs: number;
  rows?: number;
  detail?: Record<string, unknown>;
};

type ProductMetadataCacheEntry = {
  productCategoryMasters: any[];
  productDepartments: any[];
  expiresAt: number;
};

const PRODUCT_METADATA_CACHE_TTL_MS = 5 * 60_000;
const productMetadataCache = new Map<string, ProductMetadataCacheEntry>();

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

async function fetchProductMetadata(salesRowDepartmentIds: number[]) {
  if (salesRowDepartmentIds.length === 0) {
    return {
      productCategoryMasters: [],
      productDepartments: [],
      fromCache: false,
    };
  }

  const cacheKey = salesRowDepartmentIds.slice().sort((a, b) => a - b).join(',');
  const cached = productMetadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      productCategoryMasters: cached.productCategoryMasters,
      productDepartments: cached.productDepartments,
      fromCache: true,
    };
  }

  const [productCategoryMastersResult, productDepartmentsResult] = await Promise.all([
    supabaseAdmin
      .from('product_category_masters')
      .select('department_id, normalized_product_code, product_department_id')
      .in('department_id', salesRowDepartmentIds),
    supabaseAdmin
      .from('product_departments')
      .select('id, department_id, name')
      .in('department_id', salesRowDepartmentIds),
  ]);

  if (productCategoryMastersResult.error) {
    throw productCategoryMastersResult.error;
  }

  if (productDepartmentsResult.error) {
    throw productDepartmentsResult.error;
  }

  const productCategoryMasters = productCategoryMastersResult.data ?? [];
  const productDepartments = productDepartmentsResult.data ?? [];
  productMetadataCache.set(cacheKey, {
    productCategoryMasters,
    productDepartments,
    expiresAt: Date.now() + PRODUCT_METADATA_CACHE_TTL_MS,
  });

  return {
    productCategoryMasters,
    productDepartments,
    fromCache: false,
  };
}

async function fetchDashboardSalesRowsFallback({
  startDate,
  endExclusiveDate,
  departmentIds,
  externalStaffCodes,
  dataKind,
}: {
  startDate: string;
  endExclusiveDate: string;
  departmentIds: number[];
  externalStaffCodes: string[];
  dataKind: 'delivery' | 'order';
}) {
  if (departmentIds.length === 0 || externalStaffCodes.length === 0) {
    return [];
  }

  const rows: any[] = [];
  const pageSize = 1000;
  const staffCodeChunkSize = 80;
  const dateColumn = dataKind === 'order' ? 'order_date' : 'delivery_date';

  for (let staffCodeIndex = 0; staffCodeIndex < externalStaffCodes.length; staffCodeIndex += staffCodeChunkSize) {
    const staffCodeChunk = externalStaffCodes.slice(staffCodeIndex, staffCodeIndex + staffCodeChunkSize);
    let from = 0;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from('sales_import_rows')
        .select('department_id, data_kind, customer_code, amount, delivery_date, order_date, external_staff_code, normalized_product_code, normalized_product_name')
        .eq('data_kind', dataKind)
        .gte(dateColumn, startDate)
        .lt(dateColumn, endExclusiveDate)
        .in('department_id', departmentIds)
        .in('external_staff_code', staffCodeChunk)
        .range(from, from + pageSize - 1);

      if (error) {
        throw error;
      }

      const batch = data ?? [];
      rows.push(...batch);

      if (batch.length < pageSize) {
        break;
      }

      from += pageSize;
    }
  }

  return rows;
}

async function fetchDashboardSalesRows({
  startDate,
  endExclusiveDate,
  departmentIds,
  externalStaffCodes,
  dataKind,
}: {
  startDate: string;
  endExclusiveDate: string;
  departmentIds: number[];
  externalStaffCodes: string[];
  dataKind: 'delivery' | 'order';
}) {
  if (departmentIds.length === 0 || externalStaffCodes.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin.rpc('dashboard_sales_import_aggregates', {
    p_start_date: startDate,
    p_end_date: endExclusiveDate,
    p_department_ids: departmentIds,
    p_external_staff_codes: externalStaffCodes,
    p_data_kind: dataKind,
  });

  if (error) {
    console.warn('dashboard sales aggregate rpc fallback:', error.message ?? error);
    return fetchDashboardSalesRowsFallback({
      startDate,
      endExclusiveDate,
      departmentIds,
      externalStaffCodes,
      dataKind,
    });
  }

  return (data ?? []).map((row: any) => ({
    department_id: row.department_id,
    data_kind: dataKind,
    customer_code: null,
    amount: Number(row.sales_total ?? 0),
    delivery_date: dataKind === 'delivery' ? startDate : null,
    order_date: dataKind === 'order' ? startDate : null,
    external_staff_code: row.external_staff_code,
    normalized_product_code: row.normalized_product_code,
    normalized_product_name: null,
  }));
}

export default async function handler(req: any, res: any) {
  const route = getKpiRoute(req);

  if (route === 'new-orders') {
    return newOrdersHandler(req, res);
  }

  if (route === 'sales-performance') {
    return salesPerformanceHandler(req, res);
  }

  if (route === 'clinic-assets') {
    return clinicAssetsHandler(req, res);
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const debugStartedAt = Date.now();
    let debugLastAt = debugStartedAt;
    const debugSteps: DebugStep[] = [];
    const markDebug = (stage: string, detail?: Record<string, unknown>, rows?: number) => {
      const now = Date.now();
      const step = {
        stage,
        ms: now - debugLastAt,
        totalMs: now - debugStartedAt,
        rows,
        detail,
      };
      debugSteps.push(step);
      console.info(
        `[debug] dashboard-kpi server stage=${stage} ms=${step.ms} total=${step.totalMs} rows=${rows ?? '-'}`
      );
      debugLastAt = now;
    };

    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireDashboardAccess(profile, res)) return;
    markDebug('auth');

    const period = (req.query.period as Period | undefined) ?? 'monthly';
    const granularity = (req.query.granularity as Granularity | undefined) ?? 'all';
    const departmentIdParam = (req.query.departmentId as string | undefined) ?? '';
    const legacyDepartment = (req.query.department as string | undefined) ?? '';
    const userId = (req.query.userId as string | undefined) ?? '';
    const dataKind = normalizeSalesImportDataKind(req.query.data_kind);
    const includeExistingDealWins = req.query.includeExistingDealWins === '1'
      || req.query.include_existing_deal_wins === '1';

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
    markDebug('profiles', undefined, profilesData?.length ?? 0);

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
    const [
      createdProspectsResult,
      mergedProspectsInPeriodResult,
      currentDealsResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('prospect_customers')
        .select('id, status, merged_customer_code, merged_at, created_by, created_at')
        .gte('created_at', currentStart)
        .lt('created_at', currentEnd),
      supabaseAdmin
        .from('prospect_customers')
        .select('id, name, created_by, merged_customer_code, merged_at, status')
        .eq('status', 'merged')
        .not('merged_customer_code', 'is', null),
      supabaseAdmin
        .from('deals')
        .select('id, user_id, customer_code, prospect_customer_id, deal_date, activity_type, executed_action_type, amount, created_at, customers(name), prospect_customers(name)')
        .gte('deal_date', currentStart)
        .lt('deal_date', currentEnd),
    ]);

    if (createdProspectsResult.error) {
      console.error('kpi prospects error:', createdProspectsResult.error);
      return res.status(500).json({ error: 'prospects fetch failed' });
    }

    if (mergedProspectsInPeriodResult.error) {
      console.error('kpi merged prospects error:', mergedProspectsInPeriodResult.error);
      return res.status(500).json({ error: 'merged prospects fetch failed' });
    }

    if (currentDealsResult.error) {
      console.error('kpi current deals error:', currentDealsResult.error);
      return res.status(500).json({ error: 'current deals fetch failed' });
    }

    const createdProspects = createdProspectsResult.data ?? [];
    const mergedProspectsInPeriod = mergedProspectsInPeriodResult.data ?? [];
    const currentDeals = currentDealsResult.data ?? [];
    markDebug('prospects_and_deals', {
      createdProspects: createdProspects?.length ?? 0,
      mergedProspects: mergedProspectsInPeriod?.length ?? 0,
      currentDeals: currentDeals?.length ?? 0,
      filteredUsers: filteredUsers.length,
      allowedDepartmentIds: allowedDepartmentIds.length,
    }, (createdProspects?.length ?? 0) + (mergedProspectsInPeriod?.length ?? 0) + (currentDeals?.length ?? 0));

    const scopedMergedProspectsByOwner = (mergedProspectsInPeriod ?? []).filter((p: any) =>
      allowedUserIds.has(p.created_by)
    );
    const firstOrderDateByCustomerCode = await fetchFirstOrderDateByCustomerCode(
      scopedMergedProspectsByOwner.map((p: any) => p.merged_customer_code).filter(Boolean)
    );
    const scopedMergedProspectsInPeriod = filterMergedProspectsByFirstOrderDate(
      scopedMergedProspectsByOwner,
      firstOrderDateByCustomerCode,
      currentStart,
      currentEnd
    );

    const mergedCustomerCodesInPeriod = Array.from(
      new Set(scopedMergedProspectsInPeriod.map((p: any) => p.merged_customer_code).filter(Boolean))
    );

    let mergedCustomersData: any[] = [];
    if (mergedCustomerCodesInPeriod.length > 0) {
      const { data, error: mergedCustomersError } = await supabaseAdmin
        .from('customers')
        .select('code, name')
        .in('code', mergedCustomerCodesInPeriod);

      if (mergedCustomersError) {
        console.error('kpi merged customers error:', mergedCustomersError);
        return res.status(500).json({ error: 'merged customers fetch failed' });
      }

      mergedCustomersData = data ?? [];
    }

    const mergedCustomerNameMap = new Map<string, string>();
    (mergedCustomersData ?? []).forEach((c: any) => {
      mergedCustomerNameMap.set(c.code, c.name ?? c.code);
    });

    let mergedSalesTotal = 0;
    if (mergedCustomerCodesInPeriod.length > 0) {
      try {
        mergedSalesTotal = await fetchRegionalSalesTotal({
          startDate: currentStart,
          endExclusiveDate: currentEnd,
          customerCodes: mergedCustomerCodesInPeriod,
          dataKind,
        });
      } catch (e) {
        console.error('kpi merged sales error:', e);
      }
    }
    markDebug('new_order_lookup', {
      scopedMergedProspects: scopedMergedProspectsInPeriod.length,
      mergedCustomerCodes: mergedCustomerCodesInPeriod.length,
      mergedCustomers: mergedCustomersData?.length ?? 0,
    }, mergedCustomerCodesInPeriod.length);

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

    let budgetsResult = await buildBudgetsQuery('user_id, external_staff_code, department_id, target_year_month, target_amount, kpivisit, kpiclosure, "KPI_new_order_amount"');

    if (budgetsResult.error && String(budgetsResult.error.message ?? '').includes('KPI')) {
      console.warn('kpi budgets fallback: KPI columns not available yet, retrying without KPI columns');
      budgetsResult = await buildBudgetsQuery('user_id, external_staff_code, department_id, target_year_month, target_amount');
    }

    const { data: budgetsData, error: budgetsError } = budgetsResult;

    if (budgetsError) {
      console.error('kpi budgets error:', budgetsError);
      return res.status(500).json({ error: 'budgets fetch failed' });
    }
    markDebug('budgets', {
      targetYearMonths: targetYearMonths.length,
      budgetMonthKeys: budgetMonthKeys.length,
    }, budgetsData?.length ?? 0);

    const scopedCreatedProspects = (createdProspects ?? []).filter((p: any) =>
      allowedUserIds.has(p.created_by)
    );

    const scopedCurrentDeals = (currentDeals ?? []).filter((d: any) => allowedUserIds.has(d.user_id));
    const existingDealWins = includeExistingDealWins
      ? await detectExistingDealWins({
        startDate: currentStart,
        endExclusiveDate: currentEnd,
        allowedUserIds,
      })
      : [];
    markDebug('existing_deal_wins', undefined, existingDealWins.length);
    const scopedBudgets = (budgetsData ?? []).filter((b: any) => {
      if (granularity === 'individual') return b.user_id === userId;
      if (granularity === 'department') return allowedDepartmentIds.includes(b.department_id);
      return allowedUserIds.has(b.user_id);
    });

    const userById = new Map(users.map((user) => [user.id, user]));
    const headOfficeSalesUserId = users.find(
      (user) => user.name === HEAD_OFFICE_SALES_NAME || user.department === HEAD_OFFICE_SALES_NAME
    )?.id ?? null;
    const mappableUsers = filteredUsers.filter((u) => u.id !== headOfficeSalesUserId);
    const profileIdsByDepartment = new Map<number, string[]>();
    mappableUsers.forEach((u) => {
      if (!u.department_id) return;
      const current = profileIdsByDepartment.get(u.department_id) ?? [];
      current.push(u.id);
      profileIdsByDepartment.set(u.department_id, current);
    });

    const profileStaffCodeMap = new Map<string, string>();
    const allowedExternalStaffCodes = new Set<string>();
    let profileStaffMapRows = 0;
    const mappableProfileIds = mappableUsers.map((user) => user.id);

    if (allowedDepartmentIds.length > 0 && mappableProfileIds.length > 0) {
      const { data: profileStaffMapsData, error: profileStaffMapsError } = await supabaseAdmin
        .from('profile_external_staff_maps')
        .select('profile_id, department_id, external_staff_code')
        .in('department_id', allowedDepartmentIds)
        .in('profile_id', mappableProfileIds);

      if (profileStaffMapsError) {
        console.error('kpi profile external staff maps error:', profileStaffMapsError);
        return res.status(500).json({ error: 'profile external staff maps fetch failed' });
      }

      profileStaffMapRows += profileStaffMapsData?.length ?? 0;
      (profileStaffMapsData ?? []).forEach((row: any) => {
        const departmentId = Number(row.department_id);
        if (row.profile_id && row.external_staff_code && Number.isFinite(departmentId)) {
          const code = String(row.external_staff_code);
          profileStaffCodeMap.set(
            `${departmentId}|${code}`,
            String(row.profile_id)
          );
          allowedExternalStaffCodes.add(code);
        }
      });
    }
    markDebug('profile_external_staff_maps', {
      departments: profileIdsByDepartment.size,
      mappedCodes: profileStaffCodeMap.size,
      allowedExternalStaffCodes: allowedExternalStaffCodes.size,
    }, profileStaffMapRows);

    let currentSalesRows: any[] = [];
    let previousSalesRows: any[] = [];

    try {
      [currentSalesRows, previousSalesRows] = await Promise.all([
        fetchDashboardSalesRows({
          startDate: currentStart,
          endExclusiveDate: currentEnd,
          departmentIds: allowedDepartmentIds,
          externalStaffCodes: Array.from(allowedExternalStaffCodes),
          dataKind,
        }),
        fetchDashboardSalesRows({
          startDate: previousStart,
          endExclusiveDate: previousEnd,
          departmentIds: allowedDepartmentIds,
          externalStaffCodes: Array.from(allowedExternalStaffCodes),
          dataKind,
        }),
      ]);
    } catch (salesImportRowsError) {
      console.error('kpi sales import rows error:', salesImportRowsError);
      return res.status(500).json({ error: 'sales import rows fetch failed' });
    }
    markDebug('sales_import_rows', {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      currentSalesRows: currentSalesRows.length,
      previousSalesRows: previousSalesRows.length,
      dataKind,
      allowedDepartmentIds: allowedDepartmentIds.length,
      allowedExternalStaffCodes: allowedExternalStaffCodes.size,
    }, currentSalesRows.length + previousSalesRows.length);

    const salesRowDepartmentIds = Array.from(new Set(
      [...currentSalesRows, ...previousSalesRows]
        .map((row: any) => Number(row.department_id))
        .filter((value) => Number.isFinite(value) && value > 0)
    ));

    let productCategoryMasters: any[] = [];
    let productDepartments: any[] = [];
    let productMetadataFromCache = false;
    try {
      const productMetadata = await fetchProductMetadata(salesRowDepartmentIds);
      productCategoryMasters = productMetadata.productCategoryMasters;
      productDepartments = productMetadata.productDepartments;
      productMetadataFromCache = productMetadata.fromCache;
    } catch (productMetadataError) {
      console.error('kpi product metadata error:', productMetadataError);
      return res.status(500).json({ error: 'product metadata fetch failed' });
    }
    markDebug('product_metadata', {
      salesRowDepartmentIds: salesRowDepartmentIds.length,
      productCategoryMasters: productCategoryMasters.length,
      productDepartments: productDepartments.length,
      fromCache: productMetadataFromCache,
    }, productCategoryMasters.length + productDepartments.length);

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
    const closureGoalByUserMap = new Map<string, number>();
    const newOrderAmountGoalByUserMap = new Map<string, number>();

    const resolveSalesRowProfileId = (row: any) => {
      const staffCode = row.external_staff_code ? String(row.external_staff_code) : '';
      if (!staffCode) return headOfficeSalesUserId;

      const departmentKey = `${row.department_id}|${staffCode}`;
      const exactProfileId = profileStaffCodeMap.get(departmentKey);
      if (exactProfileId) {
        return exactProfileId;
      }

      return headOfficeSalesUserId;
    };

    scopedBudgets.forEach((b: any) => {
      const amount = Number(b.target_amount ?? 0);
      if (!Number.isFinite(amount) || !b.user_id) return;
      budgetByUserMap.set(String(b.user_id), (budgetByUserMap.get(String(b.user_id)) ?? 0) + amount);

      const visitGoal = Number(b.kpivisit ?? 0);
      if (Number.isFinite(visitGoal) && visitGoal > 0) {
        visitGoalByUserMap.set(
          String(b.user_id),
          (visitGoalByUserMap.get(String(b.user_id)) ?? 0) + visitGoal
        );
      }

      const closureGoal = Number(b.kpiclosure ?? 0);
      if (Number.isFinite(closureGoal) && closureGoal > 0) {
        closureGoalByUserMap.set(
          String(b.user_id),
          (closureGoalByUserMap.get(String(b.user_id)) ?? 0) + closureGoal
        );
      }

      const newOrderAmountGoal = Number(b.KPI_new_order_amount ?? 0);
      if (Number.isFinite(newOrderAmountGoal) && newOrderAmountGoal > 0) {
        newOrderAmountGoalByUserMap.set(
          String(b.user_id),
          (newOrderAmountGoalByUserMap.get(String(b.user_id)) ?? 0) + newOrderAmountGoal
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

    existingDealWins.forEach((win) => {
      const user = userById.get(win.user_id);
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

    const productDepartmentNameById = new Map<string, string>();
    productDepartments.forEach((row: any) => {
      const id = String(row.id ?? '').trim();
      const name = String(row.name ?? '').trim();
      if (id && name) {
        productDepartmentNameById.set(id, name);
      }
    });

    const productCategoryDepartmentMap = new Map<string, string>();
    productCategoryMasters.forEach((row: any) => {
      const departmentId = Number(row.department_id);
      const productCode = String(row.normalized_product_code ?? '').trim();
      const productDepartmentId = String(row.product_department_id ?? '').trim();
      if (!Number.isFinite(departmentId) || !productCode || !productDepartmentId) return;

      productCategoryDepartmentMap.set(
        `${departmentId}|${productCode}`,
        productDepartmentId,
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
        const productDepartmentId = productCategoryDepartmentMap.get(`${row.department_id}|${productCode}`) ?? '';
        const safeLabel = productDepartmentNameById.get(productDepartmentId) ?? UNCLASSIFIED_PRODUCT_LABEL;

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
        closure_goal: closureGoalByUserMap.get(user.id) ?? null,
        new_order_amount_goal: newOrderAmountGoalByUserMap.get(user.id) ?? null,
      }))
      .filter((row) => row.user_id !== headOfficeSalesUserId)
      .sort((a, b) => b.sales - a.sales || b.visits - a.visits || a.name.localeCompare(b.name, 'ja'));

    const new_orders = scopedMergedProspectsInPeriod
      .slice()
      .sort((a: any, b: any) => {
        const leftCode = String(a.merged_customer_code ?? '');
        const rightCode = String(b.merged_customer_code ?? '');
        return new Date(firstOrderDateByCustomerCode.get(rightCode) ?? b.merged_at).getTime()
          - new Date(firstOrderDateByCustomerCode.get(leftCode) ?? a.merged_at).getTime();
      })
      .slice(0, 10)
      .map((p: any) => {
        const user = users.find((u) => u.id === p.created_by);
        const customerCode = p.merged_customer_code;
        return {
          clinic: mergedCustomerNameMap.get(customerCode) ?? p.name ?? customerCode,
          clinic_kind: 'customer',
          clinic_id: customerCode,
          customer_code: customerCode,
          prospect_customer_id: p.id,
          sales: user?.name ?? '',
        };
      });
    markDebug('build_response', {
      performanceRanking: performance_ranking.length,
      productDepartmentSales: product_department_sales.length,
      newOrders: new_orders.length,
    });

    return res.status(200).json({
      data_kind: dataKind,
      filter_options: {
        users,
        departments: Array.from(
          new Map(
            users
              .filter((user) => user.department_id != null && user.department)
              .map((user) => [String(user.department_id), {
                id: String(user.department_id),
                name: user.department,
              }])
          ).values()
        ),
      },
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
      debug: {
        endpoint: 'dashboard-kpi',
        totalMs: Date.now() - debugStartedAt,
        steps: debugSteps,
        counts: {
          profiles: profilesData?.length ?? 0,
          users: users.length,
          filteredUsers: filteredUsers.length,
          allowedDepartmentIds: allowedDepartmentIds.length,
          createdProspects: createdProspects?.length ?? 0,
          mergedProspects: mergedProspectsInPeriod?.length ?? 0,
          currentDeals: currentDeals?.length ?? 0,
          budgets: budgetsData?.length ?? 0,
          scopedBudgets: scopedBudgets.length,
          existingDealWins: existingDealWins.length,
          currentSalesRows: currentSalesRows.length,
          previousSalesRows: previousSalesRows.length,
          salesRowDepartmentIds: salesRowDepartmentIds.length,
          productCategoryMasters: productCategoryMasters.length,
          productDepartments: productDepartments.length,
          profileStaffMapRows,
          mappedStaffCodes: profileStaffCodeMap.size,
          performanceRanking: performance_ranking.length,
        },
      },
    });
  } catch (error) {
    console.error('kpi api unexpected error:', error);
    return res.status(500).json({ error: 'kpi api failed' });
  }
}
