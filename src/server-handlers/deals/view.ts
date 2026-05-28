import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile } from '../../../api/_lib/auth.js';

function normalizeClinicKind(value: unknown) {
  const raw = String(value ?? '').trim();
  return raw === 'customer' || raw === 'prospect' ? raw : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    const clinicKind = normalizeClinicKind((req.body as any)?.clinic_kind);
    const clinicId = String((req.body as any)?.clinic_id ?? '').trim();
    const dealId = String((req.body as any)?.deal_id ?? '').trim() || null;

    if (!clinicKind || !clinicId) {
      return res.status(400).json({ error: 'clinic_kind and clinic_id are required' });
    }

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: latestView, error: latestViewError } = await supabaseAdmin
      .from('deal_page_views')
      .select('id, viewed_at')
      .eq('viewer_user_id', profile.id)
      .eq('clinic_kind', clinicKind)
      .eq('clinic_id', clinicId)
      .gte('viewed_at', thirtyMinutesAgo)
      .order('viewed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestViewError) {
      console.error('deal view latest fetch error:', latestViewError);
      return res.status(500).json({ error: 'deal view fetch failed' });
    }

    if (latestView) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const { error: insertError } = await supabaseAdmin
      .from('deal_page_views')
      .insert({
        deal_id: dealId,
        clinic_kind: clinicKind,
        clinic_id: clinicId,
        viewer_user_id: profile.id,
      });

    if (insertError) {
      console.error('deal view insert error:', insertError);
      return res.status(500).json({ error: 'deal view insert failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('deal view unexpected error:', error);
    return res.status(500).json({ error: 'deal view api failed' });
  }
}
