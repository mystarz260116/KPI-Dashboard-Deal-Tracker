import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';

function isAuthorizedCron(req: VercelRequest) {
  const cronSecret = process.env.CRON_SECRET;
  return Boolean(cronSecret) && req.headers.authorization === `Bearer ${cronSecret}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startedAt = Date.now();
  const { error } = await supabaseAdmin.rpc('refresh_product_category_daily_actuals');
  if (error) {
    console.error('product category daily actuals refresh error:', error);
    return res.status(500).json({ error: 'product category daily actuals refresh failed' });
  }

  return res.status(200).json({
    ok: true,
    refreshed_at: new Date().toISOString(),
    elapsed_ms: Date.now() - startedAt,
  });
}
