import { supabase } from './supabase';

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

  return fetch(input, {
    ...init,
    headers,
  });
}
