import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import {
  syncRegionalProfileExternalStaffMaps,
} from '../_lib/profileExternalStaff.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const name = String(req.body?.name ?? '').trim();
  const departmentId = Number(req.body?.department_id);

  if (!email || !password || !name || !Number.isFinite(departmentId)) {
    return res.status(400).json({ error: 'email, password, name, department_id are required' });
  }

  try {
    const { data: existingProfiles, error: existingProfilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .limit(1);

    if (existingProfilesError) {
      console.error('register existing profiles lookup error:', existingProfilesError);
      return res.status(500).json({ error: 'profile lookup failed' });
    }

    if ((existingProfiles ?? []).length > 0) {
      return res.status(409).json({ error: 'このメールアドレスは既に登録されています' });
    }

    const { data: department, error: departmentError } = await supabaseAdmin
      .from('departments')
      .select('id')
      .eq('id', departmentId)
      .single();

    if (departmentError || !department) {
      return res.status(400).json({ error: '有効な部署を選択してください' });
    }

    const { data: authResult, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        department_id: departmentId,
        role: 'user',
      },
    });

    if (createUserError || !authResult.user) {
      console.error('register create user error:', createUserError);
      return res.status(500).json({ error: createUserError?.message ?? 'user creation failed' });
    }

    const userId = authResult.user.id;

    const { error: profileInsertError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        name,
        email,
        role: 'user',
        department_id: departmentId,
        can_view_dashboard: false,
      }, {
        onConflict: 'id',
        ignoreDuplicates: false,
      });

    if (profileInsertError) {
      console.error('register profile insert error:', profileInsertError);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: 'profile creation failed' });
    }

    try {
      await syncRegionalProfileExternalStaffMaps(departmentId);
    } catch (profileMapSyncError) {
      console.error('register profile map sync error:', profileMapSyncError);
    }

    return res.status(200).json({
      success: true,
      user: {
        id: userId,
        email,
      },
    });
  } catch (error) {
    console.error('register api unexpected error:', error);
    return res.status(500).json({ error: 'register api failed' });
  }
}
