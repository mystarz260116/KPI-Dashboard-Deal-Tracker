import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile } from '../../../api/_lib/auth.js';

type NotificationRow = {
  id: string;
  recipient_user_id: string;
  deal_id: string;
  comment_id: string;
  created_at: string;
  read_at: string | null;
};

function parseLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 10;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1), 50);
}

function getSearchParams(req: VercelRequest) {
  return new URL(req.url ?? '/api/deals', 'http://localhost').searchParams;
}

function isMissingNotificationTable(error: any) {
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || String(error?.message ?? '').includes('deal_comment_notifications');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    if (req.method === 'GET') {
      const searchParams = getSearchParams(req);
      const limit = parseLimit(req.query.limit ?? searchParams.get('limit'));

      const { data: notificationRows, error: notificationsError } = await supabaseAdmin
        .from('deal_comment_notifications')
        .select('id, recipient_user_id, deal_id, comment_id, created_at, read_at')
        .eq('recipient_user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (notificationsError) {
        if (isMissingNotificationTable(notificationsError)) {
          return res.status(200).json({ notifications: [], unread_count: 0 });
        }

        console.error('deal notifications fetch error:', notificationsError);
        return res.status(500).json({ error: 'deal notifications fetch failed' });
      }

      const notifications = (notificationRows ?? []) as NotificationRow[];
      const unreadCount = notifications.filter((notification) => !notification.read_at).length;

      if (notifications.length === 0) {
        return res.status(200).json({ notifications: [], unread_count: 0 });
      }

      const dealIds = Array.from(new Set(notifications.map((notification) => notification.deal_id)));
      const commentIds = Array.from(new Set(notifications.map((notification) => notification.comment_id)));

      const [dealsResult, commentsResult] = await Promise.all([
        supabaseAdmin
          .from('deals')
          .select('id, customer_code, prospect_customer_id, deal_date, user_id, customers(name), prospect_customers(name)')
          .in('id', dealIds),
        supabaseAdmin
          .from('deal_comments')
          .select('id, body, author_user_id, created_at, profiles!deal_comments_author_user_id_fkey(name)')
          .in('id', commentIds),
      ]);

      if (dealsResult.error) {
        console.error('deal notifications deals fetch error:', dealsResult.error);
        return res.status(500).json({ error: 'deal notifications deals fetch failed' });
      }

      if (commentsResult.error) {
        console.error('deal notifications comments fetch error:', commentsResult.error);
        return res.status(500).json({ error: 'deal notifications comments fetch failed' });
      }

      const dealsById = new Map((dealsResult.data ?? []).map((deal: any) => [deal.id, deal]));
      const commentsById = new Map((commentsResult.data ?? []).map((comment: any) => [comment.id, comment]));

      const payload = notifications.map((notification) => {
        const deal = dealsById.get(notification.deal_id) as any;
        const comment = commentsById.get(notification.comment_id) as any;
        const clinicKind = deal?.customer_code ? 'customer' : 'prospect';
        const clinicId = deal?.customer_code ?? deal?.prospect_customer_id ?? '';
        const clinicName = deal?.customers?.name
          ?? deal?.prospect_customers?.name
          ?? clinicId
          ?? '医院名未設定';
        const authorName = Array.isArray(comment?.profiles)
          ? (comment?.profiles[0]?.name ?? '未設定')
          : (comment?.profiles?.name ?? '未設定');

        return {
          id: notification.id,
          deal_id: notification.deal_id,
          comment_id: notification.comment_id,
          created_at: notification.created_at,
          read_at: notification.read_at,
          clinic_kind: clinicKind,
          clinic_id: clinicId,
          clinic_name: clinicName,
          deal_date: deal?.deal_date ?? null,
          comment_body: comment?.body ?? '',
          comment_author_name: authorName,
          comment_created_at: comment?.created_at ?? notification.created_at,
        };
      });

      return res.status(200).json({ notifications: payload, unread_count: unreadCount });
    }

    if (req.method === 'PATCH') {
      const notificationId = String((req.body as any)?.notification_id ?? '').trim();
      const mode = String((req.body as any)?.mode ?? '').trim();

      let query = supabaseAdmin
        .from('deal_comment_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('recipient_user_id', profile.id)
        .is('read_at', null);

      if (notificationId) {
        query = query.eq('id', notificationId);
      } else if (mode !== 'read_all') {
        return res.status(400).json({ error: 'notification_id or mode=read_all is required' });
      }

      const { error } = await query;

      if (error) {
        if (isMissingNotificationTable(error)) {
          return res.status(200).json({ ok: true, skipped: true });
        }

        console.error('deal notifications update error:', error);
        return res.status(500).json({ error: 'deal notifications update failed' });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('deal notifications unexpected error:', error);
    return res.status(500).json({ error: 'deal notifications api failed' });
  }
}
