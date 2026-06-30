

import { requireAuthenticatedProfile } from '../../../api/_lib/auth.js';
import { fetchDetectedNewOrderCandidates } from './detected-new-orders.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    const detectedItems = await fetchDetectedNewOrderCandidates(profile, req.query ?? {});
    const count = detectedItems.length;

    return res.status(200).json({
      pending_count: count,
      merge_candidate_count: 0,
      detected_new_order_count: count,
    });
  } catch (error) {
    console.error('merge candidates count unexpected error:', error);
    return res.status(500).json({ error: 'merge candidates count api failed' });
  }
}
