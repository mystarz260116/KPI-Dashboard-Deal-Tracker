

import { requireAuthenticatedProfile, requireUserManagementAccess } from '../../../api/_lib/auth.js';
import { fetchDetectedNewOrderCandidates } from './detected-new-orders.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireUserManagementAccess(profile, res)) return;

    const detectedItems = await fetchDetectedNewOrderCandidates(profile, req.query ?? {});
    return res.status(200).json(detectedItems);
  } catch (error) {
    console.error('merge candidates unexpected error:', error);
    return res.status(500).json({ error: 'merge candidates api failed' });
  }
}
