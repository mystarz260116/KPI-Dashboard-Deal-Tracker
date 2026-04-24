import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { syncRegionalProfileExternalStaffMaps } from './profileExternalStaff.js';

type RegionalSyncResult = {
  customer_codes: string[];
  customers_upserted: number;
  sales_rows_upserted: number;
  customer_external_staff_maps_upserted: number;
};

export async function syncRegionalSalesImportArtifacts(
  departmentId: number,
  importBatchId: string
): Promise<RegionalSyncResult> {
  const { data, error } = await supabaseAdmin.rpc('sync_sales_import_batch', {
    p_department_id: departmentId,
    p_import_batch_id: importBatchId,
  });

  if (error) {
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;
  await syncRegionalProfileExternalStaffMaps(departmentId);

  return {
    customer_codes: result?.customer_codes ?? [],
    customers_upserted: Number(result?.customers_upserted ?? 0),
    sales_rows_upserted: Number(result?.sales_rows_upserted ?? 0),
    customer_external_staff_maps_upserted: Number(result?.customer_external_staff_maps_upserted ?? 0),
  };
}
