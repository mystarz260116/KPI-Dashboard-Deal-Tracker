import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuthenticatedProfile } from '../../../api/_lib/auth.js';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';

function parseMonth(value: unknown) {
  const month = String(value ?? '').trim();
  return /^\d{4}-\d{2}$/.test(month) ? month : null;
}

function getMonthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonth = new Date(year, monthNumber, 1);
  return {
    start: `${month}-01`,
    endExclusive: `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`,
  };
}

export default async function historyHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const profile = await requireAuthenticatedProfile(req, res);
  if (!profile) return;

  const month = parseMonth(req.query.month);
  if (!month) {
    return res.status(400).json({ error: 'month must be YYYY-MM' });
  }

  const { start, endExclusive } = getMonthRange(month);
  const query = supabaseAdmin
    .from('deals')
    .select('id, customer_code, prospect_customer_id, user_id, deal_date, activity_type, executed_action_type, product_name, amount, expected_monthly_amounts, notes, next_action, contact_role, decision_maker_contact, proposal_category, proposal_categories, deal_temperature, next_action_type, next_action_date, customers(name), prospect_customers(name), profiles!deals_user_id_fkey(name)')
    .gte('deal_date', start)
    .lt('deal_date', endExclusive)
    .order('deal_date', { ascending: false })
    .order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) {
    console.error('deal history api fetch error:', error);
    return res.status(500).json({ error: 'Deal history fetch failed' });
  }

  return res.status(200).json({ deals: data ?? [] });
}
