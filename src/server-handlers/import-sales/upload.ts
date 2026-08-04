import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import crypto from 'crypto';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../../api/_lib/auth.js';
import {
  parseDepartmentId,
  SALES_IMPORT_RAW_TABLE,
} from '../../../api/_lib/regions.js';
import { normalizeSalesImportDataKind } from '../../../api/_lib/regionalReads.js';

// Type for incoming rows from the CSV parser on the client
// We keep it flexible because CSV headers may vary
// but they must match the columns of sales_import_raw_rows
// when inserted.
type RawSalesImportRow = Record<string, any>;

const REDACTED_RAW_COLUMNS = new Set(['患者名']);
const SALES_IMPORT_RAW_WRITABLE_COLUMNS = new Set([
  '納品日',
  '得意先コード',
  '得意先名',
  '担当者コード',
  '取引区分',
  '締切日',
  '伝票番号',
  '見積番号',
  '摘要',
  '税転嫁',
  '技工計',
  '材料計',
  '外税計',
  '印刷F',
  '内訳技工（保険）',
  '内訳技工（自費）',
  '内訳材料（保険）',
  '内訳材料（自費）',
  '得意先入力用コード',
  '得意先預り材料処理コード',
  '行No',
  '受注番号',
  '歯式右上',
  '歯式左上',
  '歯式左下',
  '歯式右下',
  '補綴物コード',
  '補綴物名',
  '単位',
  '明細区分',
  '数量',
  '単価',
  '金額',
  '預り残',
  '患者名',
  '技工士コード',
  'ユーザー入力項目コード',
  '技工録ID',
  '受注内部コード',
  '自費保険F',
  '受注日',
  'セット日',
  'セット時間',
  '納品タイプ',
  '性別',
  '年齢',
  '色',
  '作業指示1',
  '作業指示2',
  '預り品1',
  '預り品2',
  '預り品3',
  '預り品4',
  '預り品5',
  '預り品6',
  '預り品7',
  '預り品8',
  '預り品9',
  '預り品10',
  '預り品名',
  'メモ',
  '補綴物部門コード',
  '発行済',
  '咬合器',
  '得意先入力コード',
  '預り材料処理コード',
  'data_kind',
  'department_id',
  'import_batch_id',
  'imported_at',
]);

function normalizeCsvColumnName(columnName: string) {
  return columnName.replace(/^\uFEFF/, '').trim();
}

function sanitizeSalesImportRow(row: RawSalesImportRow): RawSalesImportRow {
  return Object.fromEntries(
    Object.entries(row)
      .map(([key, value]) => [normalizeCsvColumnName(key), value] as const)
      .filter(([key]) => SALES_IMPORT_RAW_WRITABLE_COLUMNS.has(key))
  );
}

function redactSalesImportRow(row: RawSalesImportRow): RawSalesImportRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      REDACTED_RAW_COLUMNS.has(key) ? '' : value,
    ])
  );
}

async function insertSalesImportRawRows(rows: RawSalesImportRow[]) {
  if (!rows.length) {
    return { inserted_count: 0 };
  }

  const chunkSize = 500;
  let insertedCount = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows
      .slice(index, index + chunkSize)
      .map(sanitizeSalesImportRow)
      .map(redactSalesImportRow);
    const insertResult = await supabaseAdmin
      .from(SALES_IMPORT_RAW_TABLE)
      .insert(chunk);

    if (insertResult.error) {
      throw insertResult.error;
    }

    insertedCount += chunk.length;
  }

  return { inserted_count: insertedCount };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireDashboardAccess(profile, res)) return;

    const rows: RawSalesImportRow[] = Array.isArray(req.body?.rows)
      ? req.body.rows
      : [];

    if (!rows.length) {
      return res.status(400).json({ error: 'rows are required' });
    }

    const departmentId = parseDepartmentId(req.body?.department_id);
    if (!departmentId) {
      return res.status(400).json({ error: 'department_id is required' });
    }

    const batchId = req.body?.import_batch_id ?? crypto.randomUUID();
    const importedAt = req.body?.imported_at ?? new Date().toISOString();
    const dataKind = normalizeSalesImportDataKind(req.body?.data_kind);

    const rowsWithBatch = rows.map((r) => ({
      ...sanitizeSalesImportRow(r),
      data_kind: dataKind,
      department_id: departmentId,
      import_batch_id: batchId,
      imported_at: importedAt,
    }));

    // Insert CSV rows into the raw table only.
    // Downstream sync should run once in /api/import/sales/finalize
    // after every chunk has been uploaded.
    let uploadResult;
    try {
      uploadResult = await insertSalesImportRawRows(rowsWithBatch);
    } catch (uploadError) {
      console.error('sales import upload error:', uploadError);
      const errorObject = uploadError as {
        message?: string;
        details?: string;
        hint?: string;
        code?: string;
      };

      return res.status(500).json({
        error: 'sales import raw upload failed',
        message: errorObject?.message ?? null,
        details: errorObject?.details ?? null,
        hint: errorObject?.hint ?? null,
        code: errorObject?.code ?? null,
      });
    }

    return res.status(200).json({
      success: true,
      uploaded_count: uploadResult.inserted_count,
      import_batch_id: batchId,
      department_id: departmentId,
      data_kind: dataKind,
      imported_at: importedAt,
      finalized: false,
    });
  } catch (error) {
    console.error('sales upload unexpected error:', error);
    return res.status(500).json({ error: 'sales upload api failed' });
  }
}
