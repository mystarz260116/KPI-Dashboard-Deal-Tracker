import { supabase } from './supabase';

export async function recordMfaVerification() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers({
    'Content-Type': 'application/json',
  });

  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  const response = await fetch('/api/auth/mfa', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'record-verification' }),
  });

  if (!response.ok) {
    throw new Error('MFA verification update failed');
  }

  return response.json();
}
