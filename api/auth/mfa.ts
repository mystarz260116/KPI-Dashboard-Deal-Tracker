import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { clearAuthProfileCacheForRequest, requireAuthenticatedProfile } from '../_lib/auth.js';
import { getNextMfaReverifyAfter } from '../_lib/mfaReverification.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const action = String(req.body?.action ?? '').trim();
  if (action !== 'record-verification') {
    return res.status(400).json({ error: 'Unsupported action' });
  }

  const profile = await requireAuthenticatedProfile(req, res, {
    allowMfaReverifyExpired: true,
  });
  if (!profile) return;

  const verifiedAt = new Date();
  const reverifyAfter = getNextMfaReverifyAfter(verifiedAt);

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      mfa_verified_at: verifiedAt.toISOString(),
      mfa_reverify_after: reverifyAfter.toISOString(),
    })
    .eq('id', profile.id);

  if (error) {
    console.error('mfa verification profile update error:', error);
    return res.status(500).json({ error: 'MFA verification update failed' });
  }

  clearAuthProfileCacheForRequest(req);

  return res.status(200).json({
    ok: true,
    mfa_verified_at: verifiedAt.toISOString(),
    mfa_reverify_after: reverifyAfter.toISOString(),
  });
}
