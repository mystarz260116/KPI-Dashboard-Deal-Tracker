import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';
import { requireAuthenticatedProfile } from './_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    const { data, error } = await supabaseAdmin
      .from('departments')
      .select('id, name')
      .order('id', { ascending: true });

    if (error) {
      console.error('departments api error:', error);
      return res.status(500).json({ error: 'departments fetch failed' });
    }

    return res.status(200).json(data ?? []);
  } catch (error) {
    console.error('departments api unexpected error:', error);
    return res.status(500).json({ error: 'departments api failed' });
  }
}
