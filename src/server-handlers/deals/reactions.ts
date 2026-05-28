import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile } from '../../../api/_lib/auth.js';

const ALLOWED_REACTIONS = new Set(['like', 'helpful', 'congrats']);

function parseDealIds(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getSearchParams(req: VercelRequest) {
  return new URL(req.url ?? '/api/deals', 'http://localhost').searchParams;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    if (req.method === 'GET') {
      const searchParams = getSearchParams(req);
      const dealId = String(req.query.deal_id ?? searchParams.get('deal_id') ?? '').trim();
      const dealIds = parseDealIds(req.query.deal_ids ?? searchParams.get('deal_ids'));

      if (!dealId && dealIds.length === 0) {
        return res.status(200).json([]);
      }

      let query = supabaseAdmin
        .from('deal_reactions')
        .select('deal_id, reactor_user_id, reaction_type');

      query = dealId ? query.eq('deal_id', dealId) : query.in('deal_id', dealIds);

      const { data, error } = await query;
      if (error) {
        console.error('deal reactions fetch error:', error);
        return res.status(500).json({ error: 'deal reactions fetch failed' });
      }

      const byDeal = new Map<string, {
        deal_id: string;
        counts: Record<'like' | 'helpful' | 'congrats', number>;
        mine: string[];
      }>();

      for (const row of data ?? []) {
        const dealKey = String((row as any).deal_id);
        const reactionType = String((row as any).reaction_type);
        if (!ALLOWED_REACTIONS.has(reactionType)) continue;

        const entry = byDeal.get(dealKey) ?? {
          deal_id: dealKey,
          counts: { like: 0, helpful: 0, congrats: 0 },
          mine: [],
        };

        entry.counts[reactionType as 'like' | 'helpful' | 'congrats'] += 1;
        if ((row as any).reactor_user_id === profile.id && !entry.mine.includes(reactionType)) {
          entry.mine.push(reactionType);
        }
        byDeal.set(dealKey, entry);
      }

      return res.status(200).json(Array.from(byDeal.values()));
    }

    if (req.method === 'POST') {
      const mode = String((req.body as any)?.mode ?? '').trim();

      if (mode === 'list') {
        const dealIds = parseDealIds((req.body as any)?.deal_ids);
        if (dealIds.length === 0) {
          return res.status(200).json([]);
        }

        const { data, error } = await supabaseAdmin
          .from('deal_reactions')
          .select('deal_id, reactor_user_id, reaction_type')
          .in('deal_id', dealIds);

        if (error) {
          console.error('deal reactions bulk fetch error:', error);
          return res.status(500).json({ error: 'deal reactions bulk fetch failed' });
        }

        const byDeal = new Map<string, {
          deal_id: string;
          counts: Record<'like' | 'helpful' | 'congrats', number>;
          mine: string[];
        }>();

        for (const row of data ?? []) {
          const dealKey = String((row as any).deal_id);
          const reactionType = String((row as any).reaction_type);
          if (!ALLOWED_REACTIONS.has(reactionType)) continue;

          const entry = byDeal.get(dealKey) ?? {
            deal_id: dealKey,
            counts: { like: 0, helpful: 0, congrats: 0 },
            mine: [],
          };

          entry.counts[reactionType as 'like' | 'helpful' | 'congrats'] += 1;
          if ((row as any).reactor_user_id === profile.id && !entry.mine.includes(reactionType)) {
            entry.mine.push(reactionType);
          }
          byDeal.set(dealKey, entry);
        }

        return res.status(200).json(Array.from(byDeal.values()));
      }

      const dealId = String((req.body as any)?.deal_id ?? '').trim();
      const reactionType = String((req.body as any)?.reaction_type ?? '').trim();

      if (!dealId || !ALLOWED_REACTIONS.has(reactionType)) {
        return res.status(400).json({ error: 'deal_id and valid reaction_type are required' });
      }

      const { data: existing, error: existingError } = await supabaseAdmin
        .from('deal_reactions')
        .select('id')
        .eq('deal_id', dealId)
        .eq('reactor_user_id', profile.id)
        .eq('reaction_type', reactionType)
        .maybeSingle();

      if (existingError) {
        console.error('deal reactions existing fetch error:', existingError);
        return res.status(500).json({ error: 'deal reaction lookup failed' });
      }

      if (existing?.id) {
        const { error: deleteError } = await supabaseAdmin
          .from('deal_reactions')
          .delete()
          .eq('id', existing.id);

        if (deleteError) {
          console.error('deal reactions delete error:', deleteError);
          return res.status(500).json({ error: 'deal reaction remove failed' });
        }

        return res.status(200).json({ ok: true, active: false });
      }

      const { error: insertError } = await supabaseAdmin
        .from('deal_reactions')
        .insert({
          deal_id: dealId,
          reactor_user_id: profile.id,
          reaction_type: reactionType,
        });

      if (insertError) {
        console.error('deal reactions insert error:', insertError);
        return res.status(500).json({ error: 'deal reaction insert failed' });
      }

      return res.status(201).json({ ok: true, active: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('deal reactions unexpected error:', error);
    return res.status(500).json({ error: 'deal reactions api failed' });
  }
}
