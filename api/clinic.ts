import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';
import { normalizeCustomerCode } from '../src/lib/customerCode.js';
import { requireAuthenticatedProfile } from './_lib/auth.js';

function parseClinicKind(value: unknown) {
  return value === 'customer' || value === 'prospect' ? value : null;
}

function parseMonth(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  return raw;
}

function isMissingClinicAttributesTable(error: { code?: string } | null) {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    const kind = parseClinicKind(req.query.kind);
    const rawClinicId = String(req.query.id ?? '').trim();
    const clinicId = kind === 'customer' ? normalizeCustomerCode(rawClinicId) : rawClinicId;
    const month = parseMonth(req.query.month);

    if (!kind || !clinicId) {
      return res.status(400).json({ error: 'kind and id are required' });
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
      const iosRentalEnabled = body.ios_rental_enabled === true;
      const iosRentalStartDate = iosRentalEnabled
        ? String(body.ios_rental_start_date ?? '').trim()
        : null;

      if (iosRentalEnabled && !/^\d{4}-\d{2}-\d{2}$/.test(iosRentalStartDate ?? '')) {
        return res.status(400).json({ error: 'IOSレンタルの開始日を入力してください' });
      }

      const { data, error } = await supabaseAdmin
        .from('clinic_attributes')
        .upsert({
          clinic_kind: kind,
          clinic_id: clinicId,
          ios_rental_enabled: iosRentalEnabled,
          ios_rental_start_date: iosRentalStartDate,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'clinic_kind,clinic_id' })
        .select('ios_rental_enabled, ios_rental_start_date')
        .single();

      if (error) {
        console.error('clinic api attributes save error:', error);
        if (isMissingClinicAttributesTable(error)) {
          return res.status(503).json({
            error: 'IOSレンタル情報の保存準備が完了していません。DB更新を適用してください',
            code: 'CLINIC_ATTRIBUTES_MIGRATION_REQUIRED',
          });
        }
        return res.status(500).json({ error: '取引先情報の保存に失敗しました' });
      }

      return res.status(200).json({
        ios_rental_enabled: Boolean(data?.ios_rental_enabled),
        ios_rental_start_date: data?.ios_rental_start_date ?? null,
      });
    }

    const [year, monthNumber] = month.split('-').map(Number);
    const monthStart = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
    const nextMonthDate = new Date(year, monthNumber, 1);
    const monthEndExclusive = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;

    let clinicPayload: {
      kind: 'customer' | 'prospect';
      id: string;
      name: string;
      status?: string;
      merged_customer_code?: string | null;
      created_at?: string | null;
    } | null = null;

    let customerCodeForMapping: string | null = null;

    if (kind === 'customer') {
      const { data, error } = await supabaseAdmin
        .from('customers')
        .select('code, name')
        .eq('code', clinicId)
        .single();

      if (error || !data) {
        console.error('clinic api customer fetch error:', error);
        return res.status(404).json({ error: 'Clinic not found' });
      }

      clinicPayload = {
        kind: 'customer',
        id: data.code,
        name: data.name,
      };
      customerCodeForMapping = data.code;
    } else {
      const { data, error } = await supabaseAdmin
        .from('prospect_customers')
        .select('id, name, status, merged_customer_code, created_at')
        .eq('id', clinicId)
        .single();

      if (error || !data) {
        console.error('clinic api prospect fetch error:', error);
        return res.status(404).json({ error: 'Clinic not found' });
      }

      clinicPayload = {
        kind: 'prospect',
        id: data.id,
        name: data.name,
        status: data.status ?? undefined,
        merged_customer_code: data.merged_customer_code ?? null,
        created_at: data.created_at ?? null,
      };
      customerCodeForMapping = data.merged_customer_code ?? null;
    }

    const { data: clinicAttributes, error: clinicAttributesError } = await supabaseAdmin
      .from('clinic_attributes')
      .select('ios_rental_enabled, ios_rental_start_date')
      .eq('clinic_kind', kind)
      .eq('clinic_id', clinicId)
      .maybeSingle();

    if (clinicAttributesError && !isMissingClinicAttributesTable(clinicAttributesError)) {
      console.error('clinic api attributes fetch error:', clinicAttributesError);
      return res.status(500).json({ error: 'Clinic attributes fetch failed' });
    }
    if (clinicAttributesError) {
      console.warn('clinic attributes table is not available; using defaults');
    }

    let assignedStaffs: Array<{ key: string; label: string; source: 'sales' | 'deal' }> = [];
    let salesDetails: Array<{
      delivery_date: string | null;
      product_name: string;
      data_kind: 'delivery' | 'order';
      amount: number;
    }> = [];
    let salesMonthTotal = 0;

    if (customerCodeForMapping) {
      const canReadAllDepartments = Boolean(profile.can_view_dashboard || profile.role === 'admin');
      const profileDepartmentId = profile.department_id ? Number(profile.department_id) : null;

      let mapQuery = supabaseAdmin
        .from('customer_external_staff_maps')
        .select('department_id, external_staff_code')
        .eq('customer_code', customerCodeForMapping);

      if (!canReadAllDepartments) {
        if (!profileDepartmentId) {
          mapQuery = mapQuery.eq('department_id', -1);
        } else {
          mapQuery = mapQuery.eq('department_id', profileDepartmentId);
        }
      }

      const { data: mapRows, error: mapError } = await mapQuery;

      if (mapError) {
        console.error('clinic api staff maps error:', mapError);
        return res.status(500).json({ error: 'Clinic staff mappings fetch failed' });
      }

      const mappedDepartmentIds = Array.from(new Set(
        (mapRows ?? [])
          .map((row: any) => Number(row.department_id))
          .filter((value: number) => Number.isFinite(value) && value > 0)
      ));
      const staffCodes = Array.from(new Set(
        (mapRows ?? []).map((row: any) => String(row.external_staff_code)).filter(Boolean)
      ));

      if (staffCodes.length > 0 && mappedDepartmentIds.length > 0) {
        const { data: staffs, error: staffsError } = await supabaseAdmin
          .from('external_staffs')
          .select('department_id, code, name, raw_label')
          .in('department_id', mappedDepartmentIds)
          .in('code', staffCodes);

        if (staffsError) {
          console.error('clinic api staffs error:', staffsError);
          return res.status(500).json({ error: 'Clinic staffs fetch failed' });
        }

        assignedStaffs = (staffs ?? []).map((staff: any) => ({
          key: `sales:${String(staff.department_id)}:${String(staff.code)}`,
          label: String(staff.name ?? staff.raw_label ?? staff.code),
          source: 'sales',
        }));
      }

      let salesQuery = supabaseAdmin
        .from('sales_import_rows')
        .select('delivery_date, order_date, data_kind, external_staff_code, normalized_product_name, amount')
        .eq('customer_code', customerCodeForMapping)
        .or(`and(data_kind.eq.delivery,delivery_date.gte.${monthStart},delivery_date.lt.${monthEndExclusive}),and(data_kind.eq.order,order_date.gte.${monthStart},order_date.lt.${monthEndExclusive})`)
        .order('delivery_date', { ascending: false, nullsFirst: false })
        .order('order_date', { ascending: false, nullsFirst: false })
        .limit(1000);

      if (!canReadAllDepartments) {
        if (!profileDepartmentId || staffCodes.length === 0) {
          salesQuery = salesQuery.eq('external_staff_code', '__no_access__');
        } else {
          salesQuery = salesQuery
            .eq('department_id', profileDepartmentId)
            .in('external_staff_code', staffCodes);
        }
      }

      const { data: salesRows, error: salesError } = await salesQuery;

      if (salesError) {
        console.error('clinic api sales import rows error:', salesError);
        return res.status(500).json({ error: 'Clinic sales rows fetch failed' });
      }

      salesDetails = (salesRows ?? []).map((row: any) => {
        const amount = Number(row.amount ?? 0);
        const safeAmount = Number.isFinite(amount) ? amount : 0;
        const dataKind = row.data_kind === 'order' ? 'order' : 'delivery';
        salesMonthTotal += safeAmount;

        return {
          delivery_date: dataKind === 'order'
            ? (row.order_date ? String(row.order_date) : null)
            : (row.delivery_date ? String(row.delivery_date) : null),
          product_name: String(row.normalized_product_name ?? '').trim() || '未設定',
          data_kind: dataKind,
          amount: safeAmount,
        };
      });
    }

    const dealQuery = supabaseAdmin
      .from('deals')
      .select('user_id, profiles!deals_user_id_fkey(name)')
      .order('created_at', { ascending: false });

    const { data: dealStaffRows, error: dealStaffError } = kind === 'customer'
      ? await dealQuery.eq('customer_code', clinicId)
      : await dealQuery.eq('prospect_customer_id', clinicId);

    if (dealStaffError) {
      console.error('clinic api deal staffs error:', dealStaffError);
      return res.status(500).json({ error: 'Clinic deal staffs fetch failed' });
    }

    const assignedStaffMap = new Map<string, { key: string; label: string; source: 'sales' | 'deal' }>();
    assignedStaffs.forEach((staff) => {
      assignedStaffMap.set(staff.key, staff);
    });

    (dealStaffRows ?? []).forEach((row: any) => {
      const userId = String(row.user_id ?? '').trim();
      if (!userId) return;
      const profileRow = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const label = String(profileRow?.name ?? userId).trim();
      if (!label) return;
      assignedStaffMap.set(`deal:${userId}`, {
        key: `deal:${userId}`,
        label,
        source: 'deal',
      });
    });

    assignedStaffs = Array.from(assignedStaffMap.values());

    return res.status(200).json({
      clinic: clinicPayload,
      ios_rental_enabled: Boolean(clinicAttributes?.ios_rental_enabled),
      ios_rental_start_date: clinicAttributes?.ios_rental_start_date ?? null,
      assigned_staffs: assignedStaffs,
      sales_month: month,
      sales_month_total: salesMonthTotal,
      sales_details: salesDetails,
    });
  } catch (error) {
    console.error('clinic api unexpected error:', error);
    return res.status(500).json({ error: 'clinic api failed' });
  }
}
