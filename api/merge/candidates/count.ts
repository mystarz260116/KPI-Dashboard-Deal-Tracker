

import { supabaseAdmin } from '../../../src/lib/supabaseAdmin';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { count, error } = await supabaseAdmin
      .from('customer_merge_candidates')
      .select('prospect_customer_id', { count: 'exact', head: true })
      .eq('decision', 'pending');

    if (error) {
      console.error('merge candidates count error:', error);
      return res.status(500).json({ error: 'merge candidates count failed' });
    }

    return res.status(200).json({
      pending_count: count ?? 0,
    });
  } catch (error) {
    console.error('merge candidates count unexpected error:', error);
    return res.status(500).json({ error: 'merge candidates count api failed' });
  }
}