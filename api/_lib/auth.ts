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
  authenticator_assurance_level: 'aal1' | 'aal2' | null;
};

type AuthCacheEntry = {
  profile: AuthenticatedProfile;
  expiresAt: number;
};

type RequireAuthenticatedProfileOptions = {
  allowMfaIncomplete?: boolean;
};

type AuthLoadResult = {
  profile: AuthenticatedProfile | null;
  status: number;
  payload: { error: string; code?: string };
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

const AUTH_PROFILE_CACHE_TTL_MS = 60_000;
const authProfileCache = new Map<string, AuthCacheEntry>();
const authProfileInFlight = new Map<string, Promise<AuthLoadResult>>();

function getBearerToken(req: VercelRequest) {
  const authorizationHeader = req.headers.authorization;
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorizationHeader.slice('Bearer '.length).trim();
  return token || null;
}

function decodeAuthenticatorAssuranceLevel(accessToken: string): 'aal1' | 'aal2' | null {
  try {
    const [, payload] = accessToken.split('.');
    if (!payload) return null;

    const normalizedPayload = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims = JSON.parse(Buffer.from(normalizedPayload, 'base64').toString('utf8'));
    return claims?.aal === 'aal2' ? 'aal2' : claims?.aal === 'aal1' ? 'aal1' : null;
  } catch (error) {
    console.error('api auth aal decode error:', error);
    return null;
  }
}

export async function requireAuthenticatedProfile(
  req: VercelRequest,
  res: VercelResponse,
  options: RequireAuthenticatedProfileOptions = {}
): Promise<AuthenticatedProfile | null> {
  const accessToken = getBearerToken(req);

  if (!accessToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const cacheKey = accessToken;
  const cached = authProfileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (!options.allowMfaIncomplete && cached.profile.authenticator_assurance_level !== 'aal2') {
      res.status(403).json({ error: 'MFA required', code: 'MFA_REQUIRED' });
      return null;
    }
    return cached.profile;
  }

  const inFlight = authProfileInFlight.get(cacheKey);
  if (inFlight) {
    const result = await inFlight;
    if (!result.profile) {
      res.status(result.status).json(result.payload);
    }
    return result.profile;
  }

  const loadProfile = async (): Promise<AuthLoadResult> => {
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(accessToken);

    if (userError || !user) {
      console.error('api auth user lookup error:', userError);
      return { profile: null, status: 401, payload: { error: 'Unauthorized' } };
    }

    const authenticatorAssuranceLevel = decodeAuthenticatorAssuranceLevel(accessToken);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, email, role, department_id, can_view_dashboard')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('api auth profile lookup error:', profileError);
      return { profile: null, status: 403, payload: { error: 'Forbidden' } };
    }

    const authenticatedProfile = {
      id: profile.id,
      email: profile.email ?? user.email ?? '',
      name: profile.name ?? '',
      role: profile.role ?? 'sales',
      department_id: profile.department_id ?? null,
      can_view_dashboard: true,
      authenticator_assurance_level: authenticatorAssuranceLevel,
    };

    authProfileCache.set(cacheKey, {
      profile: authenticatedProfile,
      expiresAt: Date.now() + AUTH_PROFILE_CACHE_TTL_MS,
    });

    return { profile: authenticatedProfile, status: 200, payload: { error: '' } };
  };

  const loadPromise = loadProfile().finally(() => {
    authProfileInFlight.delete(cacheKey);
  });
  authProfileInFlight.set(cacheKey, loadPromise);

  const result = await loadPromise;
  if (!result.profile) {
    res.status(result.status).json(result.payload);
    return null;
  }

  if (!options.allowMfaIncomplete && result.profile.authenticator_assurance_level !== 'aal2') {
    res.status(403).json({ error: 'MFA required', code: 'MFA_REQUIRED' });
    return null;
  }

  return result.profile;
}

export function requireDashboardAccess(
  profile: AuthenticatedProfile,
  res: VercelResponse
) {
  void profile;
  void res;
  return true;
}
