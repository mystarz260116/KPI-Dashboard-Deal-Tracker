export function normalizeCustomerCode(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const separatorIndex = raw.search(/[：:]/);
  if (separatorIndex <= 0) return raw;

  const prefix = raw.slice(0, separatorIndex).trim();
  return prefix || raw;
}

export function normalizeCustomerName(value: unknown, fallbackCode: unknown): string {
  const raw = String(value ?? '').trim();
  const fallback = String(fallbackCode ?? '').trim();
  if (!raw) return fallback;

  const separatorIndex = raw.search(/[：:]/);
  if (separatorIndex <= 0) return raw;

  const suffix = raw.slice(separatorIndex + 1).trim();
  return suffix || fallback || raw;
}
