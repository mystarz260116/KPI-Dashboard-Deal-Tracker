import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../../api/_lib/auth.js';
import { parseDepartmentId } from '../../../api/_lib/regions.js';
import { normalizeYearMonth } from '../../../api/_lib/salesImportMonthClosures.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireDashboardAccess(profile, res)) return;

    const departmentId = parseDepartmentId(req.query?.department_id);
    if (!departmentId) {
      return res.status(400).json({ error: 'department_id is required' });
    }

    const targetYearMonth = normalizeYearMonth(req.query?.target_year_month);

    let statusRow: any = null;
    if (targetYearMonth) {
      const { data, error } = await supabaseAdmin
        .from('sales_import_month_closures')
        .select('target_year_month, closed_at, closed_by')
        .eq('department_id', departmentId)
        .eq('target_year_month', targetYearMonth)
        .maybeSingle();

      if (error) {
        console.error('sales import month closure status error:', error);
        return res.status(500).json({ error: 'month closure status fetch failed' });
      }

      statusRow = data;
    }

    const { data: recentRows, error: recentRowsError } = await supabaseAdmin
      .from('sales_import_month_closures')
      .select('target_year_month, closed_at, closed_by')
      .eq('department_id', departmentId)
      .order('target_year_month', { ascending: false })
      .limit(12);

    if (recentRowsError) {
      console.error('sales import month closure recent rows error:', recentRowsError);
      return res.status(500).json({ error: 'month closure recent fetch failed' });
    }

    const closedByIds = Array.from(
      new Set([
        ...(recentRows ?? []).map((row: any) => row.closed_by).filter(Boolean),
        statusRow?.closed_by,
      ].filter(Boolean))
    );

    const profileNameById = new Map<string, string>();
    if (closedByIds.length > 0) {
      const { data: closureProfiles, error: closureProfilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, name')
        .in('id', closedByIds);

      if (closureProfilesError) {
        console.error('sales import month closure profile lookup error:', closureProfilesError);
        return res.status(500).json({ error: 'month closure profile fetch failed' });
      }

      (closureProfiles ?? []).forEach((row: any) => {
        profileNameById.set(String(row.id), row.name ?? '');
      });
    }

    const recentClosedMonths = (recentRows ?? []).map((row: any) => ({
      target_year_month: row.target_year_month,
      closed_at: row.closed_at,
      closed_by: row.closed_by,
      closed_by_name: row.closed_by ? profileNameById.get(String(row.closed_by)) ?? '' : '',
    }));

    return res.status(200).json({
      target_year_month: targetYearMonth,
      is_closed: Boolean(statusRow),
      closed_at: statusRow?.closed_at ?? null,
      closed_by: statusRow?.closed_by ?? null,
      closed_by_name: statusRow?.closed_by ? profileNameById.get(String(statusRow.closed_by)) ?? '' : '',
      recent_closed_months: recentClosedMonths,
    });
  } catch (error) {
    console.error('sales import month closures unexpected error:', error);
    return res.status(500).json({ error: 'sales import month closures api failed' });
  }
}
