import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { similarity } from '../../lib/mergeUtils.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../../api/_lib/auth.js';
import { parseDepartmentId, SALES_IMPORT_RAW_TABLE } from '../../../api/_lib/regions.js';
import { syncRegionalSalesImportArtifacts } from '../../../api/_lib/salesImport.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const batchId = req.body?.import_batch_id ?? null;
  const departmentId = parseDepartmentId(req.body?.department_id);

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireDashboardAccess(profile, res)) return;

    if (!batchId || !departmentId) {
      return res.status(400).json({ error: 'import_batch_id and department_id are required' });
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
        .from(SALES_IMPORT_RAW_TABLE)
        .select('得意先コード')
        .eq('department_id', departmentId)
        .eq('import_batch_id', batchId);

      if (batchRowsError) {
        console.error('sales import finalize batch lookup error:', batchRowsError);
        return res.status(500).json({ error: 'batch lookup failed' });
      }

      batchCustomerCodes = Array.from(
        new Set((batchRows ?? []).map((r: any) => String(r['得意先コード'])).filter(Boolean))
      );
    }

    let departmentSyncResult = {
      customer_codes: [] as string[],
      customers_upserted: 0,
      sales_rows_upserted: 0,
      customer_external_staff_maps_upserted: 0,
    };

    try {
      departmentSyncResult = await syncRegionalSalesImportArtifacts(departmentId, batchId);
    } catch (departmentSyncError) {
      console.error('sales import finalize department sync error:', departmentSyncError);
      return res.status(500).json({ error: 'department sales import sync failed' });
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
        customer_external_staff_maps_upserted: departmentSyncResult.customer_external_staff_maps_upserted,
        customer_external_staff_maps_upserted_department: departmentSyncResult.customer_external_staff_maps_upserted,
        department_customers_upserted: departmentSyncResult.customers_upserted,
        department_sales_rows_upserted: departmentSyncResult.sales_rows_upserted,
        department_id: departmentId,
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
      customer_external_staff_maps_upserted: departmentSyncResult.customer_external_staff_maps_upserted,
      customer_external_staff_maps_upserted_department: departmentSyncResult.customer_external_staff_maps_upserted,
      department_customers_upserted: departmentSyncResult.customers_upserted,
      department_sales_rows_upserted: departmentSyncResult.sales_rows_upserted,
      department_id: departmentId,
    });
  } catch (error) {
    console.error('sales import finalize unexpected error:', error);
    return res.status(500).json({ error: 'sales import finalize api failed' });
  }
}
