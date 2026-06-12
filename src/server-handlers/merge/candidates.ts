

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile } from '../../../api/_lib/auth.js';
import { fetchDetectedNewOrderCandidates } from './detected-new-orders.js';

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
      .select(`
        prospect_customer_id,
        customer_code,
        match_score,
        match_reason,
        decision,
        prospect_customers!inner(name, created_by),
        customers(name)
      `)
      .eq('decision', 'pending')
      .gte('match_score', 0.95)
      .order('match_score', { ascending: false });

    if (!canViewAll) {
      query = query.eq('prospect_customers.created_by', profile.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('merge candidates fetch error:', error);
      return res.status(500).json({ error: 'merge candidates fetch failed' });
    }

    const mergeItems = (data ?? []).map((row: any) => ({
      source: 'merge_candidate',
      prospect_customer_id: row.prospect_customer_id,
      prospect_name: row.prospect_customers?.name ?? '',
      customer_code: row.customer_code,
      customer_name: row.customers?.name ?? row.customer_code,
      match_score: row.match_score,
      match_reason: row.match_reason,
      decision: row.decision,
    }));

    const detectedItems = await fetchDetectedNewOrderCandidates(profile, req.query ?? {});
    const items = [
      ...mergeItems,
      ...detectedItems,
    ];

    return res.status(200).json(items);
  } catch (error) {
    console.error('merge candidates unexpected error:', error);
    return res.status(500).json({ error: 'merge candidates api failed' });
  }
}
