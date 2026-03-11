import { supabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import crypto from 'crypto';

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

    const { error } = await supabaseAdmin
      .from('sales_import_raw_rows')
      .insert(chunk);

    if (error) {
      throw error;
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
    const rows: RawSalesImportRow[] = Array.isArray(req.body?.rows)
      ? req.body.rows
      : [];

    if (!rows.length) {
      return res.status(400).json({ error: 'rows are required' });
    }

    const batchId = req.body?.import_batch_id ?? crypto.randomUUID();

    const rowsWithBatch = rows.map((r) => ({
      ...r,
      import_batch_id: batchId,
    }));

    // 1. Insert CSV rows into raw table
    let uploadResult;
    try {
      uploadResult = await insertSalesImportRawRows(rowsWithBatch);
    } catch (uploadError) {
      console.error('sales import upload error:', uploadError);
      return res.status(500).json({ error: 'sales import raw upload failed' });
    }

    // 2. Sync customers from raw import rows
    const { error: syncError } = await supabaseAdmin.rpc(
      'sync_master_from_sales_import_raw'
    );

    if (syncError) {
      console.error('sales import finalize sync error:', syncError);
      return res.status(500).json({ error: 'sales import finalize sync failed' });
    }

    return res.status(200).json({
      success: true,
      uploaded_count: uploadResult.inserted_count,
      import_batch_id: batchId,
      finalized: true,
    });
  } catch (error) {
    console.error('sales upload unexpected error:', error);
    return res.status(500).json({ error: 'sales upload api failed' });
  }
}