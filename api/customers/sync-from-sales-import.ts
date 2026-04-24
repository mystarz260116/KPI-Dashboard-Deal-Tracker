

import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../_lib/auth.js';
import { parseDepartmentId } from '../_lib/regions.js';
import { syncRegionalSalesImportArtifacts } from '../_lib/salesImport.js';

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
        console.error('customers department sync error:', departmentSyncError);
        return res.status(500).json({ error: 'department sales import sync failed' });
      }
    }

    return res.status(200).json({
      success: true,
      customer_external_staff_maps_upserted: departmentSyncResult.customer_external_staff_maps_upserted,
      customer_external_staff_maps_upserted_department: departmentSyncResult.customer_external_staff_maps_upserted,
      department_customers_upserted: departmentSyncResult.customers_upserted,
      department_sales_rows_upserted: departmentSyncResult.sales_rows_upserted,
    });
  } catch (error) {
    console.error('customers sync unexpected error:', error);
    return res.status(500).json({ error: 'customers sync api failed' });
  }
}
