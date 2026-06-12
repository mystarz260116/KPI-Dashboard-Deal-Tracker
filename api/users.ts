

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../src/lib/supabaseAdmin.js';
import { requireAuthenticatedProfile } from './_lib/auth.js';
const EXCLUDED_DASHBOARD_DEPARTMENTS = new Set(['管理部']);

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const isRecordLoginRequest = _req.method === 'POST'
      && String((_req.body as any)?.action ?? '').trim() === 'record-login';
    const profile = await requireAuthenticatedProfile(_req, res, {
      allowMfaIncomplete: isRecordLoginRequest,
    });
    if (!profile) return;

    if (_req.method === 'POST') {
      const action = String((_req.body as any)?.action ?? '').trim();
      if (action !== 'record-login') {
        return res.status(400).json({ error: 'Unsupported action' });
      }

      const loggedInAt = new Date().toISOString();

      const { error: insertError } = await supabaseAdmin
        .from('login_events')
        .insert({
          user_id: profile.id,
          logged_in_at: loggedInAt,
        });

      if (insertError) {
        console.error('users api login event insert error:', insertError);
        return res.status(500).json({ error: 'login event insert failed' });
      }

      const { data: currentProfile, error: currentProfileError } = await supabaseAdmin
        .from('profiles')
        .select('login_count')
        .eq('id', profile.id)
        .single();

      if (currentProfileError) {
        console.error('users api current profile fetch error:', currentProfileError);
        return res.status(500).json({ error: 'profile login count fetch failed' });
      }

      const currentLoginCount = Number(currentProfile?.login_count ?? 0);

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({
          last_login_at: loggedInAt,
          login_count: Number.isFinite(currentLoginCount) ? currentLoginCount + 1 : 1,
        })
        .eq('id', profile.id);

      if (updateError) {
        console.error('users api login profile update error:', updateError);
        return res.status(500).json({ error: 'profile login update failed' });
      }

      return res.status(200).json({ ok: true });
    }

    if (_req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, name, department_id, departments(name)')
      .order('name', { ascending: true });

    if (error) {
      console.error('users api error:', error);
      return res.status(500).json({ error: 'users fetch failed' });
    }

    const users = (data ?? [])
      .map((row: any) => ({
        id: row.id,
        name: row.name,
        department_id: row.department_id ?? null,
        department: row.departments?.name ?? '',
      }))
      .filter((row) => !EXCLUDED_DASHBOARD_DEPARTMENTS.has(row.department));

    return res.status(200).json(users);
  } catch (error) {
    console.error('users api unexpected error:', error);
    return res.status(500).json({ error: 'users api failed' });
  }
}
