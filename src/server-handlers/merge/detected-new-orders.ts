import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { normalizeCustomerCode, normalizeCustomerName } from '../../lib/customerCode.js';
import { normalizeSalesImportDataKind } from '../../../api/_lib/regionalReads.js';

const EXCLUDED_SALES_EXTERNAL_STAFF_CODES = new Set(['100', '102', '9999']);
const EXCLUDED_DASHBOARD_DEPARTMENTS = new Set(['管理部']);

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

function toDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function explicitMonth(value: unknown) {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null;
}

async function fetchLatestSalesMonth(dataKind: 'delivery' | 'order') {
  const dateColumn = dataKind === 'order' ? 'order_date' : 'delivery_date';
  const { data, error } = await supabaseAdmin
    .from('sales_import_rows')
    .select(dateColumn)
    .eq('data_kind', dataKind)
    .not(dateColumn, 'is', null)
    .order(dateColumn, { ascending: false })
    .limit(1);

  if (error) throw error;
  const latestDate = String((data ?? [])[0]?.[dateColumn] ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(latestDate) ? latestDate.slice(0, 7) : monthKey(new Date());
}

function normalizeSalesRowDate(value: unknown) {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  return raw.slice(0, 10);
}

function amountOf(row: any) {
  const amount = Number(row.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

async function fetchClinicSalesRowsFallback({
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
  if (departmentIds.length === 0 || externalStaffCodes.length === 0) return [];

  const rows: any[] = [];
  const pageSize = 1000;
  const dateColumn = dataKind === 'order' ? 'order_date' : 'delivery_date';

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('sales_import_rows')
      .select('department_id, customer_code, customer_name, amount, delivery_date, order_date, external_staff_code')
      .eq('data_kind', dataKind)
      .gte(dateColumn, startDate)
      .lt(dateColumn, endExclusiveDate)
      .in('department_id', departmentIds)
      .in('external_staff_code', externalStaffCodes)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

async function fetchClinicSalesRows({
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
  if (departmentIds.length === 0 || externalStaffCodes.length === 0) return [];

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
      return fetchClinicSalesRowsFallback({
        startDate,
        endExclusiveDate,
        departmentIds,
        externalStaffCodes,
        dataKind,
      });
    }

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows.map((row: any) => ({
    department_id: row.department_id,
    customer_code: row.customer_code,
    customer_name: row.customer_name,
    amount: Number(row.sales_total ?? 0),
    delivery_date: dataKind === 'delivery' ? row.sales_month : null,
    order_date: dataKind === 'order' ? row.sales_month : null,
    external_staff_code: row.external_staff_code,
  }));
}

async function fetchPriorSalesCustomerCodes({
  startDate,
  endExclusiveDate,
  departmentIds,
  externalStaffCodes,
  customerCodes,
  dataKind,
}: {
  startDate: string;
  endExclusiveDate: string;
  departmentIds: number[];
  externalStaffCodes: string[];
  customerCodes: string[];
  dataKind: 'delivery' | 'order';
}) {
  if (
    departmentIds.length === 0
    || externalStaffCodes.length === 0
    || customerCodes.length === 0
  ) {
    return new Set<string>();
  }

  const dataKindsToCheck = Array.from(new Set([dataKind, dataKind === 'order' ? 'delivery' : 'order']));
  const rpcResults = await Promise.all(
    dataKindsToCheck.map((kind) => supabaseAdmin
      .rpc('sales_prior_customer_codes', {
        p_start_date: startDate,
        p_end_date: endExclusiveDate,
        p_department_ids: departmentIds,
        p_external_staff_codes: externalStaffCodes,
        p_customer_codes: customerCodes,
        p_data_kind: kind,
      }))
  );

  const rpcError = rpcResults.find((result) => result.error)?.error;
  if (!rpcError) {
    return new Set(
      rpcResults
        .flatMap((result) => result.data ?? [])
        .map((row: any) => normalizeCustomerCode(row.customer_code))
        .filter(Boolean)
    );
  }

  console.warn('detected new order prior customer rpc fallback:', rpcError.message ?? rpcError);

  const result = new Set<string>();
  const customerChunkSize = 80;

  for (const kind of dataKindsToCheck) {
    const dateColumn = kind === 'order' ? 'order_date' : 'delivery_date';

    for (let index = 0; index < customerCodes.length; index += customerChunkSize) {
      const customerChunk = customerCodes.slice(index, index + customerChunkSize);
      let from = 0;

      while (true) {
        const { data, error } = await supabaseAdmin
          .from('sales_import_rows')
          .select('customer_code')
          .eq('data_kind', kind)
          .gte(dateColumn, startDate)
          .lt(dateColumn, endExclusiveDate)
          .in('department_id', departmentIds)
          .in('external_staff_code', externalStaffCodes)
          .in('customer_code', customerChunk)
          .range(from, from + 999);

        if (error) {
          throw error;
        }

        (data ?? []).forEach((row: any) => {
          const customerCode = normalizeCustomerCode(row.customer_code);
          if (customerCode) {
            result.add(customerCode);
          }
        });

        if ((data ?? []).length < 1000) {
          break;
        }

        from += 1000;
      }
    }
  }

  return result;
}

export async function fetchDetectedNewOrderCandidates(profile: any, query: Record<string, any>) {
  const startedAt = Date.now();
  let lastAt = startedAt;
  const logStep = (stage: string, detail?: Record<string, unknown>) => {
    const now = Date.now();
    console.info('[perf] detected-new-orders', {
      stage,
      ms: now - lastAt,
      totalMs: now - startedAt,
      ...detail,
    });
    lastAt = now;
  };

  const canViewAll = profile.can_manage_users;
  const dataKind = normalizeSalesImportDataKind(query.data_kind);
  const targetMonth = explicitMonth(query.month) ?? await fetchLatestSalesMonth(dataKind);
  const targetStart = monthStart(targetMonth);
  const targetEnd = addMonths(targetStart, 1);
  const previousYearStart = addMonths(targetStart, -12);
  const currentFiscalStart = fiscalYearStart(targetStart);
  const lookbackStart = new Date(Math.min(
    addMonths(targetStart, -3).getTime(),
    previousYearStart.getTime(),
    addMonths(currentFiscalStart, -12).getTime()
  ));

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, department_id, departments(name)');

  if (profilesError) throw profilesError;
  logStep('profiles', { rows: profiles?.length ?? 0, canViewAll });

  const allowedProfileIds = new Set(
    (profiles ?? [])
      .filter((row: any) => canViewAll || row.id === profile.id)
      .filter((row: any) => !EXCLUDED_DASHBOARD_DEPARTMENTS.has(row.departments?.name ?? ''))
      .map((row: any) => String(row.id))
  );

  if (allowedProfileIds.size === 0) {
    return [];
  }

  const { data: staffMaps, error: staffMapsError } = await supabaseAdmin
    .from('profile_external_staff_maps')
    .select('profile_id, department_id, external_staff_code')
    .in('profile_id', Array.from(allowedProfileIds));

  if (staffMapsError) throw staffMapsError;
  logStep('staff-maps', { rows: staffMaps?.length ?? 0, allowedProfileIds: allowedProfileIds.size });

  const profileIdByDepartmentStaffCode = new Map<string, string>();
  (staffMaps ?? []).forEach((row: any) => {
    const departmentId = Number(row.department_id);
    const staffCode = String(row.external_staff_code ?? '').trim();
    const profileId = String(row.profile_id ?? '').trim();
    if (
      Number.isFinite(departmentId)
      && staffCode
      && profileId
      && !EXCLUDED_SALES_EXTERNAL_STAFF_CODES.has(staffCode)
    ) {
      profileIdByDepartmentStaffCode.set(`${departmentId}|${staffCode}`, profileId);
    }
  });

  const departmentIds = Array.from(new Set(
    (staffMaps ?? [])
      .map((row: any) => Number(row.department_id))
      .filter((value) => Number.isFinite(value))
  ));
  const externalStaffCodes = Array.from(new Set(
    (staffMaps ?? [])
      .map((row: any) => String(row.external_staff_code ?? '').trim())
      .filter((code) => code && !EXCLUDED_SALES_EXTERNAL_STAFF_CODES.has(code))
  ));

  if (departmentIds.length === 0 || externalStaffCodes.length === 0) {
    logStep('empty-scope', { departmentIds: departmentIds.length, externalStaffCodes: externalStaffCodes.length });
    return [];
  }

  const rows = await fetchClinicSalesRows({
    startDate: toDateString(targetStart),
    endExclusiveDate: toDateString(targetEnd),
    departmentIds,
    externalStaffCodes,
    dataKind,
  });
  logStep('target-month-sales-rows', {
    rows: rows.length,
    departmentIds: departmentIds.length,
    externalStaffCodes: externalStaffCodes.length,
    targetStart: toDateString(targetStart),
    targetEnd: toDateString(targetEnd),
  });

  const byCustomer = new Map<string, {
    customer_code: string;
    customer_name: string;
    department_id: number | null;
    user_id: string | null;
    amount: number;
    ordered_at: string;
    has_prior_sales: boolean;
  }>();

  rows.forEach((row) => {
    const customerCode = normalizeCustomerCode(row.customer_code);
    if (!customerCode) return;

    const rawDate = normalizeSalesRowDate(dataKind === 'order' ? row.order_date : row.delivery_date);
    if (!rawDate) return;

    const amount = amountOf(row);
    if (amount <= 0) return;

    const current = byCustomer.get(customerCode) ?? {
      customer_code: customerCode,
      customer_name: normalizeCustomerName(row.customer_name, customerCode),
      department_id: Number.isFinite(Number(row.department_id)) ? Number(row.department_id) : null,
      user_id: profileIdByDepartmentStaffCode.get(`${row.department_id ?? ''}|${String(row.external_staff_code ?? '').trim()}`) ?? null,
      amount: 0,
      ordered_at: '',
      has_prior_sales: false,
    };

    current.amount += amount;
    if (!current.ordered_at || rawDate > current.ordered_at) {
      current.ordered_at = rawDate;
    }
    if (!current.customer_name || current.customer_name === current.customer_code) {
      current.customer_name = normalizeCustomerName(row.customer_name, current.customer_code);
    }

    byCustomer.set(customerCode, current);
  });

  const targetMonthCandidates = Array.from(byCustomer.values())
    .filter((row) => row.amount > 0);
  logStep('target-candidate-build', { candidates: targetMonthCandidates.length, groupedCustomers: byCustomer.size });

  const customerCodes = targetMonthCandidates.map((row) => row.customer_code);
  if (customerCodes.length === 0) {
    logStep('complete-empty');
    return [];
  }

  const priorSalesCustomerCodes = await fetchPriorSalesCustomerCodes({
    startDate: toDateString(lookbackStart),
    endExclusiveDate: toDateString(targetStart),
    departmentIds,
    externalStaffCodes,
    customerCodes,
    dataKind,
  });
  logStep('prior-sales-check', {
    priorCustomers: priorSalesCustomerCodes.size,
    checkedCustomers: customerCodes.length,
    lookbackStart: toDateString(lookbackStart),
    targetStart: toDateString(targetStart),
  });

  const candidates = targetMonthCandidates
    .filter((row) => !priorSalesCustomerCodes.has(row.customer_code));
  logStep('candidate-build', { candidates: candidates.length, groupedCustomers: byCustomer.size });

  const candidateCustomerCodes = candidates.map((row) => row.customer_code);
  if (candidateCustomerCodes.length === 0) {
    logStep('complete-empty-after-prior-check');
    return [];
  }

  const [
    detectedResult,
    prospectsResult,
    dealsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('detected_new_orders')
      .select('customer_code, status')
      .eq('source', 'sales_import')
      .eq('data_kind', dataKind)
      .eq('detected_month', targetMonth)
      .in('customer_code', candidateCustomerCodes),
    supabaseAdmin
      .from('prospect_customers')
      .select('merged_customer_code')
      .eq('status', 'merged')
      .in('merged_customer_code', candidateCustomerCodes),
    supabaseAdmin
      .from('deals')
      .select('customer_code')
      .in('customer_code', candidateCustomerCodes),
  ]);

  if (detectedResult.error) throw detectedResult.error;
  if (prospectsResult.error) throw prospectsResult.error;
  if (dealsResult.error) throw dealsResult.error;
  logStep('status-lookups', {
    detectedRows: detectedResult.data?.length ?? 0,
    mergedProspects: prospectsResult.data?.length ?? 0,
    deals: dealsResult.data?.length ?? 0,
  });

  const reviewedCustomerCodes = new Set(
    (detectedResult.data ?? [])
      .filter((row: any) => row.status === 'approved' || row.status === 'rejected')
      .map((row: any) => String(row.customer_code ?? '').trim())
  );
  const mergedCustomerCodes = new Set((prospectsResult.data ?? []).map((row: any) => String(row.merged_customer_code ?? '').trim()));
  const dealCustomerCodes = new Set((dealsResult.data ?? []).map((row: any) => String(row.customer_code ?? '').trim()));

  const result = candidates
    .filter((row) => !reviewedCustomerCodes.has(row.customer_code))
    .filter((row) => !mergedCustomerCodes.has(row.customer_code))
    .filter((row) => !dealCustomerCodes.has(row.customer_code))
    .map((row) => ({
      source: 'detected_new_order',
      detected_month: targetMonth,
      data_kind: dataKind,
      customer_code: row.customer_code,
      customer_name: row.customer_name,
      department_id: row.department_id,
      user_id: row.user_id ?? profile.id,
      amount: Math.round(row.amount),
      ordered_at: row.ordered_at,
    }))
    .sort((a, b) => b.amount - a.amount || a.customer_name.localeCompare(b.customer_name, 'ja'));
  logStep('complete', { rows: result.length });
  return result;
}
