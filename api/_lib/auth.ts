import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';

type AuthenticatedProfile = {
  id: string;
  email: string;
  name: string;
  role: string;
  department_id: string | null;
  can_view_dashboard: boolean;
};

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error('SUPABASE_URL is required for API auth');
}

if (!supabaseAnonKey) {
  throw new Error('SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY is required for API auth');
}

const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function getBearerToken(req: VercelRequest) {
  const authorizationHeader = req.headers.authorization;
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorizationHeader.slice('Bearer '.length).trim();
  return token || null;
}

export async function requireAuthenticatedProfile(
  req: VercelRequest,
  res: VercelResponse
): Promise<AuthenticatedProfile | null> {
  const accessToken = getBearerToken(req);

  if (!accessToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAuth.auth.getUser(accessToken);

  if (userError || !user) {
    console.error('api auth user lookup error:', userError);
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, name, email, role, department_id, can_view_dashboard')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('api auth profile lookup error:', profileError);
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return {
    id: profile.id,
    email: profile.email ?? user.email ?? '',
    name: profile.name ?? '',
    role: profile.role ?? 'sales',
    department_id: profile.department_id ?? null,
    can_view_dashboard: profile.can_view_dashboard ?? false,
  };
}

export function requireDashboardAccess(
  profile: AuthenticatedProfile,
  res: VercelResponse
) {
  if (profile.can_view_dashboard) {
    return true;
  }

  res.status(403).json({ error: 'Forbidden' });
  return false;
}
