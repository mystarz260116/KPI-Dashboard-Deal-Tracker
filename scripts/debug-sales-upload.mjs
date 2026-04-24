import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const csvPath = process.argv[2] ?? './元データ取り込み用.csv';
const chunkSize = Number(process.argv[3] ?? '500');
const startIndex = Number(process.argv[4] ?? '0');
const departmentId = Number(process.argv[5] ?? '1');

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsvText(text) {
  const normalized = text.replace(/^\uFEFF/, '');
  const lines = normalized
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);

  return lines
    .slice(1)
    .map(line => {
      const cells = parseCsvLine(line);
      return headers.reduce((row, header, index) => {
        row[header] = cells[index] ?? '';
        return row;
      }, {});
    })
    .filter(row => String(row['得意先コード'] ?? '').trim() !== '');
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const csvText = await fs.readFile(csvPath, 'utf8');
const rows = parseCsvText(csvText).slice(startIndex, startIndex + chunkSize);
const batchId = `debug-${crypto.randomUUID()}`;
const payload = rows.map(row => ({ ...row, department_id: departmentId, import_batch_id: batchId }));

const { error } = await supabase
  .from('sales_import_raw_rows')
  .insert(payload);

if (error) {
  console.log(JSON.stringify({
    ok: false,
    start_index: startIndex,
    message: error.message,
    details: error.details ?? null,
    hint: error.hint ?? null,
    code: error.code ?? null,
    sample_keys: Object.keys(payload[0] ?? {}),
    sample_row: payload[0] ?? null,
  }, null, 2));
  process.exit(1);
}

await supabase
  .from('sales_import_raw_rows')
  .delete()
  .eq('import_batch_id', batchId);

console.log(JSON.stringify({
  ok: true,
  start_index: startIndex,
  inserted: payload.length,
  batch_id: batchId,
}, null, 2));
