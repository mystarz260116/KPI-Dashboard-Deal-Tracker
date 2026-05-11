import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile } from '../../../api/_lib/auth.js';

const ALLOWED_PIPELINE_STAGES = new Set(['targeting', 'visiting', 'negotiating', 'lost']);

function toActivityType(pipelineStage: string) {
  if (pipelineStage === 'negotiating') return 'negotiating';
  if (pipelineStage === 'lost') return 'lost';
  return 'visit';
}

function parseMonth(value: unknown) {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null;
}

function resolveClinicKey(sourceDeal: {
  customer_code: string | null;
  prospect_customer_id: string | null;
  id: string;
}) {
  if (sourceDeal.customer_code) {
    return `customer:${sourceDeal.customer_code}`;
  }

  return `prospect:${sourceDeal.prospect_customer_id ?? sourceDeal.id}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    const dealId = String(req.body?.deal_id ?? '').trim();
    const pipelineStage = String(req.body?.pipeline_stage ?? '').trim();
    const boardMonth = parseMonth(req.body?.board_month);

    if (!dealId || !ALLOWED_PIPELINE_STAGES.has(pipelineStage) || !boardMonth) {
      return res.status(400).json({ error: 'deal_id, valid pipeline_stage, and board_month are required' });
    }

    const { data: sourceDeal, error: sourceDealError } = await supabaseAdmin
      .from('deals')
      .select('id, user_id, deal_date, customer_code, prospect_customer_id')
      .eq('id', dealId)
      .single();

    if (sourceDealError || !sourceDeal) {
      console.error('deal status source fetch error:', sourceDealError);
      return res.status(404).json({ error: 'deal not found' });
    }

    const canEditDeal = profile.role === 'admin' || sourceDeal.user_id === profile.id;
    if (!canEditDeal) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const boardMonthStart = `${boardMonth}-01`;
    const { data: monthClosure, error: monthClosureError } = await supabaseAdmin
      .from('deal_board_month_closures')
      .select('month_start')
      .eq('month_start', boardMonthStart)
      .maybeSingle();

    if (monthClosureError) {
      console.error('deal status month closure fetch error:', monthClosureError);
      return res.status(500).json({ error: 'deal month closure fetch failed' });
    }

    if (monthClosure) {
      return res.status(409).json({ error: 'closed month is read only' });
    }

    const sourceMonth = String(sourceDeal.deal_date).slice(0, 7);
    if (sourceMonth === boardMonth) {
      const { error } = await supabaseAdmin
        .from('deals')
        .update({
          pipeline_stage: pipelineStage,
          activity_type: toActivityType(pipelineStage),
        })
        .eq('id', dealId);

      if (error) {
        console.error('deal status update error:', error);
        return res.status(500).json({ error: 'deal status update failed' });
      }
    } else {
      const { error } = await supabaseAdmin
        .from('deal_board_states')
        .upsert({
          clinic_key: resolveClinicKey(sourceDeal),
          month_start: boardMonthStart,
          base_deal_id: sourceDeal.id,
          pipeline_stage: pipelineStage,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error('deal board state update error:', error);
        return res.status(500).json({ error: 'deal board state update failed' });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('deal status update unexpected error:', error);
    return res.status(500).json({ error: 'deal status api failed' });
  }
}
