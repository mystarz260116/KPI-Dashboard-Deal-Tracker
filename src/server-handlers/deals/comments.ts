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

const REPLY_MARKER_PATTERN = /^\[\[reply_to:([0-9a-f-]{36})\]\]\n/i;

function parseStoredCommentBody(value: unknown) {
  const storedBody = String(value ?? '');
  const match = storedBody.match(REPLY_MARKER_PATTERN);
  return {
    body: match ? storedBody.slice(match[0].length) : storedBody,
    reply_to_comment_id: match?.[1] ?? null,
  };
}

function encodeStoredCommentBody(body: string, replyToCommentId: string | null) {
  return replyToCommentId ? `[[reply_to:${replyToCommentId}]]\n${body}` : body;
}

async function serializeComments(rows: any[]) {
  const parsedRows = rows.map((row: any) => ({
    ...row,
    ...parseStoredCommentBody(row.body),
  }));
  const parentIds = Array.from(new Set(
    parsedRows.map((row: any) => row.reply_to_comment_id).filter(Boolean)
  ));
  const parentAuthorById = new Map<string, string>();

  if (parentIds.length > 0) {
    const { data: parents, error } = await supabaseAdmin
      .from('deal_comments')
      .select('id, profiles!deal_comments_author_user_id_fkey(name)')
      .in('id', parentIds);
    if (error) throw error;

    (parents ?? []).forEach((parent: any) => {
      const profileRow = Array.isArray(parent.profiles) ? parent.profiles[0] : parent.profiles;
      parentAuthorById.set(String(parent.id), String(profileRow?.name ?? '未設定'));
    });
  }

  return parsedRows.map((row: any) => ({
    id: row.id,
    deal_id: row.deal_id,
    clinic_kind: row.clinic_kind,
    clinic_id: row.clinic_id,
    body: row.body,
    created_at: row.created_at,
    author_user_id: row.author_user_id,
    author_name: Array.isArray(row.profiles) ? (row.profiles[0]?.name ?? '未設定') : (row.profiles?.name ?? '未設定'),
    reply_to_comment_id: row.reply_to_comment_id,
    reply_to_author_name: row.reply_to_comment_id
      ? (parentAuthorById.get(row.reply_to_comment_id) ?? '元のコメント')
      : null,
  }));
}

async function createCommentNotifications({
  dealId,
  commentId,
  authorUserId,
  commentBody,
  replyToCommentId,
}: {
  dealId: string;
  commentId: string;
  authorUserId: string;
  commentBody: string;
  replyToCommentId: string | null;
}) {
  const [dealResult, profilesResult] = await Promise.all([
    supabaseAdmin
      .from('deals')
      .select('id, user_id, customer_code, prospect_customer_id')
      .eq('id', dealId)
      .maybeSingle(),
    supabaseAdmin
      .from('profiles')
      .select('id, name'),
  ]);

  if (dealResult.error) {
    console.error('deal comment notification deal fetch error:', dealResult.error);
    return;
  }

  if (profilesResult.error) {
    console.error('deal comment notification profiles fetch error:', profilesResult.error);
    return;
  }

  const recipientIds = new Set<string>();
  const deal = dealResult.data as any;
  const dealOwnerId = String(deal?.user_id ?? '').trim();
  if (dealOwnerId) {
    recipientIds.add(dealOwnerId);
  }

  let relatedDealsQuery = supabaseAdmin.from('deals').select('user_id');
  if (deal?.customer_code) {
    relatedDealsQuery = relatedDealsQuery.eq('customer_code', deal.customer_code);
  } else if (deal?.prospect_customer_id) {
    relatedDealsQuery = relatedDealsQuery.eq('prospect_customer_id', deal.prospect_customer_id);
  } else {
    relatedDealsQuery = relatedDealsQuery.eq('id', dealId);
  }
  const { data: relatedDeals, error: relatedDealsError } = await relatedDealsQuery;
  if (relatedDealsError) {
    console.error('deal comment notification related deals fetch error:', relatedDealsError);
  } else {
    (relatedDeals ?? []).forEach((row: any) => {
      const relatedUserId = String(row.user_id ?? '').trim();
      if (relatedUserId) recipientIds.add(relatedUserId);
    });
  }

  if (deal?.customer_code) {
    const { data: customerMaps, error: customerMapsError } = await supabaseAdmin
      .from('customer_external_staff_maps')
      .select('department_id, external_staff_code')
      .eq('customer_code', deal.customer_code);

    if (!customerMapsError && (customerMaps ?? []).length > 0) {
      const departmentIds = Array.from(new Set((customerMaps ?? []).map((row: any) => Number(row.department_id))));
      const staffCodes = Array.from(new Set((customerMaps ?? []).map((row: any) => String(row.external_staff_code))));
      const { data: profileMaps } = await supabaseAdmin
        .from('profile_external_staff_maps')
        .select('profile_id')
        .in('department_id', departmentIds)
        .in('external_staff_code', staffCodes);
      (profileMaps ?? []).forEach((row: any) => {
        const profileId = String(row.profile_id ?? '').trim();
        if (profileId) recipientIds.add(profileId);
      });
    }
  }

  for (const mentionedProfile of profilesResult.data ?? []) {
    const mentionedName = String((mentionedProfile as any).name ?? '').trim();
    if (
      mentionedName
      && (commentBody.includes(`@${mentionedName}`) || commentBody.includes(`＠${mentionedName}`))
    ) {
      recipientIds.add(String((mentionedProfile as any).id));
    }
  }

  if (replyToCommentId) {
    const { data: parentComment } = await supabaseAdmin
      .from('deal_comments')
      .select('author_user_id')
      .eq('id', replyToCommentId)
      .maybeSingle();
    const parentAuthorId = String(parentComment?.author_user_id ?? '').trim();
    if (parentAuthorId) recipientIds.add(parentAuthorId);
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
      const mode = String(req.query.mode ?? searchParams.get('mode') ?? '').trim();
      if (mode === 'mentionable-users') {
        const { data, error } = await supabaseAdmin
          .from('profiles')
          .select('id, name')
          .order('name', { ascending: true });
        if (error) return res.status(500).json({ error: 'mentionable users fetch failed' });
        return res.status(200).json((data ?? []).filter((row: any) => row.id !== profile.id && row.name));
      }

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

      const comments = await serializeComments(data ?? []);

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

        const comments = await serializeComments(data ?? []);

        return res.status(200).json(comments);
      }

      const clinicKind = normalizeClinicKind((req.body as any)?.clinic_kind);
      const clinicId = String((req.body as any)?.clinic_id ?? '').trim();
      const dealId = String((req.body as any)?.deal_id ?? '').trim();
      const body = String((req.body as any)?.body ?? '').trim();
      const replyToCommentId = String((req.body as any)?.reply_to_comment_id ?? '').trim() || null;

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
          body: encodeStoredCommentBody(body, replyToCommentId),
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
        commentBody: body,
        replyToCommentId,
      });

      return res.status(201).json({
        ...data,
        body,
        author_name: profile.name ?? '未設定',
        reply_to_comment_id: replyToCommentId,
        reply_to_author_name: null,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('deal comments unexpected error:', error);
    return res.status(500).json({ error: 'deal comments api failed' });
  }
}
