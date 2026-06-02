import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';

function isAuthorizedCron(req: VercelRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return false;
  }

  return req.headers.authorization === `Bearer ${cronSecret}`;
}

function isMissingNotificationTable(error: any) {
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || String(error?.message ?? '').includes('deal_comment_notifications');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { error, count } = await supabaseAdmin
    .from('deal_comment_notifications')
    .delete({ count: 'exact' })
    .not('read_at', 'is', null)
    .lt('read_at', cutoff);

  if (error) {
    if (isMissingNotificationTable(error)) {
      return res.status(200).json({ ok: true, deleted_count: 0, skipped: true });
    }

    console.error('deal notification cleanup error:', error);
    return res.status(500).json({ error: 'deal notification cleanup failed' });
  }

  return res.status(200).json({
    ok: true,
    deleted_count: count ?? 0,
    cutoff,
  });
}
