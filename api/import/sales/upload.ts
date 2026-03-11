import { supabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { similarity } from '../../../src/lib/mergeUtils.js';

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

async function syncCustomerExternalStaffMaps() {
  const { data: salesRows, error: salesRowsError } = await supabaseAdmin
    .from('sales_import_rows')
    .select('customer_code, external_staff_code')
    .not('customer_code', 'is', null)
    .not('external_staff_code', 'is', null);

  if (salesRowsError) {
    throw salesRowsError;
  }

  const uniqueMapRows = Array.from(
    new Map(
      (salesRows ?? [])
        .filter((row: any) => row.customer_code && row.external_staff_code)
        .map((row: any) => [
          `${String(row.customer_code)}::${String(row.external_staff_code)}`,
          {
            customer_code: String(row.customer_code),
            external_staff_code: String(row.external_staff_code),
          },
        ])
    ).values()
  );

  if (uniqueMapRows.length === 0) {
    return { upserted_count: 0 };
  }

  const { error: upsertError } = await supabaseAdmin
    .from('customer_external_staff_maps')
    .upsert(uniqueMapRows, {
      onConflict: 'customer_code,external_staff_code',
      ignoreDuplicates: false,
    });

  if (upsertError) {
    throw upsertError;
  }

  return { upserted_count: uniqueMapRows.length };
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

    // 1. Insert CSV rows into raw table
    let uploadResult;
    try {
      uploadResult = await insertSalesImportRawRows(rows);
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

    // 3. Sync customer_external_staff_maps
    let customerExternalStaffMapResult;
    try {
      customerExternalStaffMapResult = await syncCustomerExternalStaffMaps();
    } catch (customerExternalStaffMapsError) {
      console.error(
        'sales upload customer external staff maps error:',
        customerExternalStaffMapsError
      );
      return res.status(500).json({
        error: 'customer external staff maps sync failed',
      });
    }

    // 4. Generate merge candidates
    const { data: prospects, error: prospectsError } = await supabaseAdmin
      .from('prospect_customers')
      .select('id, name, status, merged_customer_code')
      .neq('status', 'merged');

    if (prospectsError) {
      console.error('sales upload prospects error:', prospectsError);
      return res.status(500).json({ error: 'prospects fetch failed' });
    }

    const { data: customers, error: customersError } = await supabaseAdmin
      .from('customers')
      .select('code, name');

    if (customersError) {
      console.error('sales upload customers error:', customersError);
      return res.status(500).json({ error: 'customers fetch failed' });
    }

    const candidateRows: Array<{
      prospect_customer_id: string;
      customer_code: string;
      match_score: number;
      match_reason: string;
      decision: string;
    }> = [];

    (prospects ?? []).forEach((prospect: any) => {
      const prospectName = prospect.name ?? '';

      (customers ?? []).forEach((customer: any) => {
        const score = similarity(prospectName, customer.name ?? '');
        if (score < 0.6) return;

        candidateRows.push({
          prospect_customer_id: prospect.id,
          customer_code: customer.code,
          match_score: Number(score.toFixed(4)),
          match_reason: 'name_similarity',
          decision: 'pending',
        });
      });
    });

    let mergeInsertedCount = 0;

    if (candidateRows.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('customer_merge_candidates')
        .upsert(candidateRows, {
          onConflict: 'prospect_customer_id,customer_code',
          ignoreDuplicates: false,
        });

      if (insertError) {
        console.error('sales upload merge insert error:', insertError);
        return res.status(500).json({ error: 'merge candidates insert failed' });
      }

      mergeInsertedCount = candidateRows.length;
    }

    return res.status(200).json({
      success: true,
      uploaded_count: uploadResult.inserted_count,
      synced: true,
      finalized: true,
      customer_external_staff_maps_upserted:
        customerExternalStaffMapResult?.upserted_count ?? 0,
      merge_candidates_inserted_count: mergeInsertedCount,
    });
  } catch (error) {
    console.error('sales upload unexpected error:', error);
    return res.status(500).json({ error: 'sales upload api failed' });
  }
}