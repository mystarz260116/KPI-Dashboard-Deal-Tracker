import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { similarity } from '../../src/lib/mergeUtils.js';

export async function fetchProfileExternalStaffCodes(
  profileId: string,
  departmentId: number | null | undefined
) {
  if (!departmentId) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('profile_external_staff_maps')
    .select('external_staff_code')
    .eq('department_id', departmentId)
    .eq('profile_id', profileId);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => String(row.external_staff_code)).filter(Boolean);
}

export async function syncRegionalProfileExternalStaffMaps(
  departmentId: number,
  options?: { threshold?: number }
) {
  const threshold = options?.threshold ?? 0.4;

  const [profilesResult, staffsResult] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, name, department_id')
      .eq('department_id', departmentId),
    supabaseAdmin
      .from('external_staffs')
      .select('code, name, raw_label')
      .eq('department_id', departmentId),
  ]);

  if (profilesResult.error) {
    throw profilesResult.error;
  }

  if (staffsResult.error) {
    throw staffsResult.error;
  }

  const profiles = profilesResult.data ?? [];
  const staffs = staffsResult.data ?? [];

  if (profiles.length === 0) {
    return {
      department_id: departmentId,
      scanned_profiles: 0,
      scanned_staffs: staffs.length,
      matched_count: 0,
      cleared_count: 0,
    };
  }

  const matchedRows = profiles
    .map((profile: any) => {
      const best = staffs.reduce<{ code: string; score: number } | null>((currentBest, staff: any) => {
        const score = similarity(profile.name ?? '', staff.name ?? staff.raw_label ?? '');

        if (!currentBest || score > currentBest.score) {
          return { code: String(staff.code), score };
        }

        return currentBest;
      }, null);

      if (!best || best.score < threshold) {
        return null;
      }

      return {
        department_id: departmentId,
        profile_id: profile.id,
        external_staff_code: best.code,
        is_primary: true,
      };
    })
    .filter(Boolean);

  const profileIds = profiles.map((profile: any) => profile.id);

  const { error: deleteError, count: clearedCount } = await supabaseAdmin
    .from('profile_external_staff_maps')
    .delete({ count: 'exact' })
    .eq('department_id', departmentId)
    .in('profile_id', profileIds);

  if (deleteError) {
    throw deleteError;
  }

  if (matchedRows.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from('profile_external_staff_maps')
      .upsert(matchedRows, {
        onConflict: 'department_id,profile_id,external_staff_code',
        ignoreDuplicates: false,
      });

    if (insertError) {
      throw insertError;
    }
  }

  return {
    department_id: departmentId,
    scanned_profiles: profiles.length,
    scanned_staffs: staffs.length,
    matched_count: matchedRows.length,
    cleared_count: clearedCount ?? 0,
  };
}
