

import { supabaseAdmin } from '../../src/lib/supabaseAdmin';

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
    const { error } = await supabaseAdmin.rpc('sync_master_from_sales_import_raw');

    if (error) {
      console.error('customers sync error:', error);
      return res.status(500).json({ error: 'customers sync failed' });
    }

    let customerExternalStaffMapResult;
    try {
      customerExternalStaffMapResult = await syncCustomerExternalStaffMaps();
    } catch (customerExternalStaffMapsError) {
      console.error('customers sync customer external staff maps error:', customerExternalStaffMapsError);
      return res.status(500).json({ error: 'customer external staff maps sync failed' });
    }

    return res.status(200).json({
      success: true,
      customer_external_staff_maps_upserted: customerExternalStaffMapResult?.upserted_count ?? 0,
    });
  } catch (error) {
    console.error('customers sync unexpected error:', error);
    return res.status(500).json({ error: 'customers sync api failed' });
  }
}