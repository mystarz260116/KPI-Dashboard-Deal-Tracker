import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { requireAuthenticatedProfile } from '../_lib/auth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    const { prospect_customer_id, customer_code } = req.body ?? {};
    const mergedBy = profile.id;

    if (!prospect_customer_id || !customer_code) {
      return res.status(400).json({ error: 'prospect_customer_id and customer_code are required' });
    }

    const mergePayload: Record<string, any> = {
      status: 'merged',
      merged_customer_code: customer_code,
      merged_at: new Date().toISOString(),
      merged_by: mergedBy,
    };

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
        reviewed_by: mergedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('prospect_customer_id', prospect_customer_id)
      .eq('customer_code', customer_code)
      .eq('decision', 'pending');

    if (candidateApproveError) {
      console.error('merge confirm candidate approve error:', candidateApproveError);
      return res.status(500).json({ error: 'candidate approve update failed' });
    }

    const { error: candidateRejectOthersError } = await supabaseAdmin
      .from('customer_merge_candidates')
      .update({
        decision: 'rejected',
        reviewed_by: mergedBy,
        reviewed_at: new Date().toISOString(),
      })
      .eq('prospect_customer_id', prospect_customer_id)
      .neq('customer_code', customer_code)
      .eq('decision', 'pending');

    if (candidateRejectOthersError) {
      console.error('merge confirm candidate reject error:', candidateRejectOthersError);
      return res.status(500).json({ error: 'candidate reject update failed' });
    }

    const { error: dealUpdateError } = await supabaseAdmin
      .from('deals')
      .update({
        pipeline_stage: 'won',
        activity_type: 'won',
      })
      .eq('prospect_customer_id', prospect_customer_id);

    if (dealUpdateError) {
      console.error('merge confirm deal update error:', dealUpdateError);
      return res.status(500).json({ error: 'merged deal update failed' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('merge confirm unexpected error:', error);
    return res.status(500).json({ error: 'merge confirm api failed' });
  }
}
