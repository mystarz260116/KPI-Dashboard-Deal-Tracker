import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { expandYearMonthFormats, toDateString } from '../../lib/dateUtils.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../../api/_lib/auth.js';
import { normalizeSalesImportDataKind } from '../../../api/_lib/regionalReads.js';

type AssetPeriod = '3m' | '6m' | '12m';

type SalesRow = {
  department_id: number | null;
  customer_code: string;
  customer_name: string | null;
  external_staff_code: string | null;
  amount: number | null;
  delivery_date: string | null;
  order_date: string | null;
};

type ExcludedSalesReason = '得意先コードなし' | '担当紐付け漏れ' | '医院アセット対象外';

type ProfileRow = {
  id: string;
  name: string;
  department_id: number | null;
  departments?: { name?: string | null } | null;
};

type ClinicAssetCareRow = {
  customer_code: string;
  care_status: string | null;
  next_care_date: string | null;
  care_memo: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

const EXCLUDED_DASHBOARD_DEPARTMENTS = new Set(['管理部']);
const EXCLUDED_SALES_EXTERNAL_STAFF_CODES = new Set(['100', '102', '9999']);
const CLINIC_CARE_STATUSES = new Set(['未対応', '確認中', '提案中', '維持完了', '離反懸念', '対象外']);

type DebugStep = {
  stage: string;
  ms: number;
  totalMs: number;
  rows?: number;
  detail?: Record<string, unknown>;
};

function parsePeriod(value: unknown): AssetPeriod {
  return value === '6m' || value === '12m' ? value : '3m';
}

function getMonthCount(period: AssetPeriod) {
  if (period === '12m') return 12;
  if (period === '6m') return 6;
  return 3;
}

function parseDepartmentId(value: unknown) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(value: string) {
  const [year, month] = value.split('-');
  return `${year}/${month}`;
}

function monthStart(value: string) {
  const [year, month] = value.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return new Date(year, month - 1, 1);
}

function addMonths(date: Date, diff: number) {
  return new Date(date.getFullYear(), date.getMonth() + diff, 1);
}

function fiscalYearStart(date: Date) {
  const fiscalYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(fiscalYear, 3, 1);
}

function getDisplayMonths(targetMonth: string, period: AssetPeriod) {
  const count = getMonthCount(period);
  const end = monthStart(targetMonth);
  const start = addMonths(end, -(count - 1));
  return Array.from({ length: count }, (_, index) => monthKey(addMonths(start, index)));
}

function normalizeTargetMonth(value: unknown) {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  return monthKey(new Date());
}

function amountOf(row: SalesRow) {
  const amount = Number(row.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeCareStatus(value: unknown) {
  const status = String(value ?? '').trim();
  if (status === '失注懸念') return '離反懸念';
  return CLINIC_CARE_STATUSES.has(status) ? status : '未対応';
}

function normalizeOptionalDate(value: unknown) {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function normalizeMemo(value: unknown) {
  return String(value ?? '').slice(0, 2000);
}

function formatStaffDisplayName(staffCode: string | null, name: string) {
  const code = String(staffCode ?? '').trim();
  return code ? `${code} ${name}` : name;
}

async function fetchSalesRowsFallback({
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

  const rows: SalesRow[] = [];
  const pageSize = 1000;
  const dateColumn = dataKind === 'order' ? 'order_date' : 'delivery_date';
  const staffCodeChunkSize = 80;

  for (let staffCodeIndex = 0; staffCodeIndex < externalStaffCodes.length; staffCodeIndex += staffCodeChunkSize) {
    const staffCodeChunk = externalStaffCodes.slice(staffCodeIndex, staffCodeIndex + staffCodeChunkSize);
    let from = 0;

    while (true) {
      const query = supabaseAdmin
        .from('sales_import_rows')
        .select('department_id, customer_code, customer_name, external_staff_code, amount, delivery_date, order_date')
        .eq('data_kind', dataKind)
        .gte(dateColumn, startDate)
        .lt(dateColumn, endExclusiveDate)
        .in('department_id', departmentIds)
        .in('external_staff_code', staffCodeChunk)
        .range(from, from + pageSize - 1);

      const { data, error } = await query;
      if (error) throw error;

      const batch = (data ?? []) as SalesRow[];
      rows.push(...batch);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
  }

  return rows;
}

async function fetchSalesRows({
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

  const rpcStartedAt = Date.now();
  console.info(
    `[debug] clinic-assets sales rpc start kind=${dataKind} start=${startDate} end=${endExclusiveDate} departments=${departmentIds.length} staffCodes=${externalStaffCodes.length}`
  );

  const rows: any[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .rpc('clinic_asset_sales_aggregates', {
        p_start_date: startDate,
        p_end_date: endExclusiveDate,
        p_department_ids: departmentIds,
        p_external_staff_codes: externalStaffCodes,
        p_data_kind: dataKind,
      })
      .range(from, from + pageSize - 1);

    if (error) {
      console.info(
        `[debug] clinic-assets sales rpc end kind=${dataKind} ms=${Date.now() - rpcStartedAt} rows=${rows.length} error=${error.message ?? '-'}`
      );
      console.warn('clinic asset aggregate rpc fallback:', error.message ?? error);
      return fetchSalesRowsFallback({
        startDate,
        endExclusiveDate,
        departmentIds,
        externalStaffCodes,
        dataKind,
      });
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < pageSize) {
      break;
    }
  }

  console.info(
    `[debug] clinic-assets sales rpc end kind=${dataKind} ms=${Date.now() - rpcStartedAt} rows=${rows.length} error=-`
  );

  return rows.map((row: any) => ({
    department_id: row.department_id,
    customer_code: row.customer_code,
    customer_name: row.customer_name,
    external_staff_code: row.external_staff_code,
    amount: Number(row.sales_total ?? 0),
    delivery_date: dataKind === 'delivery' ? `${row.sales_month}-01` : null,
    order_date: dataKind === 'order' ? `${row.sales_month}-01` : null,
  })) as SalesRow[];
}

async function fetchSalesRowsForAudit({
  startDate,
  endExclusiveDate,
  departmentIds,
  dataKind,
}: {
  startDate: string;
  endExclusiveDate: string;
  departmentIds: number[];
  dataKind: 'delivery' | 'order';
}) {
  if (departmentIds.length === 0) {
    return [];
  }

  const rows: SalesRow[] = [];
  const pageSize = 1000;
  const dateColumn = dataKind === 'order' ? 'order_date' : 'delivery_date';
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('sales_import_rows')
      .select('department_id, customer_code, customer_name, external_staff_code, amount, delivery_date, order_date')
      .eq('data_kind', dataKind)
      .gte(dateColumn, startDate)
      .lt(dateColumn, endExclusiveDate)
      .in('department_id', departmentIds)
      .not('external_staff_code', 'in', `(${Array.from(EXCLUDED_SALES_EXTERNAL_STAFF_CODES).join(',')})`)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as SalesRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
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
        `[debug] clinic-assets server stage=${stage} ms=${step.ms} total=${step.totalMs} rows=${rows ?? '-'}`
      );
      debugLastAt = now;
    };

    markDebug('request_received', {
      period: req.query.period,
      month: req.query.month,
      data_kind: req.query.data_kind,
      departmentId: req.query.departmentId,
      userId: req.query.userId,
    });
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireDashboardAccess(profile, res)) return;
    markDebug('auth');

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
      const customerCode = String(body.customer_code ?? '').trim();

      if (!customerCode) {
        return res.status(400).json({ error: 'customer_code is required' });
      }

      const payload = {
        customer_code: customerCode,
        care_status: normalizeCareStatus(body.care_status ?? body.status),
        next_care_date: normalizeOptionalDate(body.next_care_date ?? body.next_action_date),
        care_memo: normalizeMemo(body.care_memo ?? body.memo),
        department_id: Number.isFinite(Number(body.department_id)) ? Number(body.department_id) : null,
        user_id: String(body.user_id ?? '').trim() || null,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      };

      const { data: savedAction, error: saveError } = await supabaseAdmin
        .from('clinic_asset_cares')
        .upsert(payload, { onConflict: 'customer_code' })
        .select('customer_code, care_status, next_care_date, care_memo, updated_at, updated_by')
        .single();

      if (saveError) {
        console.error('clinic asset care save error:', saveError);
        return res.status(500).json({ error: 'clinic asset care save failed' });
      }

      return res.status(200).json({
        management: {
          status: savedAction?.care_status ?? '未対応',
          next_action_date: savedAction?.next_care_date ?? null,
          memo: savedAction?.care_memo ?? '',
          updated_at: savedAction?.updated_at ?? null,
          updated_by: savedAction?.updated_by ?? null,
        },
      });
    }

    const targetMonth = normalizeTargetMonth(req.query.month);
    const period = parsePeriod(req.query.period);
    const dataKind = normalizeSalesImportDataKind(req.query.data_kind);
    const departmentId = parseDepartmentId(req.query.departmentId);
    const userId = String(req.query.userId ?? '').trim();
    const months = getDisplayMonths(targetMonth, period);
    const budgetMonthKeys = expandYearMonthFormats(months);
    const targetMonthBudgetKeys = new Set(expandYearMonthFormats([targetMonth]));
    const targetDate = monthStart(targetMonth);
    const displayStart = monthStart(months[0]);
    const displayEndExclusive = addMonths(monthStart(months[months.length - 1]), 1);
    const currentFiscalStart = fiscalYearStart(targetDate);
    const previousFiscalStart = addMonths(currentFiscalStart, -12);
    const previousFiscalEndExclusive = currentFiscalStart;
    const previousSameMonthStart = addMonths(targetDate, -12);
    const previousSameMonthKey = monthKey(previousSameMonthStart);
    const threeMonthStart = addMonths(displayStart, -3);
    const lookbackStart = new Date(Math.min(
      previousFiscalStart.getTime(),
      previousSameMonthStart.getTime(),
      threeMonthStart.getTime()
    ));

    const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, department_id, departments(name)')
      .order('name', { ascending: true });

    if (profilesError) {
      console.error('clinic assets profiles error:', profilesError);
      return res.status(500).json({ error: 'clinic assets profiles fetch failed' });
    }
    markDebug('profiles', undefined, profilesData?.length ?? 0);

    const users = ((profilesData ?? []) as ProfileRow[])
      .filter((row) => !EXCLUDED_DASHBOARD_DEPARTMENTS.has(row.departments?.name ?? ''));
    const filteredUsers = users.filter((row) => {
      if (departmentId !== null && row.department_id !== departmentId) return false;
      if (userId && row.id !== userId) return false;
      return true;
    });
    const allowedUserIds = new Set(filteredUsers.map((row) => row.id));
    const allowedDepartmentIds = Array.from(new Set(
      filteredUsers
        .map((row) => row.department_id)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    ));

    const { data: staffMapsData, error: staffMapsError } = await supabaseAdmin
      .from('profile_external_staff_maps')
      .select('profile_id, department_id, external_staff_code')
      .in('department_id', allowedDepartmentIds.length > 0 ? allowedDepartmentIds : [-1]);

    if (staffMapsError) {
      console.error('clinic assets staff maps error:', staffMapsError);
      return res.status(500).json({ error: 'clinic assets staff maps fetch failed' });
    }
    markDebug('profile_external_staff_maps', {
      allowedDepartmentIds: allowedDepartmentIds.length,
      filteredUsers: filteredUsers.length,
    }, staffMapsData?.length ?? 0);

    const staffCodeToProfileId = new Map<string, string>();
    const anyStaffCodeToProfileId = new Map<string, string>();
    const primaryStaffCodeByProfileId = new Map<string, string>();
    const allowedExternalStaffCodes = new Set<string>();
    (staffMapsData ?? []).forEach((row: any) => {
      const profileId = String(row.profile_id ?? '');
      const departmentKey = String(row.department_id ?? '');
      const staffCode = String(row.external_staff_code ?? '').trim();
      if (EXCLUDED_SALES_EXTERNAL_STAFF_CODES.has(staffCode)) {
        return;
      }

      if (profileId && departmentKey && staffCode) {
        anyStaffCodeToProfileId.set(`${departmentKey}|${staffCode}`, profileId);
      }
      if (profileId && departmentKey && staffCode && allowedUserIds.has(profileId)) {
        staffCodeToProfileId.set(`${departmentKey}|${staffCode}`, profileId);
        if (!primaryStaffCodeByProfileId.has(profileId)) {
          primaryStaffCodeByProfileId.set(profileId, staffCode);
        }
        allowedExternalStaffCodes.add(staffCode);
      }
    });

    const resolveUserId = (row: SalesRow) => {
      const key = `${row.department_id ?? ''}|${String(row.external_staff_code ?? '').trim()}`;
      return staffCodeToProfileId.get(key) ?? null;
    };

    const [salesRows, auditSalesRows, budgetsResult] = await Promise.all([
      fetchSalesRows({
        startDate: toDateString(lookbackStart),
        endExclusiveDate: toDateString(displayEndExclusive),
        departmentIds: allowedDepartmentIds,
        externalStaffCodes: Array.from(allowedExternalStaffCodes),
        dataKind,
      }),
      fetchSalesRowsForAudit({
        startDate: toDateString(displayStart),
        endExclusiveDate: toDateString(displayEndExclusive),
        departmentIds: allowedDepartmentIds,
        dataKind,
      }),
      supabaseAdmin
        .from('budgets')
        .select('user_id, department_id, target_year_month, target_amount')
        .in('target_year_month', budgetMonthKeys)
        .in('department_id', allowedDepartmentIds.length > 0 ? allowedDepartmentIds : [-1]),
    ]);
    markDebug('sales_rows_and_budgets', {
      salesRows: salesRows.length,
      auditSalesRows: auditSalesRows.length,
      budgetsRows: budgetsResult.data?.length ?? 0,
      allowedExternalStaffCodes: allowedExternalStaffCodes.size,
      months: months.length,
      budgetMonthKeys: budgetMonthKeys.length,
      lookbackStart: toDateString(lookbackStart),
      displayEndExclusive: toDateString(displayEndExclusive),
      previousSameMonth: previousSameMonthKey,
      previousFiscalStart: toDateString(previousFiscalStart),
      previousFiscalEndExclusive: toDateString(previousFiscalEndExclusive),
    }, salesRows.length + auditSalesRows.length);

    if (budgetsResult.error) {
      console.error('clinic assets budgets error:', budgetsResult.error);
      return res.status(500).json({ error: 'clinic assets budgets fetch failed' });
    }

    const scopedRows = salesRows.filter((row) => {
      const resolvedUserId = resolveUserId(row);
      return resolvedUserId ? allowedUserIds.has(resolvedUserId) : false;
    });
    markDebug('scope_rows', {
      scopedRows: scopedRows.length,
    }, scopedRows.length);

    const userById = new Map(users.map((row) => [row.id, row]));
    const departmentNameById = new Map(
      users
        .filter((row) => row.department_id != null)
        .map((row) => [String(row.department_id), row.departments?.name ?? ''])
    );
    const rowsByClinic = new Map<string, {
      customer_code: string;
      customer_name: string;
      department_id: number | null;
      user_id: string | null;
      user_name: string;
      external_staff_code: string | null;
      monthly: Map<string, number>;
      lookback_total: number;
      last_seen_month: string | null;
    }>();
    const previousSameMonthByClinic = new Map<string, number>();
    const previousFiscalByClinic = new Map<string, number>();

    const upsertClinic = (row: SalesRow) => {
      const code = String(row.customer_code ?? '').trim();
      if (!code) return null;

      const resolvedUserId = resolveUserId(row);
      const user = resolvedUserId ? userById.get(resolvedUserId) : null;
      const externalStaffCode = String(row.external_staff_code ?? '').trim()
        || (resolvedUserId ? primaryStaffCodeByProfileId.get(resolvedUserId) : '')
        || null;
      const staffDisplayName = formatStaffDisplayName(externalStaffCode, user?.name ?? '担当未設定');
      const current = rowsByClinic.get(code) ?? {
        customer_code: code,
        customer_name: String(row.customer_name ?? '').trim() || code,
        department_id: row.department_id,
        user_id: resolvedUserId,
        user_name: staffDisplayName,
        external_staff_code: externalStaffCode,
        monthly: new Map<string, number>(),
        lookback_total: 0,
        last_seen_month: null,
      };

      if (!current.user_id && resolvedUserId) {
        current.user_id = resolvedUserId;
        current.user_name = staffDisplayName;
      }
      if (!current.external_staff_code && externalStaffCode) {
        current.external_staff_code = externalStaffCode;
        current.user_name = formatStaffDisplayName(externalStaffCode, user?.name ?? current.user_name);
      }
      if (!current.customer_name || current.customer_name === current.customer_code) {
        current.customer_name = String(row.customer_name ?? '').trim() || current.customer_code;
      }

      rowsByClinic.set(code, current);
      return current;
    };

    scopedRows.forEach((row) => {
      const clinic = upsertClinic(row);
      if (!clinic) return;

      const rawDate = dataKind === 'order' ? row.order_date : row.delivery_date;
      if (!rawDate) return;

      const key = String(rawDate).slice(0, 7);
      const amount = amountOf(row);
      clinic.lookback_total += amount;

      clinic.monthly.set(key, (clinic.monthly.get(key) ?? 0) + amount);

      if (key === previousSameMonthKey) {
        previousSameMonthByClinic.set(
          clinic.customer_code,
          (previousSameMonthByClinic.get(clinic.customer_code) ?? 0) + amount
        );
      }

      const rowMonthStart = monthStart(key);
      if (rowMonthStart >= previousFiscalStart && rowMonthStart < previousFiscalEndExclusive) {
        previousFiscalByClinic.set(
          clinic.customer_code,
          (previousFiscalByClinic.get(clinic.customer_code) ?? 0) + amount
        );
      }

      if (key < months[0]) {
        clinic.last_seen_month = !clinic.last_seen_month || key > clinic.last_seen_month
          ? key
          : clinic.last_seen_month;
      }
    });

    markDebug('aggregate_clinic_months', {
      clinics: rowsByClinic.size,
      previousSameMonthClinics: previousSameMonthByClinic.size,
      previousFiscalClinics: previousFiscalByClinic.size,
    }, rowsByClinic.size);

    const scopedBudgets = (budgetsResult.data ?? []).filter((row: any) => {
      if (userId && row.user_id !== userId) return false;
      if (departmentId !== null && Number(row.department_id) !== departmentId) return false;
      return allowedUserIds.has(row.user_id);
    });
    const budgetTotal = scopedBudgets.reduce((sum: number, row: any) => {
      const amount = Number(row.target_amount ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    const targetMonthBudgetTotal = scopedBudgets.reduce((sum: number, row: any) => {
      if (!targetMonthBudgetKeys.has(String(row.target_year_month ?? '').trim())) return sum;
      const amount = Number(row.target_amount ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);

    const threeMonthKeys = Array.from({ length: 3 }, (_, index) => monthKey(addMonths(displayStart, index - 3)));
    const assetRows = Array.from(rowsByClinic.values())
      .map((clinic) => {
        const monthly = months.map((key) => ({
          month: key,
          amount: Math.round(clinic.monthly.get(key) ?? 0),
        }));
        const total = monthly.reduce((sum, entry) => sum + entry.amount, 0);
        const trailingAverage = threeMonthKeys.reduce(
          (sum, key) => sum + (clinic.monthly.get(key) ?? 0),
          0
        ) / 3;
        const previousYearTotal = previousSameMonthByClinic.get(clinic.customer_code) ?? 0;
        const previousFiscalTotal = previousFiscalByClinic.get(clinic.customer_code) ?? 0;
        const isNew = total > 0 && !clinic.last_seen_month;
        const isChurnRisk = total === 0 && trailingAverage > 0;

        return {
          user_id: clinic.user_id,
          user_name: clinic.user_name,
          external_staff_code: clinic.external_staff_code,
          department_id: clinic.department_id,
          customer_code: clinic.customer_code,
          customer_name: clinic.customer_name,
          previous_year_total: Math.round(previousYearTotal),
          previous_fiscal_total: Math.round(previousFiscalTotal),
          three_month_average: Math.round(trailingAverage),
          total: Math.round(total),
          year_over_year_delta: Math.round(total - previousYearTotal),
          new_order_amount: isNew ? Math.round(total) : 0,
          is_new: isNew,
          is_churn_risk: isChurnRisk,
          monthly,
        };
      })
      .filter((row) => row.total > 0 || row.three_month_average > 0 || row.previous_year_total > 0 || row.previous_fiscal_total > 0)
      .sort((a, b) => b.total - a.total || a.customer_name.localeCompare(b.customer_name, 'ja'));

    const assetCustomerCodes = assetRows.map((row) => row.customer_code).filter(Boolean);
    const { data: actionRows, error: actionRowsError } = assetCustomerCodes.length > 0
      ? await supabaseAdmin
        .from('clinic_asset_cares')
        .select('customer_code, care_status, next_care_date, care_memo, updated_at, updated_by')
        .in('customer_code', assetCustomerCodes)
      : { data: [], error: null };

    if (actionRowsError) {
      console.error('clinic asset cares error:', actionRowsError);
      return res.status(500).json({ error: 'clinic asset cares fetch failed' });
    }

    const actionByCustomerCode = new Map(
      ((actionRows ?? []) as ClinicAssetCareRow[]).map((row) => [row.customer_code, row])
    );
    const rowsWithActions = assetRows.map((row) => {
      const action = actionByCustomerCode.get(row.customer_code);
      return {
        ...row,
        management: {
          status: action?.care_status ?? '未対応',
          next_action_date: action?.next_care_date ?? null,
          memo: action?.care_memo ?? '',
          updated_at: action?.updated_at ?? null,
          updated_by: action?.updated_by ?? null,
        },
      };
    });
    markDebug('build_asset_rows', {
      actionRows: actionRows?.length ?? 0,
    }, rowsWithActions.length);

    const excludedSalesMap = new Map<string, {
      reason: ExcludedSalesReason;
      month: string;
      department_id: number | null;
      department_name: string;
      external_staff_code: string;
      staff_name: string;
      customer_code: string;
      customer_name: string;
      amount: number;
      row_count: number;
    }>();
    const excludedSalesSummary = new Map<ExcludedSalesReason, { amount: number; row_count: number }>();

    auditSalesRows.forEach((row) => {
      const rawDate = dataKind === 'order' ? row.order_date : row.delivery_date;
      if (!rawDate) return;

      const amount = amountOf(row);
      if (amount === 0) return;

      const month = String(rawDate).slice(0, 7);
      const departmentKey = String(row.department_id ?? '');
      const staffCode = String(row.external_staff_code ?? '').trim();
      const customerCode = String(row.customer_code ?? '').trim();
      const customerName = String(row.customer_name ?? '').trim();
      if (EXCLUDED_SALES_EXTERNAL_STAFF_CODES.has(staffCode)) return;

      const profileId = staffCode ? anyStaffCodeToProfileId.get(`${departmentKey}|${staffCode}`) : null;
      let reason: ExcludedSalesReason | null = null;

      if (!customerCode) {
        reason = '得意先コードなし';
      } else if (!staffCode || !profileId) {
        reason = '担当紐付け漏れ';
      } else if (!allowedUserIds.has(profileId)) {
        reason = '医院アセット対象外';
      }

      if (!reason) return;

      const staffName = profileId ? userById.get(profileId)?.name ?? '' : '';
      const key = [
        reason,
        month,
        departmentKey,
        staffCode,
        customerCode,
        customerName,
      ].join('|');
      const current = excludedSalesMap.get(key) ?? {
        reason,
        month,
        department_id: row.department_id,
        department_name: departmentNameById.get(departmentKey) ?? '',
        external_staff_code: staffCode,
        staff_name: staffName,
        customer_code: customerCode,
        customer_name: customerName,
        amount: 0,
        row_count: 0,
      };

      current.amount += amount;
      current.row_count += 1;
      excludedSalesMap.set(key, current);

      const summary = excludedSalesSummary.get(reason) ?? { amount: 0, row_count: 0 };
      summary.amount += amount;
      summary.row_count += 1;
      excludedSalesSummary.set(reason, summary);
    });

    const excludedSalesRows = Array.from(excludedSalesMap.values())
      .map((row) => ({
        ...row,
        amount: Math.round(row.amount),
      }))
      .sort((a, b) => b.amount - a.amount || a.reason.localeCompare(b.reason, 'ja'))
      .slice(0, 500);
    const excludedSalesTotal = Array.from(excludedSalesSummary.values())
      .reduce((sum, row) => sum + row.amount, 0);
    markDebug('excluded_sales_audit', {
      auditSalesRows: auditSalesRows.length,
      excludedGroups: excludedSalesMap.size,
      returnedRows: excludedSalesRows.length,
    }, excludedSalesRows.length);

    const previousYearTotal = rowsWithActions.reduce((sum, row) => sum + row.previous_year_total, 0);
    const previousFiscalTotal = rowsWithActions.reduce((sum, row) => sum + row.previous_fiscal_total, 0);
    const currentMonthTotal = rowsWithActions.reduce((sum, row) => {
      const targetMonthAmount = row.monthly.find((entry) => entry.month === targetMonth)?.amount ?? 0;
      return sum + targetMonthAmount;
    }, 0);
    const newOrderAmount = rowsWithActions.reduce((sum, row) => {
      const targetMonthAmount = row.monthly.find((entry) => entry.month === targetMonth)?.amount ?? 0;
      return sum + (row.is_new ? targetMonthAmount : 0);
    }, 0);
    const activeClinicCount = rowsWithActions.filter((row) => (
      (row.monthly.find((entry) => entry.month === targetMonth)?.amount ?? 0) > 0
    )).length;
    const baseClinicCount = rowsWithActions.filter((row) => row.three_month_average > 0).length;
    const churnClinicCount = rowsWithActions.filter((row) => row.is_churn_risk).length;
    const churnRate = baseClinicCount > 0
      ? Number(((churnClinicCount / baseClinicCount) * 100).toFixed(1))
      : 0;

    return res.status(200).json({
      period,
      data_kind: dataKind,
      month: targetMonth,
      from: months[0],
      to: months[months.length - 1],
      months: months.map((key) => ({ key, label: monthLabel(key) })),
      filter_options: {
        users: users.map((row) => ({
          id: row.id,
          name: row.name,
          department_id: row.department_id,
          department: row.departments?.name ?? '',
        })),
        departments: Array.from(
          new Map(
            users
              .filter((row) => row.department_id != null && row.departments?.name)
              .map((row) => [String(row.department_id), {
                id: String(row.department_id),
                name: row.departments?.name ?? '',
              }])
          ).values()
        ),
      },
      summary: {
        sales_total: Math.round(currentMonthTotal),
        budget_total: Math.round(targetMonthBudgetTotal),
        budget_rate: targetMonthBudgetTotal > 0 ? Number(((currentMonthTotal / targetMonthBudgetTotal) * 100).toFixed(1)) : 0,
        current_month_total: Math.round(currentMonthTotal),
        previous_year_total: Math.round(previousYearTotal),
        previous_fiscal_total: Math.round(previousFiscalTotal),
        year_over_year_delta: Math.round(currentMonthTotal - previousYearTotal),
        churn_rate: churnRate,
        churn_clinic_count: churnClinicCount,
        base_clinic_count: baseClinicCount,
        active_clinic_count: activeClinicCount,
        new_order_amount: Math.round(newOrderAmount),
      },
      rows: rowsWithActions,
      excluded_sales: {
        total_amount: Math.round(excludedSalesTotal),
        total_groups: excludedSalesMap.size,
        returned_groups: excludedSalesRows.length,
        summary: Array.from(excludedSalesSummary.entries()).map(([reason, value]) => ({
          reason,
          amount: Math.round(value.amount),
          row_count: value.row_count,
        })),
        rows: excludedSalesRows,
      },
      debug: {
        endpoint: 'clinic-assets',
        totalMs: Date.now() - debugStartedAt,
        steps: debugSteps,
        counts: {
          profiles: profilesData?.length ?? 0,
          filteredUsers: filteredUsers.length,
          allowedDepartmentIds: allowedDepartmentIds.length,
          staffMaps: staffMapsData?.length ?? 0,
          allowedExternalStaffCodes: allowedExternalStaffCodes.size,
          salesRows: salesRows.length,
          auditSalesRows: auditSalesRows.length,
          scopedRows: scopedRows.length,
          actionRows: actionRows?.length ?? 0,
          assetRows: rowsWithActions.length,
          excludedSalesGroups: excludedSalesMap.size,
        },
      },
    });
  } catch (error) {
    console.error('clinic assets handler error:', error);
    return res.status(500).json({ error: 'clinic assets fetch failed' });
  }
}
