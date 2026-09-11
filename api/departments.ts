import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';
import { requireAuthenticatedProfile } from './_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method ?? '')) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    if (req.method !== 'GET' && !profile.can_manage_users) return res.status(403).json({ error: 'Forbidden' });

    if (req.method === 'POST') {
      const name = String((req.body as any)?.name ?? '').trim();
      if (!name) return res.status(400).json({ error: '部署名は必須です' });
      const { data: existing } = await supabaseAdmin.from('departments').select('id').eq('name', name).maybeSingle();
      if (existing) return res.status(409).json({ error: '同じ部署名が既に登録されています' });
      const { data: latest, error: latestError } = await supabaseAdmin
        .from('departments').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
      if (latestError) return res.status(500).json({ error: latestError.message });
      const nextId = Number(latest?.id ?? 0) + 1;
      const { data, error } = await supabaseAdmin.from('departments').insert({
        id: nextId,
        name,
        is_sales_department: Boolean((req.body as any)?.is_sales_department),
        is_active: true,
      }).select('id, name, is_sales_department, is_active, sort_order').single();
      if (error) {
        console.error('departments create error:', error);
        return res.status(400).json({ error: error.message });
      }
      return res.status(201).json(data);
    }

    if (req.method === 'PATCH') {
      const id = Number((req.body as any)?.id);
      const name = String((req.body as any)?.name ?? '').trim();
      if (!Number.isInteger(id) || !name) return res.status(400).json({ error: '部署IDと部署名は必須です' });
      const { data, error } = await supabaseAdmin.from('departments').update({
        name,
        is_sales_department: Boolean((req.body as any)?.is_sales_department),
        is_active: (req.body as any)?.is_active !== false,
        sort_order: Number((req.body as any)?.sort_order ?? 0) || 0,
      }).eq('id', id).select('id, name, is_sales_department, is_active, sort_order').single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data);
    }

    const { data, error } = await supabaseAdmin
      .from('departments')
      .select('id, name, is_sales_department, is_active, sort_order')
      .order('sort_order', { ascending: true }).order('id', { ascending: true });

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
