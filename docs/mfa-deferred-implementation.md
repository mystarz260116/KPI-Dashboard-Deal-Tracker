# MFA Deferred Implementation Notes

MFA was temporarily removed from the active product flow on 2026-06-12.

## Preserved implementation

- `src/pages/MfaSetup.tsx`
  - TOTP enrollment with `supabase.auth.mfa.enroll({ factorType: 'totp' })`
  - iPhone-first setup path using the returned `totp.secret`
  - PC setup path using the returned `totp.qr_code`
  - Verification with `challenge()` and `verify()`
- `src/pages/MfaVerify.tsx`
  - Existing TOTP factor lookup
  - Login verification with `challengeAndVerify()`
- `src/contexts/AuthContext.tsx`
  - `mfaStatus`, `isMfaLoading`, and `refreshMfaStatus()` remain in the context shape for compatibility.
  - Active MFA status loading has been disabled.

## Disabled active flow

- `src/App.tsx`
  - Protected routes no longer redirect to `/mfa/setup` or `/mfa/verify`.
  - Auth redirects after login go directly to the normal app home path.
  - `/mfa/setup` and `/mfa/verify` currently redirect to `/login`.
- `src/pages/ResetPassword.tsx`
  - Password reset no longer prompts for MFA codes.
  - Post-reset navigation goes directly to the normal app home path.
- `src/contexts/AuthContext.tsx`
  - Login/session loading no longer calls `getAuthenticatorAssuranceLevel()` or `listFactors()`.
  - Login usage tracking no longer waits for an `aal2` session.

## Re-enable checklist

1. Re-import `MfaSetup` and `MfaVerify` in `src/App.tsx`.
2. Restore an MFA route guard that sends users without enrolled factors to `/mfa/setup`.
3. Restore login flow handling for enrolled but unverified factors to `/mfa/verify`.
4. Restore `AuthContext` MFA status loading with `getAuthenticatorAssuranceLevel()` and `listFactors()`.
5. Decide whether password reset should require MFA for enrolled users.
6. Verify the iPhone setup path:
   - Copy secret key
   - Open authenticator app via `otpauth://`
   - Enter 6 digit code
7. Run `npm run lint` and `npm run build`.
