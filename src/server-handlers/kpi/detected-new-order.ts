import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
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
    const customerCode = String(body.customer_code ?? '').trim();
    const customerName = String(body.customer_name ?? body.clinic ?? '').trim() || customerCode;
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

    const { data: insertedDeal, error: dealInsertError } = await supabaseAdmin
      .from('deals')
      .insert({
        user_id: userId,
        customer_code: customerCode,
        prospect_customer_id: null,
        deal_date: orderedAt,
        activity_type: 'won',
        executed_action_type: '受注確認',
        pipeline_stage: 'won',
        amount,
        notes: [
          '売上明細から新規受注候補として検知し、承認により自動追加',
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
