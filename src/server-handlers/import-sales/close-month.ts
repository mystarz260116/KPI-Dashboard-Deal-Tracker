import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../../api/_lib/auth.js';
import { parseDepartmentId } from '../../../api/_lib/regions.js';
import { normalizeYearMonth } from '../../../api/_lib/salesImportMonthClosures.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireDashboardAccess(profile, res)) return;

    const departmentId = parseDepartmentId(req.body?.department_id);
    const targetYearMonth = normalizeYearMonth(req.body?.target_year_month);

    if (!departmentId || !targetYearMonth) {
      return res.status(400).json({ error: 'department_id and target_year_month are required' });
    }

    if (req.method === 'POST') {
      const { error } = await supabaseAdmin
        .from('sales_import_month_closures')
        .upsert({
          department_id: departmentId,
          target_year_month: targetYearMonth,
          closed_by: profile.id,
          closed_at: new Date().toISOString(),
        }, {
          onConflict: 'department_id,target_year_month',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('sales import close month error:', error);
        return res.status(500).json({ error: 'month close failed' });
      }

      return res.status(200).json({
        success: true,
        is_closed: true,
        target_year_month: targetYearMonth,
      });
    }

    const { error } = await supabaseAdmin
      .from('sales_import_month_closures')
      .delete()
      .eq('department_id', departmentId)
      .eq('target_year_month', targetYearMonth);

    if (error) {
      console.error('sales import reopen month error:', error);
      return res.status(500).json({ error: 'month reopen failed' });
    }

    return res.status(200).json({
      success: true,
      is_closed: false,
      target_year_month: targetYearMonth,
    });
  } catch (error) {
    console.error('sales import close month unexpected error:', error);
    return res.status(500).json({ error: 'sales import close month api failed' });
  }
}
