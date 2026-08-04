import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { clearAuthProfileCacheForRequest, requireAuthenticatedProfile } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const action = String(req.body?.action ?? '').trim();
  if (action !== 'complete-initial-change') {
    return res.status(400).json({ error: 'Unsupported action' });
  }

  const profile = await requireAuthenticatedProfile(req, res, { allowMfaIncomplete: true });
  if (!profile) return;

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', profile.id);

  if (error) {
    console.error('initial password completion profile update error:', error);
    return res.status(500).json({ error: 'パスワード設定状態を更新できませんでした' });
  }

  clearAuthProfileCacheForRequest(req);
  return res.status(200).json({ ok: true });
}
