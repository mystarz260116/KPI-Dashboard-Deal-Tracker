export const SALES_IMPORT_RAW_TABLE = 'sales_import_raw_rows';
export const CUSTOMERS_TABLE = 'customers';
export const SALES_IMPORT_ROWS_TABLE = 'sales_import_rows';
export const CUSTOMER_STAFF_MAP_TABLE = 'customer_external_staff_maps';

export function parseDepartmentId(value: unknown) {
  const departmentId = Number(value);
  return Number.isInteger(departmentId) && departmentId > 0 ? departmentId : null;
}

export function normalizeRawDate(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const normalized = raw.replace(/[.]/g, '/').replace(/-/g, '/');
  const [year, month, day] = normalized.split('/').map((part) => part.trim());

  if (!year || !month || !day) {
    return null;
  }

  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function extractCodePrefix(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const code = raw.split('：')[0]?.trim() ?? '';
  return code || null;
}

export function parseRawAmount(value: unknown) {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (!raw) return 0;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}
