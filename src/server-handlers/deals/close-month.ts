import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../../api/_lib/auth.js';
import { fetchFirstOrderDateByCustomerCode, filterMergedProspectsByFirstOrderDate } from '../../../api/_lib/newOrderDates.js';

type DealRow = {
  id: string;
  customer_code: string | null;
  prospect_customer_id: string | null;
  deal_date: string;
  pipeline_stage: 'targeting' | 'visiting' | 'negotiating' | 'accepted' | 'won' | 'lost' | null;
  created_at: string;
  prospect_customers?: {
    status?: string | null;
    merged_customer_code?: string | null;
  } | null;
};

const DEAL_CLOSE_SELECT = 'id, customer_code, prospect_customer_id, deal_date, pipeline_stage, created_at, prospect_customers(status, merged_customer_code)';

function parseMonth(value: unknown) {
  const raw = String(value ?? '').trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null;
}

function compareDeals(a: DealRow, b: DealRow) {
  if (a.deal_date !== b.deal_date) {
    return a.deal_date < b.deal_date ? 1 : -1;
  }

  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? 1 : -1;
  }

  return a.id < b.id ? 1 : -1;
}

function resolveClinicKey(row: DealRow) {
  if (row.customer_code) {
    return `customer:${row.customer_code}`;
  }

  const mergedCustomerCode = row.prospect_customers?.merged_customer_code;
  if (mergedCustomerCode) {
    return `customer:${mergedCustomerCode}`;
  }

  return `prospect:${row.prospect_customer_id ?? row.id}`;
}

function resolvePipelineStage(row: DealRow) {
  const isMergedProspect = row.prospect_customers?.status === 'merged' && row.prospect_customers?.merged_customer_code;
  if (isMergedProspect) {
    return 'won';
  }

  return row.pipeline_stage ?? 'visiting';
}

