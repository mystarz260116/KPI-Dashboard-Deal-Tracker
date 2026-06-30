import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { normalizeCustomerCode, normalizeCustomerName } from '../../lib/customerCode.js';
import { requireAuthenticatedProfile } from '../../../api/_lib/auth.js';
import { normalizeSalesImportDataKind } from '../../../api/_lib/regionalReads.js';

function normalizeMonth(value: unknown) {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null;
}

function normalizeDate(value: unknown) {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

function normalizeAmount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function addMonths(value: string, diff: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1 + diff, day || 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

async function fetchExistingCustomerDeal(customerCode: string) {
  const { data, error } = await supabaseAdmin
    .from('deals')
    .select('id, notes')
    .eq('customer_code', customerCode)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data ?? [])[0] ?? null;
}

async function fetchCustomerName(customerCode: string) {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('name')
    .eq('code', customerCode)
    .maybeSingle();

  if (error) throw error;
  return data?.name ?? customerCode;
}

async function customerExists(customerCode: string) {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('code')
    .eq('code', customerCode)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.code);
}

async function fetchProspectName(prospectCustomerId: string) {
  const { data, error } = await supabaseAdmin
    .from('prospect_customers')
    .select('name')
    .eq('id', prospectCustomerId)
    .maybeSingle();

  if (error) throw error;
  return data?.name ?? prospectCustomerId;
}

async function createProspectCustomer(name: string, profileId: string) {
  const { data, error } = await supabaseAdmin
    .from('prospect_customers')
    .insert({
      name,
      created_by: profileId,
      status: 'new',
    })
    .select('id, name')
    .single();

  if (error) throw error;
  return data;
}

async function hasPriorSales(customerCode: string, detectedMonth: string) {
  const targetStart = monthStart(detectedMonth);
  const lookbackStart = addMonths(targetStart, -12);

  const [deliveryResult, orderResult] = await Promise.all([
    supabaseAdmin
      .from('sales_import_rows')
      .select('source_raw_id')
      .eq('customer_code', customerCode)
      .eq('data_kind', 'delivery')
      .gte('delivery_date', lookbackStart)
      .lt('delivery_date', targetStart)
      .limit(1),
    supabaseAdmin
      .from('sales_import_rows')
      .select('source_raw_id')
      .eq('customer_code', customerCode)
      .eq('data_kind', 'order')
      .gte('order_date', lookbackStart)
      .lt('order_date', targetStart)
      .limit(1),
  ]);

  if (deliveryResult.error) throw deliveryResult.error;
  if (orderResult.error) throw orderResult.error;

  return (deliveryResult.data ?? []).length > 0 || (orderResult.data ?? []).length > 0;
}

