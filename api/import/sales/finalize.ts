import { supabaseAdmin } from '../../../src/lib/supabaseAdmin.js';
import { similarity } from '../../../src/lib/mergeUtils.js';

async function syncCustomerExternalStaffMaps(customerCodes?: string[] | null) {
  const { data: salesRows, error: salesRowsError } = await supabaseAdmin
    .from('sales_import_rows')
    .select('customer_code, external_staff_code')
    .not('customer_code', 'is', null)
    .not('external_staff_code', 'is', null);

  if (salesRowsError) {
    throw salesRowsError;
  }

  const filteredSalesRows = customerCodes?.length
    ? (salesRows ?? []).filter((row: any) => customerCodes.includes(String(row.customer_code)))
    : (salesRows ?? []);

  const uniqueMapRows = Array.from(
    new Map(
      filteredSalesRows
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

  const batchId = req.body?.import_batch_id ?? null;

  try {
    const { error: syncError } = await supabaseAdmin.rpc('sync_master_from_sales_import_raw');

    if (syncError) {
      console.error('sales import finalize sync error:', syncError);
      return res.status(500).json({ error: 'sales import finalize sync failed' });
    }

    const { data: prospects, error: prospectsError } = await supabaseAdmin
      .from('prospect_customers')
      .select('id, name, status, merged_customer_code')
      .neq('status', 'merged');

    if (prospectsError) {
      console.error('sales import finalize prospects error:', prospectsError);
      return res.status(500).json({ error: 'prospects fetch failed' });
    }

    let batchCustomerCodes: string[] | null = null;

    if (batchId) {
      const { data: batchRows, error: batchRowsError } = await supabaseAdmin
        .from('sales_import_raw_rows')
        .select('得意先コード')
        .eq('import_batch_id', batchId);

      if (batchRowsError) {
        console.error('sales import finalize batch lookup error:', batchRowsError);
        return res.status(500).json({ error: 'batch lookup failed' });
      }

      batchCustomerCodes = Array.from(
        new Set((batchRows ?? []).map((r: any) => String(r['得意先コード'])).filter(Boolean))
      );
    }

    let customersQuery = supabaseAdmin
      .from('customers')
      .select('code, name');

    if (batchCustomerCodes && batchCustomerCodes.length > 0) {
      customersQuery = customersQuery.in('code', batchCustomerCodes);
    }

    const { data: customers, error: customersError } = await customersQuery;

    if (customersError) {
      console.error('sales import finalize customers error:', customersError);
      return res.status(500).json({ error: 'customers fetch failed' });
    }

    const { data: existingCandidates, error: existingCandidatesError } = await supabaseAdmin
      .from('customer_merge_candidates')
      .select('prospect_customer_id, customer_code, decision');

    if (existingCandidatesError) {
      console.error('sales import finalize existing candidates error:', existingCandidatesError);
      return res.status(500).json({ error: 'existing candidates fetch failed' });
    }

    const rejectedPairs = new Set(
      (existingCandidates ?? [])
        .filter((c: any) => c.decision === 'rejected')
        .map((c: any) => `${c.prospect_customer_id}::${c.customer_code}`)
    );

    let customerExternalStaffMapResult;
    try {
      customerExternalStaffMapResult = await syncCustomerExternalStaffMaps(batchCustomerCodes);
    } catch (customerExternalStaffMapsError) {
      console.error('sales import finalize customer external staff maps error:', customerExternalStaffMapsError);
      return res.status(500).json({ error: 'customer external staff maps sync failed' });
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

        const pairKey = `${prospect.id}::${customer.code}`;
        if (rejectedPairs.has(pairKey)) return;

        candidateRows.push({
          prospect_customer_id: prospect.id,
          customer_code: customer.code,
          match_score: Number(score.toFixed(4)),
          match_reason: 'name_similarity',
          decision: 'pending',
        });
      });
    });

    if (candidateRows.length === 0) {
      return res.status(200).json({
        success: true,
        synced: true,
        inserted_count: 0,
        customer_external_staff_maps_upserted: customerExternalStaffMapResult?.upserted_count ?? 0,
      });
    }

    const { error: insertError } = await supabaseAdmin
      .from('customer_merge_candidates')
      .upsert(candidateRows, {
        onConflict: 'prospect_customer_id,customer_code',
        ignoreDuplicates: false,
      });

    if (insertError) {
      console.error('sales import finalize merge insert error:', insertError);
      return res.status(500).json({ error: 'merge candidates insert failed' });
    }

    return res.status(200).json({
      success: true,
      synced: true,
      inserted_count: candidateRows.length,
      customer_external_staff_maps_upserted: customerExternalStaffMapResult?.upserted_count ?? 0,
    });
  } catch (error) {
    console.error('sales import finalize unexpected error:', error);
    return res.status(500).json({ error: 'sales import finalize api failed' });
  }
}