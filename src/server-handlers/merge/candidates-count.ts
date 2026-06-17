

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile } from '../../../api/_lib/auth.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    const canViewAll = profile.role === 'admin' || profile.can_view_dashboard;
    let query = supabaseAdmin
      .from('customer_merge_candidates')
      .select('prospect_customer_id, prospect_customers!inner(created_by)', { count: 'exact', head: true })
      .eq('decision', 'pending')
      .gte('match_score', 0.95);

    if (!canViewAll) {
      query = query.eq('prospect_customers.created_by', profile.id);
    }

    const { count, error } = await query;

    if (error) {
      console.error('merge candidates count error:', error);
      return res.status(500).json({ error: 'merge candidates count failed' });
    }

    return res.status(200).json({
      pending_count: count ?? 0,
      merge_candidate_count: count ?? 0,
      detected_new_order_count: 0,
    });
  } catch (error) {
    console.error('merge candidates count unexpected error:', error);
    return res.status(500).json({ error: 'merge candidates count api failed' });
  }
}
