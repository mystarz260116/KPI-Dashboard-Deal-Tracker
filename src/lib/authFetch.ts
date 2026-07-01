import { supabase } from './supabase';
import { storeMfaRedirectPath } from './mfaReverification';

let cachedAccessToken: string | null | undefined;
let sessionPromise: Promise<string | null> | null = null;

supabase.auth.onAuthStateChange((_event, session) => {
  cachedAccessToken = session?.access_token ?? null;
});

async function getAccessToken() {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }

  if (!sessionPromise) {
    sessionPromise = supabase.auth.getSession().then(({ data }) => {
      cachedAccessToken = data.session?.access_token ?? null;
      return cachedAccessToken;
    }).finally(() => {
      sessionPromise = null;
    });
  }

  return sessionPromise;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const accessToken = await getAccessToken();

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 403 && typeof window !== 'undefined') {
    try {
      const payload = await response.clone().json();
      if (payload?.code === 'MFA_REQUIRED' || payload?.code === 'MFA_REVERIFY_REQUIRED') {
        if (!window.location.pathname.startsWith('/mfa/')) {
          storeMfaRedirectPath(`${window.location.pathname}${window.location.search}`);
          window.location.assign('/mfa/verify');
        }
      }
    } catch {
      // Non-JSON 403 responses are handled by the caller.
    }
  }

  return response;
}
