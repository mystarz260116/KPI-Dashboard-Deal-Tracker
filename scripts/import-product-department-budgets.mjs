import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const filePath = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const shouldApply = process.argv.includes('--apply');

if (!filePath) {
  throw new Error('CSV path is required');
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  if (value || row.length > 0) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }

  const [rawHeaders, ...dataRows] = rows;
  const headers = rawHeaders.map((header) => header.replace(/^\uFEFF/, '').trim());
  return dataRows
    .filter((values) => values.some((cell) => cell.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function parseNumber(value) {
  const normalized = String(value ?? '').replaceAll(',', '').replace('%', '').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric value: ${value}`);
  return parsed;
}

function normalizeMonth(value) {
  const matched = String(value ?? '').trim().match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
  if (!matched) throw new Error(`Invalid month: ${value}`);
  return `${matched[1]}-${matched[2].padStart(2, '0')}`;
}

const departmentIdByAffiliation = new Map([
  ['関西', 1],
  ['東京', 2],
]);

const rawRows = parseCsv(await fs.readFile(filePath, 'utf8'));
const selectedRows = rawRows.filter((row) => departmentIdByAffiliation.has(row['所属']));
const importRows = selectedRows.map((row) => ({
  department_id: departmentIdByAffiliation.get(row['所属']),
  target_year_month: normalizeMonth(row['年月日']),
  product_department_name: row['商品部門'].trim(),
  target_amount: Math.round(parseNumber(row['売上'])),
  target_units: parseNumber(row['個数']),
  notes: JSON.stringify({
    source: '予算部門ごと.csv',
    source_affiliation: row['所属'],
    target_units: parseNumber(row['個数']),
    seasonal_index: parseNumber(row['季節指数']) / 100,
    provisional_sales: parseNumber(row['売上(仮)']),
    provisional_gross_profit: parseNumber(row['粗利(仮)']),
    provisional_units: parseNumber(row['個数(仮)']),
    price_increase_delta: parseNumber(row['値上減']),
    sales_increase: parseNumber(row['営業増']),
    department_unit_price: parseNumber(row['部門単価']),
    post_increase_sales: parseNumber(row['値上げ後売上']),
    gross_profit: parseNumber(row['粗利']),
    expense: parseNumber(row['費用']),
  }),
}));

const uniqueKeys = new Set(importRows.map((row) => (
  `${row.department_id}|${row.target_year_month}|${row.product_department_name}`
)));
if (uniqueKeys.size !== importRows.length) {
  throw new Error(`Duplicate budget keys found: ${importRows.length - uniqueKeys.size}`);
}

const summary = {
  source_rows: rawRows.length,
  selected_rows: importRows.length,
  ignored_rows: rawRows.length - importRows.length,
  months: [...new Set(importRows.map((row) => row.target_year_month))].sort(),
  by_department: Object.fromEntries([1, 2].map((departmentId) => {
    const rows = importRows.filter((row) => row.department_id === departmentId);
    return [departmentId, {
      rows: rows.length,
      product_departments: new Set(rows.map((row) => row.product_department_name)).size,
      target_amount: rows.reduce((sum, row) => sum + row.target_amount, 0),
      target_units: rows.reduce((sum, row) => sum + row.target_units, 0),
    }];
  })),
};

if (!shouldApply) {
  console.log(JSON.stringify({ mode: 'dry-run', ...summary }, null, 2));
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const productDepartments = [...new Map(importRows.map((row) => [
  `${row.department_id}|${row.product_department_name}`,
  {
    department_id: row.department_id,
    name: row.product_department_name,
    updated_at: new Date().toISOString(),
  },
])).values()];

const productDepartmentUpsert = await supabase
  .from('product_departments')
  .upsert(productDepartments, { onConflict: 'department_id,name' });
if (productDepartmentUpsert.error) throw productDepartmentUpsert.error;

const productDepartmentResult = await supabase
  .from('product_departments')
  .select('id,department_id,name')
  .in('department_id', [1, 2]);
if (productDepartmentResult.error) throw productDepartmentResult.error;

const productDepartmentIdByKey = new Map(productDepartmentResult.data.map((row) => [
  `${row.department_id}|${row.name}`,
  row.id,
]));

const supportsTargetUnits = !(await supabase
  .from('product_department_budgets')
  .select('target_units')
  .limit(1)).error;

const payload = importRows.map((row) => {
  const productDepartmentId = productDepartmentIdByKey.get(
    `${row.department_id}|${row.product_department_name}`,
  );
  if (!productDepartmentId) throw new Error(`Missing product department: ${row.product_department_name}`);

  const result = {
    department_id: row.department_id,
    product_department_id: productDepartmentId,
    target_year_month: row.target_year_month,
    product_department_name: row.product_department_name,
    target_amount: row.target_amount,
    notes: row.notes,
    updated_at: new Date().toISOString(),
  };
  if (supportsTargetUnits) result.target_units = row.target_units;
  return result;
});

for (let index = 0; index < payload.length; index += 100) {
  const result = await supabase
    .from('product_department_budgets')
    .upsert(payload.slice(index, index + 100), {
      onConflict: 'department_id,target_year_month,product_department_name',
    });
  if (result.error) throw result.error;
}

console.log(JSON.stringify({
  mode: 'applied',
  target_units_column_available: supportsTargetUnits,
  ...summary,
}, null, 2));
