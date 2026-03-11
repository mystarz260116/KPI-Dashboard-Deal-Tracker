

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  if (_req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, name, department_id, departments(name)')
      .order('name', { ascending: true });

    if (error) {
      console.error('users api error:', error);
      return res.status(500).json({ error: 'users fetch failed' });
    }

    const users = (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      department_id: row.department_id ?? null,
      department: row.departments?.name ?? '',
    }));

    return res.status(200).json(users);
  } catch (error) {
    console.error('users api unexpected error:', error);
    return res.status(500).json({ error: 'users api failed' });
  }
}