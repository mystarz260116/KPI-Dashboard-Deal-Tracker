const MFA_REVERIFY_MIN_DAYS = 3;
const MFA_REVERIFY_MAX_DAYS = 7;

export function getNextMfaReverifyAfter(now = new Date()) {
  const days = MFA_REVERIFY_MIN_DAYS
    + Math.random() * (MFA_REVERIFY_MAX_DAYS - MFA_REVERIFY_MIN_DAYS);
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isMfaReverificationRequired(reverifyAfter?: string | null, now = new Date()) {
  if (!reverifyAfter) return true;

  const reverifyAt = new Date(reverifyAfter).getTime();
  if (!Number.isFinite(reverifyAt)) return true;

  return reverifyAt <= now.getTime();
}
