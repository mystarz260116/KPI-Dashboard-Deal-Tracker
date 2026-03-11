

import { supabaseAdmin } from '../../src/lib/supabaseAdmin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('customer_merge_candidates')
      .select(`
        prospect_customer_id,
        customer_code,
        match_score,
        match_reason,
        decision,
        prospect_customers(name),
        customers(name)
      `)
      .eq('decision', 'pending')
      .order('match_score', { ascending: false });

    if (error) {
      console.error('merge candidates fetch error:', error);
      return res.status(500).json({ error: 'merge candidates fetch failed' });
    }

    const items = (data ?? []).map((row: any) => ({
      prospect_customer_id: row.prospect_customer_id,
      prospect_name: row.prospect_customers?.name ?? '',
      customer_code: row.customer_code,
      customer_name: row.customers?.name ?? row.customer_code,
      match_score: row.match_score,
      match_reason: row.match_reason,
      decision: row.decision,
    }));

    return res.status(200).json(items);
  } catch (error) {
    console.error('merge candidates unexpected error:', error);
    return res.status(500).json({ error: 'merge candidates api failed' });
  }
}