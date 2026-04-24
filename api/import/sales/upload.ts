import { supabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import crypto from 'crypto';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../_lib/auth.js';
import {
  parseDepartmentId,
  SALES_IMPORT_RAW_TABLE,
} from '../../_lib/regions.js';

// Type for incoming rows from the CSV parser on the client
// We keep it flexible because CSV headers may vary
// but they must match the columns of sales_import_raw_rows
// when inserted.
type RawSalesImportRow = Record<string, any>;

async function insertSalesImportRawRows(rows: RawSalesImportRow[]) {
  if (!rows.length) {
    return { inserted_count: 0 };
  }

  const chunkSize = 500;
  let insertedCount = 0;

  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
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

    const rowsWithBatch = rows.map((r) => ({
      ...r,
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
      imported_at: importedAt,
      finalized: false,
    });
  } catch (error) {
    console.error('sales upload unexpected error:', error);
    return res.status(500).json({ error: 'sales upload api failed' });
  }
}
