import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile } from '../../../api/_lib/auth.js';

function normalizeClinicKind(value: unknown) {
  const raw = String(value ?? '').trim();
  return raw === 'customer' || raw === 'prospect' ? raw : null;
}

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

async function createCommentNotifications({
  dealId,
  commentId,
  authorUserId,
}: {
  dealId: string;
  commentId: string;
  authorUserId: string;
}) {
  const [dealResult, commentersResult, adminsResult] = await Promise.all([
    supabaseAdmin
      .from('deals')
      .select('id, user_id')
      .eq('id', dealId)
      .maybeSingle(),
    supabaseAdmin
      .from('deal_comments')
      .select('author_user_id')
      .eq('deal_id', dealId)
      .neq('id', commentId),
    supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('role', 'admin'),
  ]);

  if (dealResult.error) {
    console.error('deal comment notification deal fetch error:', dealResult.error);
    return;
  }

  if (commentersResult.error) {
    console.error('deal comment notification commenters fetch error:', commentersResult.error);
    return;
  }

  if (adminsResult.error) {
    console.error('deal comment notification admins fetch error:', adminsResult.error);
    return;
  }

  const recipientIds = new Set<string>();
  const dealOwnerId = String((dealResult.data as any)?.user_id ?? '').trim();
  if (dealOwnerId) {
    recipientIds.add(dealOwnerId);
  }

  for (const commenter of commentersResult.data ?? []) {
    const commenterId = String((commenter as any).author_user_id ?? '').trim();
    if (commenterId) {
      recipientIds.add(commenterId);
    }
  }

  for (const admin of adminsResult.data ?? []) {
    const adminId = String((admin as any).id ?? '').trim();
    if (adminId) {
      recipientIds.add(adminId);
    }
  }

  recipientIds.delete(authorUserId);
  const notificationRows = Array.from(recipientIds).map((recipientUserId) => ({
    recipient_user_id: recipientUserId,
    deal_id: dealId,
    comment_id: commentId,
  }));

  if (notificationRows.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin
    .from('deal_comment_notifications')
    .upsert(notificationRows, {
      onConflict: 'recipient_user_id,comment_id',
      ignoreDuplicates: true,
    });

  if (error) {
    console.error('deal comment notification insert error:', error);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    if (req.method === 'GET') {
      const searchParams = getSearchParams(req);
      const dealId = String(req.query.deal_id ?? searchParams.get('deal_id') ?? '').trim();
      const dealIds = parseDealIds(req.query.deal_ids ?? searchParams.get('deal_ids'));
      const clinicKind = normalizeClinicKind(req.query.clinic_kind ?? searchParams.get('clinic_kind'));
      const clinicId = String(req.query.clinic_id ?? searchParams.get('clinic_id') ?? '').trim();

      let query = supabaseAdmin
        .from('deal_comments')
        .select('id, deal_id, clinic_kind, clinic_id, body, created_at, author_user_id, profiles!deal_comments_author_user_id_fkey(name)')
        .order('created_at', { ascending: false });

      if (dealId) {
        query = query.eq('deal_id', dealId);
      } else if (dealIds.length > 0) {
        query = query.in('deal_id', dealIds);
      } else {
        if (!clinicKind || !clinicId) {
          return res.status(200).json([]);
        }

        query = query
          .eq('clinic_kind', clinicKind)
          .eq('clinic_id', clinicId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('deal comments fetch error:', error);
        return res.status(500).json({ error: 'deal comments fetch failed' });
      }

      const comments = (data ?? []).map((row: any) => ({
        id: row.id,
        deal_id: row.deal_id,
        clinic_kind: row.clinic_kind,
        clinic_id: row.clinic_id,
        body: row.body,
        created_at: row.created_at,
        author_user_id: row.author_user_id,
        author_name: Array.isArray(row.profiles) ? (row.profiles[0]?.name ?? '未設定') : (row.profiles?.name ?? '未設定'),
      }));

      return res.status(200).json(comments);
    }

    if (req.method === 'POST') {
      const mode = String((req.body as any)?.mode ?? '').trim();

      if (mode === 'list') {
        const dealIds = parseDealIds((req.body as any)?.deal_ids);
        if (dealIds.length === 0) {
          return res.status(200).json([]);
        }

        const { data, error } = await supabaseAdmin
          .from('deal_comments')
          .select('id, deal_id, clinic_kind, clinic_id, body, created_at, author_user_id, profiles!deal_comments_author_user_id_fkey(name)')
          .in('deal_id', dealIds)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('deal comments bulk fetch error:', error);
          return res.status(500).json({ error: 'deal comments bulk fetch failed' });
        }

        const comments = (data ?? []).map((row: any) => ({
          id: row.id,
          deal_id: row.deal_id,
          clinic_kind: row.clinic_kind,
          clinic_id: row.clinic_id,
          body: row.body,
          created_at: row.created_at,
          author_user_id: row.author_user_id,
          author_name: Array.isArray(row.profiles) ? (row.profiles[0]?.name ?? '未設定') : (row.profiles?.name ?? '未設定'),
        }));

        return res.status(200).json(comments);
      }

      const clinicKind = normalizeClinicKind((req.body as any)?.clinic_kind);
      const clinicId = String((req.body as any)?.clinic_id ?? '').trim();
      const dealId = String((req.body as any)?.deal_id ?? '').trim();
      const body = String((req.body as any)?.body ?? '').trim();

      if (!clinicKind || !clinicId || !dealId || !body) {
        return res.status(400).json({ error: 'clinic_kind, clinic_id, deal_id and body are required' });
      }

      const { data, error } = await supabaseAdmin
        .from('deal_comments')
        .insert({
          clinic_kind: clinicKind,
          clinic_id: clinicId,
          deal_id: dealId,
          author_user_id: profile.id,
          body,
        })
        .select('id, deal_id, clinic_kind, clinic_id, body, created_at, author_user_id')
        .single();

      if (error) {
        console.error('deal comments insert error:', error);
        return res.status(500).json({ error: 'deal comment insert failed' });
      }

      await createCommentNotifications({
        dealId,
        commentId: data.id,
        authorUserId: profile.id,
      });

      return res.status(201).json({
        ...data,
        author_name: profile.name ?? '未設定',
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('deal comments unexpected error:', error);
    return res.status(500).json({ error: 'deal comments api failed' });
  }
}
