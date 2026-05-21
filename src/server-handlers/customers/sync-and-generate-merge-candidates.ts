

import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { similarity } from '../../lib/mergeUtils.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../../api/_lib/auth.js';
import { parseDepartmentId } from '../../../api/_lib/regions.js';
import { syncRegionalSalesImportArtifacts } from '../../../api/_lib/salesImport.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireDashboardAccess(profile, res)) return;

    const batchId = req.body?.import_batch_id ?? null;
    const departmentId = parseDepartmentId(req.body?.department_id);

    if (!batchId || !departmentId) {
      return res.status(400).json({ error: 'import_batch_id and department_id are required' });
    }

    let departmentSyncResult = {
      customers_upserted: 0,
      sales_rows_upserted: 0,
      customer_external_staff_maps_upserted: 0,
    };

    if (batchId && departmentId) {
      try {
        departmentSyncResult = await syncRegionalSalesImportArtifacts(departmentId, batchId);
      } catch (departmentSyncError) {
        console.error('sync+generate department sync error:', departmentSyncError);
        return res.status(500).json({ error: 'department sales import sync failed' });
      }
    }

    const { data: prospects, error: prospectsError } = await supabaseAdmin
      .from('prospect_customers')
      .select('id, name, status, merged_customer_code')
      .neq('status', 'merged');

    if (prospectsError) {
      console.error('sync+generate prospects error:', prospectsError);
      return res.status(500).json({ error: 'prospects fetch failed' });
    }

    const { data: customers, error: customersError } = await supabaseAdmin
      .from('customers')
      .select('code, name');

    if (customersError) {
      console.error('sync+generate customers error:', customersError);
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
        if (score < 0.8) return;

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
      });
    }

    const { error: insertError } = await supabaseAdmin
      .from('customer_merge_candidates')
      .upsert(candidateRows, {
        onConflict: 'prospect_customer_id,customer_code',
        ignoreDuplicates: false,
      });

    if (insertError) {
      console.error('sync+generate merge insert error:', insertError);
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
    });
  } catch (error) {
    console.error('sync+generate unexpected error:', error);
    return res.status(500).json({ error: 'sync and generate merge candidates api failed' });
  }
}