async function rejectInvalidDetectedOrder({
  dataKind,
  detectedMonth,
  customerCode,
  customerName,
  departmentId,
  userId,
  amount,
  orderedAt,
  profileId,
}: {
  dataKind: 'delivery' | 'order';
  detectedMonth: string;
  customerCode: string;
  customerName: string;
  departmentId: number;
  userId: string;
  amount: number;
  orderedAt: string | null;
  profileId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from('detected_new_orders')
    .upsert({
      source: 'sales_import',
      data_kind: dataKind,
      detected_month: detectedMonth,
      customer_code: customerCode,
      customer_name: customerName,
      department_id: Number.isFinite(departmentId) ? departmentId : null,
      user_id: userId || null,
      amount,
      ordered_at: orderedAt,
      status: 'rejected',
      approved_by: null,
      approved_at: null,
      rejected_by: profileId,
      rejected_at: new Date().toISOString(),
      created_deal_id: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'source,data_kind,detected_month,customer_code' })
    .select('id, status, created_deal_id')
    .single();

  if (error) throw error;
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const action = String(body.action ?? 'approve').trim();
    const dataKind = normalizeSalesImportDataKind(body.data_kind);
    const detectedMonth = normalizeMonth(body.detected_month);
    const rawCustomerCode = String(body.customer_code ?? '').trim();
    const customerCode = normalizeCustomerCode(rawCustomerCode);
    const customerName = normalizeCustomerName(body.customer_name ?? body.clinic, customerCode);
    const rawTargetKind = String(body.target_kind ?? 'customer').trim();
    const targetKind = ['customer', 'prospect', 'new_prospect', 'unlinked'].includes(rawTargetKind)
      ? rawTargetKind as 'customer' | 'prospect' | 'new_prospect' | 'unlinked'
      : 'customer';
    const targetCustomerCode = normalizeCustomerCode(body.target_customer_code ?? customerCode);
    const targetProspectCustomerId = String(body.target_prospect_customer_id ?? '').trim();
    const userId = String(body.user_id ?? '').trim();
    const departmentId = Number(body.department_id);
    const amount = normalizeAmount(body.amount);
    const orderedAt = normalizeDate(body.ordered_at) ?? (detectedMonth ? `${detectedMonth}-01` : null);

    if (!detectedMonth || !customerCode) {
      return res.status(400).json({ error: 'detected_month and customer_code are required' });
    }

    const canUpdateCandidateForUser = !userId
      || userId === profile.id
      || profile.role === 'admin'
      || profile.can_view_dashboard;

    if (!canUpdateCandidateForUser) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (action === 'reject') {
      const { data, error } = await supabaseAdmin
        .from('detected_new_orders')
        .upsert({
          source: 'sales_import',
          data_kind: dataKind,
          detected_month: detectedMonth,
          customer_code: customerCode,
          customer_name: customerName,
          department_id: Number.isFinite(departmentId) ? departmentId : null,
          user_id: userId || null,
          amount,
          ordered_at: orderedAt,
          status: 'rejected',
          rejected_by: profile.id,
          rejected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'source,data_kind,detected_month,customer_code' })
        .select('id, status')
        .single();

      if (error) {
        console.error('detected new order reject error:', error);
        return res.status(500).json({ error: 'detected new order reject failed' });
      }

      return res.status(200).json({ ok: true, detected_new_order: data });
    }

    if (action !== 'approve') {
      return res.status(400).json({ error: 'unsupported action' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'user_id is required for approval' });
    }

    if (targetKind === 'customer' && !targetCustomerCode) {
      return res.status(400).json({ error: 'target_customer_code is required' });
    }

    if (targetKind === 'prospect' && !targetProspectCustomerId) {
      return res.status(400).json({ error: 'target_prospect_customer_id is required' });
    }

    const { data: existingCandidate, error: existingCandidateError } = await supabaseAdmin
      .from('detected_new_orders')
      .select('id, status, created_deal_id')
      .eq('source', 'sales_import')
      .eq('data_kind', dataKind)
      .eq('detected_month', detectedMonth)
      .eq('customer_code', customerCode)
      .maybeSingle();

    if (existingCandidateError) {
      console.error('detected new order fetch error:', existingCandidateError);
      return res.status(500).json({ error: 'detected new order fetch failed' });
    }

    if (existingCandidate?.status === 'approved' && existingCandidate.created_deal_id) {
      const { error: dealUpdateError } = await supabaseAdmin
        .from('deals')
        .update({
          activity_type: 'won',
          executed_action_type: '受注確認',
          pipeline_stage: 'won',
        })
        .eq('id', existingCandidate.created_deal_id);

      if (dealUpdateError) {
        console.error('detected new order deal won sync error:', dealUpdateError);
        return res.status(500).json({ error: 'detected new order deal sync failed' });
      }

      return res.status(200).json({ ok: true, detected_new_order: existingCandidate, skipped: true });
    }

    const [existingDeal, hasPriorCustomerSales] = await Promise.all([
      fetchExistingCustomerDeal(customerCode),
      hasPriorSales(customerCode, detectedMonth),
    ]);

    if (existingDeal || hasPriorCustomerSales) {
      const rejectedCandidate = await rejectInvalidDetectedOrder({
        dataKind,
        detectedMonth,
        customerCode,
        customerName,
        departmentId,
        userId,
        amount,
        orderedAt,
        profileId: profile.id,
      });

      return res.status(200).json({
        ok: true,
        detected_new_order: rejectedCandidate,
        skipped: true,
        reason: existingDeal ? 'existing_deal' : 'prior_sales',
      });
    }

    let finalTargetKind = targetKind;
    let finalTargetCustomerCode = targetCustomerCode;
    let finalTargetProspectCustomerId = targetProspectCustomerId;
    let targetName = '';

    if (targetKind === 'customer') {
      targetName = await fetchCustomerName(targetCustomerCode);
    } else if (targetKind === 'prospect') {
      targetName = await fetchProspectName(targetProspectCustomerId);
    } else if (targetKind === 'new_prospect') {
      if (await customerExists(customerCode)) {
        return res.status(400).json({ error: '検知元コードは既存取引先に存在するため、見込み顧客として登録できません' });
      }
      const prospect = await createProspectCustomer(customerName, profile.id);
      finalTargetKind = 'prospect';
      finalTargetCustomerCode = '';
      finalTargetProspectCustomerId = prospect.id;
      targetName = prospect.name ?? customerName;
    }

    const targetDescription = finalTargetKind === 'customer'
      ? `既存取引先 ${finalTargetCustomerCode} ${targetName}`
      : finalTargetKind === 'prospect'
        ? `見込み顧客 ${finalTargetProspectCustomerId} ${targetName}`
        : '紐づけなし';

    const { data: insertedDeal, error: dealInsertError } = await supabaseAdmin
      .from('deals')
      .insert({
        user_id: userId,
        customer_code: finalTargetKind === 'customer' ? finalTargetCustomerCode : null,
        prospect_customer_id: finalTargetKind === 'prospect' ? finalTargetProspectCustomerId : null,
        deal_date: orderedAt,
        activity_type: 'won',
        executed_action_type: '受注確認',
        pipeline_stage: 'won',
        amount,
        notes: [
          '売上明細から新規受注候補として検知し、承認により追加',
          `検知元: ${customerCode} ${customerName}`,
          `紐づけ先: ${targetDescription}`,
          body.notes ? String(body.notes).trim() : '',
        ].filter(Boolean).join('\n'),
      })
      .select('id')
      .single();

    if (dealInsertError || !insertedDeal) {
      console.error('detected new order deal insert error:', dealInsertError);
      return res.status(500).json({ error: 'detected new order deal insert failed' });
    }

    const { data: savedCandidate, error: candidateSaveError } = await supabaseAdmin
      .from('detected_new_orders')
      .upsert({
        source: 'sales_import',
        data_kind: dataKind,
        detected_month: detectedMonth,
        customer_code: customerCode,
        customer_name: customerName,
        department_id: Number.isFinite(departmentId) ? departmentId : null,
        user_id: userId,
        amount,
        ordered_at: orderedAt,
        status: 'approved',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
        rejected_by: null,
        rejected_at: null,
        created_deal_id: insertedDeal.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'source,data_kind,detected_month,customer_code' })
      .select('id, status, created_deal_id')
      .single();

    if (candidateSaveError) {
      console.error('detected new order candidate save error:', candidateSaveError);
      return res.status(500).json({ error: 'detected new order candidate save failed' });
    }

    return res.status(200).json({
      ok: true,
      detected_new_order: savedCandidate,
      deal_id: insertedDeal.id,
    });
  } catch (error) {
    console.error('detected new order api error:', error);
    return res.status(500).json({ error: 'detected new order api failed' });
  }
}