async function fetchMergedProspectDealsInMonth(monthStart: string, monthEndExclusive: string) {
  const { data: mergedProspects, error: mergedProspectsError } = await supabaseAdmin
    .from('prospect_customers')
    .select('id, merged_customer_code')
    .eq('status', 'merged')
    .not('merged_customer_code', 'is', null);

  if (mergedProspectsError) {
    throw mergedProspectsError;
  }

  const firstOrderDateByCustomerCode = await fetchFirstOrderDateByCustomerCode(
    (mergedProspects ?? []).map((row: any) => row.merged_customer_code).filter(Boolean)
  );
  const mergedProspectsInMonth = filterMergedProspectsByFirstOrderDate(
    mergedProspects ?? [],
    firstOrderDateByCustomerCode,
    monthStart,
    monthEndExclusive
  );

  const prospectIds = Array.from(new Set(
    mergedProspectsInMonth.map((row: any) => String(row.id)).filter(Boolean)
  ));
  const customerCodes = Array.from(new Set(
    mergedProspectsInMonth.map((row: any) => String(row.merged_customer_code)).filter(Boolean)
  ));

  const rows: DealRow[] = [];

  if (prospectIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('deals')
      .select(DEAL_CLOSE_SELECT)
      .in('prospect_customer_id', prospectIds)
      .order('deal_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    rows.push(...((data ?? []) as DealRow[]));
  }

  if (customerCodes.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('deals')
      .select(DEAL_CLOSE_SELECT)
      .in('customer_code', customerCodes)
      .order('deal_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    rows.push(...((data ?? []) as DealRow[]));
  }

  const uniqueRows = new Map<string, DealRow>();
  for (const row of rows) {
    uniqueRows.set(row.id, row);
  }

  return Array.from(uniqueRows.values());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireDashboardAccess(profile, res)) return;

    if (profile.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const month = parseMonth(req.body?.month);
    if (!month) {
      return res.status(400).json({ error: 'valid month is required' });
    }

    const monthStart = `${month}-01`;
    const nextMonthDate = new Date(`${monthStart}T00:00:00`);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const monthEndExclusive = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`;

    let error: any = null;

    if (req.method === 'POST') {
      const { data: rows, error: rowsError } = await supabaseAdmin
        .from('deals')
        .select(DEAL_CLOSE_SELECT)
        .gte('deal_date', monthStart)
        .lt('deal_date', monthEndExclusive)
        .order('deal_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (rowsError) {
        console.error('deal board close month rows error:', rowsError);
        return res.status(500).json({ error: 'deal board close month rows fetch failed' });
      }

      const latestByClinic = new Map<string, DealRow>();
      for (const row of (rows ?? []) as DealRow[]) {
        const key = resolveClinicKey(row);
        const current = latestByClinic.get(key);
        if (!current || compareDeals(row, current) < 0) {
          latestByClinic.set(key, row);
        }
      }

      try {
        const mergedMonthRows = await fetchMergedProspectDealsInMonth(monthStart, monthEndExclusive);
        for (const row of mergedMonthRows) {
          const key = resolveClinicKey(row);
          const current = latestByClinic.get(key);
          if (!current || compareDeals(row, current) < 0) {
            latestByClinic.set(key, row);
          }
        }
      } catch (mergedMonthError) {
        console.error('deal board close month merged month deals error:', mergedMonthError);
        return res.status(500).json({ error: 'deal board close month merged deals fetch failed' });
      }

      const snapshotRows = Array.from(latestByClinic.entries()).map(([clinicKey, row]) => ({
        clinic_key: clinicKey,
        month_start: monthStart,
        base_deal_id: row.id,
        pipeline_stage: resolvePipelineStage(row),
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }));

      const { data: currentMonthStates, error: currentMonthStatesError } = await supabaseAdmin
        .from('deal_board_states')
        .select('clinic_key, month_start, base_deal_id, pipeline_stage')
        .eq('month_start', monthStart);

      if (currentMonthStatesError) {
        console.error('deal board close month current states error:', currentMonthStatesError);
        return res.status(500).json({ error: 'deal board current states fetch failed' });
      }

      const snapshotMap = new Map(snapshotRows.map((row) => [row.clinic_key, row]));
      for (const state of currentMonthStates ?? []) {
        if (snapshotMap.has(String(state.clinic_key))) {
          continue;
        }

        snapshotMap.set(String(state.clinic_key), {
          clinic_key: String(state.clinic_key),
          month_start: monthStart,
          base_deal_id: String(state.base_deal_id),
          pipeline_stage: state.pipeline_stage,
          updated_by: profile.id,
          updated_at: new Date().toISOString(),
        });
      }

      const mergedSnapshotRows = Array.from(snapshotMap.values());

      const { error: resetMergedSnapshotsError } = await supabaseAdmin
        .from('deal_board_states')
        .delete()
        .eq('month_start', monthStart);

      if (resetMergedSnapshotsError) {
        console.error('deal board close month merged snapshot reset error:', resetMergedSnapshotsError);
        return res.status(500).json({ error: 'deal board merged snapshot reset failed' });
      }

      if (mergedSnapshotRows.length > 0) {
        const { error: mergedSnapshotInsertError } = await supabaseAdmin
          .from('deal_board_states')
          .insert(mergedSnapshotRows);

        if (mergedSnapshotInsertError) {
          console.error('deal board close month merged snapshot insert error:', mergedSnapshotInsertError);
          return res.status(500).json({ error: 'deal board merged snapshot insert failed' });
        }
      }

      const { error: closeError } = await supabaseAdmin
        .from('deal_board_month_closures')
        .upsert({
          month_start: monthStart,
          closed_at: new Date().toISOString(),
          closed_by: profile.id,
        });

      error = closeError;
    } else {
      const { error: deleteStatesError } = await supabaseAdmin
        .from('deal_board_states')
        .delete()
        .eq('month_start', monthStart);

      if (deleteStatesError) {
        console.error('deal board reopen month delete snapshot error:', deleteStatesError);
        return res.status(500).json({ error: 'deal board snapshot delete failed' });
      }

      const { error: reopenError } = await supabaseAdmin
        .from('deal_board_month_closures')
        .delete()
        .eq('month_start', monthStart);

      error = reopenError;
    }

    if (error) {
      console.error('deal board close month error:', error);
      return res.status(500).json({ error: req.method === 'POST' ? 'deal board close month failed' : 'deal board reopen month failed' });
    }

    return res.status(200).json({ ok: true, month, is_closed: req.method === 'POST' });
  } catch (error) {
    console.error('deal board close month unexpected error:', error);
    return res.status(500).json({ error: req.method === 'POST' ? 'deal board close month api failed' : 'deal board reopen month api failed' });
  }
}
