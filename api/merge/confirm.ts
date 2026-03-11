

import { supabaseAdmin } from '../../src/lib/supabaseAdmin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prospect_customer_id, customer_code, merged_by } = req.body ?? {};

    if (!prospect_customer_id || !customer_code) {
      return res.status(400).json({ error: 'prospect_customer_id and customer_code are required' });
    }

    const mergePayload: Record<string, any> = {
      status: 'merged',
      merged_customer_code: customer_code,
      merged_at: new Date().toISOString(),
    };

    if (merged_by) {
      mergePayload.merged_by = merged_by;
    }

    const { error: prospectUpdateError } = await supabaseAdmin
      .from('prospect_customers')
      .update(mergePayload)
      .eq('id', prospect_customer_id);

    if (prospectUpdateError) {
      console.error('merge confirm prospect update error:', prospectUpdateError);
      return res.status(500).json({ error: 'prospect merge update failed' });
    }

    const { error: candidateApproveError } = await supabaseAdmin
      .from('customer_merge_candidates')
      .update({
        decision: 'approved',
        reviewed_by: merged_by ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('prospect_customer_id', prospect_customer_id)
      .eq('customer_code', customer_code);

    if (candidateApproveError) {
      console.error('merge confirm candidate approve error:', candidateApproveError);
      return res.status(500).json({ error: 'candidate approve update failed' });
    }

    const { error: candidateRejectOthersError } = await supabaseAdmin
      .from('customer_merge_candidates')
      .update({
        decision: 'rejected',
        reviewed_by: merged_by ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('prospect_customer_id', prospect_customer_id)
      .neq('customer_code', customer_code);

    if (candidateRejectOthersError) {
      console.error('merge confirm candidate reject error:', candidateRejectOthersError);
      return res.status(500).json({ error: 'candidate reject update failed' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('merge confirm unexpected error:', error);
    return res.status(500).json({ error: 'merge confirm api failed' });
  }
}