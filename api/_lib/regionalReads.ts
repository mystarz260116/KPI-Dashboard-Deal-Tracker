import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';

type SalesRowFilters = {
  startDate: string;
  endExclusiveDate: string;
  customerCodes?: string[];
  departmentId?: number;
};

export async function fetchRegionalSalesRows(filters: SalesRowFilters) {
  let query = supabaseAdmin
    .from('sales_import_rows')
    .select('department_id, customer_code, amount, delivery_date, external_staff_code')
    .gte('delivery_date', filters.startDate)
    .lt('delivery_date', filters.endExclusiveDate);

  if (filters.departmentId) {
    query = query.eq('department_id', filters.departmentId);
  }

  if (filters.customerCodes && filters.customerCodes.length > 0) {
    query = query.in('customer_code', filters.customerCodes);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchRegionalSalesTotal(filters: SalesRowFilters) {
  const { data, error } = await supabaseAdmin.rpc('sum_sales_import_rows_amount', {
    p_start_date: filters.startDate,
    p_end_date: filters.endExclusiveDate,
    p_customer_codes: filters.customerCodes && filters.customerCodes.length > 0
      ? filters.customerCodes
      : null,
    p_department_id: filters.departmentId ?? null,
  });

  if (error) {
    throw error;
  }

  const firstRow = Array.isArray(data) ? data[0] : data;
  const total = Number(firstRow?.sales_total ?? 0);
  return Number.isFinite(total) ? total : 0;
}

async function fetchRegionalCustomerCodesByProfileIds(
  departmentId: number,
  profileIds: string[]
) {
  if (profileIds.length === 0) {
    return [];
  }

  const { data: profileStaffMaps, error: profileStaffMapsError } = await supabaseAdmin
    .from('profile_external_staff_maps')
    .select('profile_id, external_staff_code')
    .eq('department_id', departmentId)
    .in('profile_id', profileIds);

  if (profileStaffMapsError) {
    throw profileStaffMapsError;
  }

  const externalStaffCodes = Array.from(
    new Set(
      (profileStaffMaps ?? [])
        .map((row: any) => String(row.external_staff_code))
        .filter(Boolean)
    )
  );

  if (externalStaffCodes.length === 0) {
    return [];
  }

  const { data: customerStaffMaps, error: customerStaffMapsError } = await supabaseAdmin
    .from('customer_external_staff_maps')
    .select('customer_code, external_staff_code')
    .eq('department_id', departmentId)
    .in('external_staff_code', externalStaffCodes);

  if (customerStaffMapsError) {
    throw customerStaffMapsError;
  }

  return Array.from(
    new Set(
      (customerStaffMaps ?? [])
        .map((row: any) => String(row.customer_code))
        .filter(Boolean)
    )
  );
}

export async function fetchCustomerCodesByProfileIds(
  profileIds: string[],
  departmentId: number | null | undefined
) {
  if (!departmentId || profileIds.length === 0) {
    return [];
  }

  return fetchRegionalCustomerCodesByProfileIds(departmentId, profileIds);
}

export async function fetchCustomerCodesByDepartmentId(departmentId: number) {
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('department_id', departmentId);

  if (profilesError) {
    throw profilesError;
  }

  const profileIds = (profiles ?? []).map((profile: any) => String(profile.id)).filter(Boolean);

  return fetchRegionalCustomerCodesByProfileIds(departmentId, profileIds);
}

export async function fetchCustomerCodesByProfileId(
  profileId: string,
  departmentId: number | null | undefined
) {
  return fetchCustomerCodesByProfileIds([profileId], departmentId);
}
