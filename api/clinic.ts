import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    const kind = parseClinicKind(req.query.kind);
    const clinicId = String(req.query.id ?? '').trim();
    const month = parseMonth(req.query.month);

    if (!kind || !clinicId) {
      return res.status(400).json({ error: 'kind and id are required' });
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
        .eq('created_by', profile.id)
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

    let assignedStaffs: Array<{ key: string; label: string; source: 'sales' | 'deal' }> = [];
    let salesDetails: Array<{
      delivery_date: string | null;
      product_name: string;
      detail_category: string | null;
      patient_name: string | null;
      quantity: number;
      amount: number;
    }> = [];
    let salesMonthTotal = 0;

    if (customerCodeForMapping && profile.department_id) {
      const { data: mapRows, error: mapError } = await supabaseAdmin
        .from('customer_external_staff_maps')
        .select('external_staff_code')
        .eq('department_id', Number(profile.department_id))
        .eq('customer_code', customerCodeForMapping);

      if (mapError) {
        console.error('clinic api staff maps error:', mapError);
        return res.status(500).json({ error: 'Clinic staff mappings fetch failed' });
      }

      const staffCodes = Array.from(new Set(
        (mapRows ?? []).map((row: any) => String(row.external_staff_code)).filter(Boolean)
      ));

      if (staffCodes.length > 0) {
        const { data: staffs, error: staffsError } = await supabaseAdmin
          .from('external_staffs')
          .select('code, name, raw_label')
          .eq('department_id', Number(profile.department_id))
          .in('code', staffCodes);

        if (staffsError) {
          console.error('clinic api staffs error:', staffsError);
          return res.status(500).json({ error: 'Clinic staffs fetch failed' });
        }

        assignedStaffs = (staffs ?? []).map((staff: any) => ({
          key: `sales:${String(staff.code)}`,
          label: String(staff.name ?? staff.raw_label ?? staff.code),
          source: 'sales',
        }));
      }

      const { data: salesRows, error: salesError } = await supabaseAdmin
        .from('sales_import_rows')
        .select('source_raw_id, delivery_date, amount')
        .eq('department_id', Number(profile.department_id))
        .eq('customer_code', customerCodeForMapping)
        .gte('delivery_date', monthStart)
        .lt('delivery_date', monthEndExclusive)
        .order('delivery_date', { ascending: false })
        .limit(1000);

      if (salesError) {
        console.error('clinic api sales rows error:', salesError);
        return res.status(500).json({ error: 'Clinic sales rows fetch failed' });
      }

      const sourceRawIds = (salesRows ?? [])
        .map((row: any) => Number(row.source_raw_id))
        .filter((value: number) => Number.isFinite(value));

      if (sourceRawIds.length > 0) {
        const { data: rawRows, error: rawRowsError } = await supabaseAdmin
          .from('sales_import_raw_rows')
          .select('id, 補綴物名, 明細区分, 数量, 患者名')
          .in('id', sourceRawIds);

        if (rawRowsError) {
          console.error('clinic api raw sales detail error:', rawRowsError);
          return res.status(500).json({ error: 'Clinic raw sales rows fetch failed' });
        }

        const rawRowMap = new Map<number, any>();
        (rawRows ?? []).forEach((row: any) => {
          rawRowMap.set(Number(row.id), row);
        });

        salesDetails = (salesRows ?? []).map((row: any) => {
          const raw = rawRowMap.get(Number(row.source_raw_id));
          const amount = Number(row.amount ?? 0);
          const quantity = Number(raw?.['数量'] ?? 0);
          const safeAmount = Number.isFinite(amount) ? amount : 0;
          salesMonthTotal += safeAmount;

          return {
            delivery_date: row.delivery_date ? String(row.delivery_date) : null,
            product_name: String(raw?.['補綴物名'] ?? '').trim() || String(raw?.['明細区分'] ?? '').trim() || '未設定',
            detail_category: raw?.['明細区分'] ? String(raw['明細区分']) : null,
            patient_name: raw?.['患者名'] ? String(raw['患者名']) : null,
            quantity: Number.isFinite(quantity) ? quantity : 0,
            amount: safeAmount,
          };
        });
      }
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
