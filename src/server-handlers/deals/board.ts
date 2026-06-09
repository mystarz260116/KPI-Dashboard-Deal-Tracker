import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile } from '../../../api/_lib/auth.js';
import { fetchFirstOrderDateByCustomerCode, filterMergedProspectsByFirstOrderDate } from '../../../api/_lib/newOrderDates.js';

type DealPipelineStage = 'targeting' | 'visiting' | 'negotiating' | 'accepted' | 'won' | 'lost';
type DealLifecycle = 'all' | 'new' | 'existing';

type DealRow = {
  id: string;
  user_id: string;
  customer_code: string | null;
  prospect_customer_id: string | null;
  deal_date: string;
  pipeline_stage: DealPipelineStage | null;
  product_name: string | null;
  notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
  next_action_type: string | null;
  contact_role: string | null;
  decision_maker_contact: string | null;
  proposal_category: string | null;
  proposal_categories: string[] | null;
  expected_monthly_amounts: Record<string, number> | null;
  amount: number | null;
  deal_temperature: string | null;
  created_at: string;
  customers?: { name?: string | null } | null;
  prospect_customers?: {
    name?: string | null;
    status?: string | null;
    merged_customer_code?: string | null;
  } | null;
  profiles?: {
    name?: string | null;
    department_id?: number | null;
  } | Array<{
    name?: string | null;
    department_id?: number | null;
  }> | null;
};

type DealBoardStateRow = {
  clinic_key: string;
  month_start: string;
  base_deal_id: string;
  pipeline_stage: DealPipelineStage;
};

type BoardDeal = ReturnType<typeof mapBoardDeal>;

const DEAL_BOARD_SELECT = `
  id,
  user_id,
  customer_code,
  prospect_customer_id,
  deal_date,
  pipeline_stage,
  product_name,
  notes,
  next_action,
  next_action_date,
  next_action_type,
  contact_role,
  decision_maker_contact,
  proposal_category,
  proposal_categories,
  expected_monthly_amounts,
  amount,
  deal_temperature,
  created_at,
  customers(name),
  prospect_customers(name, status, merged_customer_code),
  profiles!deals_user_id_fkey(name, department_id)
`;

function parseMonth(value: unknown) {
  const raw = String(value ?? '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) {
    return raw;
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
  const endDate = new Date(year, monthNumber, 1);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, end };
}

function parseLifecycle(value: unknown): DealLifecycle {
  return value === 'new' || value === 'existing' ? value : 'all';
}

function parseDepartmentId(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
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

function resolvePipelineStage(row: DealRow): DealPipelineStage {
  const isMergedProspect = row.prospect_customers?.status === 'merged' && row.prospect_customers?.merged_customer_code;
  if (isMergedProspect) {
    return 'won';
  }

  return (row.pipeline_stage ?? 'visiting') as DealPipelineStage;
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

function toMonthString(dateValue: string) {
  return dateValue.slice(0, 7);
}

function shiftMonth(month: string, diff: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(year, monthNumber - 1 + diff, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isTerminalStage(stage: DealPipelineStage) {
  return stage === 'won' || stage === 'lost';
}

async function fetchMergedProspectDealsInMonth(start: string, end: string) {
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
    start,
    end
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
      .select(DEAL_BOARD_SELECT)
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
      .select(DEAL_BOARD_SELECT)
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

async function fetchMergedCustomerNameMap(rows: DealRow[]) {
  const mergedCustomerCodes = Array.from(new Set(
    rows
      .map((row) => row.prospect_customers?.merged_customer_code)
      .filter((value): value is string => Boolean(value))
  ));

  const mergedCustomerNameMap = new Map<string, string>();
  if (mergedCustomerCodes.length === 0) {
    return mergedCustomerNameMap;
  }

  const { data: mergedCustomers, error } = await supabaseAdmin
    .from('customers')
    .select('code, name')
    .in('code', mergedCustomerCodes);

  if (error) {
    throw error;
  }

  for (const customer of mergedCustomers ?? []) {
    mergedCustomerNameMap.set(customer.code, customer.name);
  }

  return mergedCustomerNameMap;
}

function mapBoardDeal(row: DealRow, mergedCustomerNameMap: Map<string, string>, pipelineStage: DealPipelineStage) {
  const lifecycleType: DealLifecycle = row.prospect_customer_id ? 'new' : 'existing';
  const assignedProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  const mergedCustomerCode = row.prospect_customers?.merged_customer_code ?? null;
  const isMergedProspect = row.prospect_customers?.status === 'merged' && mergedCustomerCode;
  const clinicName = row.customers?.name
    ?? (mergedCustomerCode ? mergedCustomerNameMap.get(mergedCustomerCode) : null)
    ?? row.prospect_customers?.name
    ?? row.customer_code
    ?? mergedCustomerCode
    ?? row.prospect_customer_id
    ?? '未設定';

  return {
    id: row.id,
    user_id: row.user_id,
    user_name: assignedProfile?.name ?? '',
    department_id: assignedProfile?.department_id ?? null,
    clinic_name: clinicName,
    clinic_kind: isMergedProspect ? 'customer' : (row.prospect_customer_id ? 'prospect' : 'customer'),
    clinic_id: row.customer_code ?? mergedCustomerCode ?? row.prospect_customer_id ?? '',
    lifecycle: lifecycleType,
    deal_date: row.deal_date,
    pipeline_stage: pipelineStage,
    product_name: row.product_name ?? null,
    notes: row.notes ?? null,
    next_action: row.next_action ?? null,
    next_action_date: row.next_action_date ?? null,
    next_action_type: row.next_action_type ?? null,
    contact_role: row.contact_role ?? null,
    decision_maker_contact: row.decision_maker_contact ?? null,
    proposal_category: row.proposal_category ?? null,
    proposal_categories: Array.isArray(row.proposal_categories) ? row.proposal_categories : [],
    expected_monthly_amounts: row.expected_monthly_amounts ?? null,
    amount: row.amount ?? null,
    deal_temperature: row.deal_temperature ?? null,
    source_month: toMonthString(row.deal_date),
    is_carried_over: false,
  };
}

function matchesFilters(
  deal: BoardDeal,
  lifecycle: DealLifecycle,
  userId: string,
  departmentId: number | null
) {
  if (lifecycle !== 'all' && deal.lifecycle !== lifecycle) {
    return false;
  }

  if (userId && deal.user_id !== userId) {
    return false;
  }

  if (departmentId !== null && deal.department_id !== departmentId) {
    return false;
  }

  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;

    const month = parseMonth(req.query.month);
    const { start, end } = getMonthRange(month);
    const lifecycle = parseLifecycle(req.query.lifecycle);
    const userId = String(req.query.userId ?? '').trim();
    const departmentId = parseDepartmentId(req.query.departmentId);
    const monthStart = `${month}-01`;

    const { data: closure, error: closureError } = await supabaseAdmin
      .from('deal_board_month_closures')
      .select('month_start')
      .eq('month_start', monthStart)
      .maybeSingle();

    if (closureError) {
      console.error('deals board closure error:', closureError);
      return res.status(500).json({ error: 'deal board closure fetch failed' });
    }

    const isClosed = Boolean(closure);

    if (isClosed) {
      const { data: snapshotRows, error: snapshotError } = await supabaseAdmin
        .from('deal_board_states')
        .select('clinic_key, month_start, base_deal_id, pipeline_stage')
        .eq('month_start', monthStart);

      if (snapshotError) {
        console.error('deals board snapshot error:', snapshotError);
        return res.status(500).json({ error: 'deal board snapshot fetch failed' });
      }

      const baseDealIds = Array.from(new Set(
        (snapshotRows ?? []).map((row: any) => String(row.base_deal_id)).filter(Boolean)
      ));

      if (baseDealIds.length === 0) {
        return res.status(200).json({ month, lifecycle, is_closed: true, deals: [] });
      }

      const { data: dealRows, error: dealRowsError } = await supabaseAdmin
        .from('deals')
        .select(DEAL_BOARD_SELECT)
        .in('id', baseDealIds);

      if (dealRowsError) {
        console.error('deals board snapshot deal rows error:', dealRowsError);
        return res.status(500).json({ error: 'deal board snapshot deals fetch failed' });
      }

      const rowMap = new Map<string, DealRow>();
      for (const row of (dealRows ?? []) as DealRow[]) {
        rowMap.set(row.id, row);
      }

      const mergedCustomerNameMap = await fetchMergedCustomerNameMap((dealRows ?? []) as DealRow[]);

      const deals = (snapshotRows ?? [])
        .map((snapshot: any) => {
          const row = rowMap.get(String(snapshot.base_deal_id));
          if (!row) return null;
          return mapBoardDeal(row, mergedCustomerNameMap, snapshot.pipeline_stage as DealPipelineStage);
        })
        .filter(Boolean) as BoardDeal[];

      const snapshotClinicKeys = new Set((snapshotRows ?? []).map((snapshot: any) => String(snapshot.clinic_key)));

      try {
        const mergedMonthRows = await fetchMergedProspectDealsInMonth(start, end);
        const latestMergedByClinic = new Map<string, DealRow>();
        for (const row of mergedMonthRows) {
          const clinicKey = resolveClinicKey(row);
          if (snapshotClinicKeys.has(clinicKey)) {
            continue;
          }

          const current = latestMergedByClinic.get(clinicKey);
          if (!current || compareDeals(row, current) < 0) {
            latestMergedByClinic.set(clinicKey, row);
          }
        }

        const mergedRows = Array.from(latestMergedByClinic.values());
        const mergedMonthNameMap = await fetchMergedCustomerNameMap(mergedRows);
        for (const row of mergedRows) {
          deals.push(mapBoardDeal(row, mergedMonthNameMap, resolvePipelineStage(row)));
        }
      } catch (mergedMonthError) {
        console.error('deals board closed merged month deals error:', mergedMonthError);
        return res.status(500).json({ error: 'deal board closed merged month deals fetch failed' });
      }

      const filteredDeals = deals.filter((deal) => matchesFilters(deal, lifecycle, userId, departmentId));

      return res.status(200).json({
        month,
        lifecycle,
        is_closed: true,
        deals: filteredDeals,
      });
    }

    const { data: priorClosures, error: priorClosuresError } = await supabaseAdmin
      .from('deal_board_month_closures')
      .select('month_start')
      .lt('month_start', monthStart)
      .order('month_start', { ascending: false })
      .limit(1);

    if (priorClosuresError) {
      console.error('deals board prior closure error:', priorClosuresError);
      return res.status(500).json({ error: 'deal board prior closure fetch failed' });
    }

    const priorClosedMonthStart = priorClosures?.[0]?.month_start ? String(priorClosures[0].month_start) : null;
    const priorClosedMonth = priorClosedMonthStart ? priorClosedMonthStart.slice(0, 7) : null;

    const { data: currentMonthStates, error: currentMonthStatesError } = await supabaseAdmin
      .from('deal_board_states')
      .select('clinic_key, month_start, base_deal_id, pipeline_stage')
      .eq('month_start', monthStart);

    if (currentMonthStatesError) {
      console.error('deals board current month states error:', currentMonthStatesError);
      return res.status(500).json({ error: 'deal board current states fetch failed' });
    }

    const currentStateMap = new Map<string, DealBoardStateRow>();
    for (const row of (currentMonthStates ?? []) as DealBoardStateRow[]) {
      currentStateMap.set(row.clinic_key, row);
    }

    let query = supabaseAdmin
      .from('deals')
      .select(DEAL_BOARD_SELECT)
      .gte('deal_date', start)
      .lt('deal_date', end)
      .order('deal_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    if (lifecycle === 'new') {
      query = query.not('prospect_customer_id', 'is', null);
    }

    if (lifecycle === 'existing') {
      query = query.not('customer_code', 'is', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('deals board api error:', error);
      return res.status(500).json({ error: 'deals board fetch failed' });
    }

    const latestByClinic = new Map<string, DealRow>();
    for (const rawRow of (data ?? []) as DealRow[]) {
      const key = resolveClinicKey(rawRow);
      const current = latestByClinic.get(key);
      if (!current || compareDeals(rawRow, current) < 0) {
        latestByClinic.set(key, rawRow);
      }
    }

    try {
      const mergedMonthRows = await fetchMergedProspectDealsInMonth(start, end);
      for (const rawRow of mergedMonthRows) {
        const key = resolveClinicKey(rawRow);
        const current = latestByClinic.get(key);
        if (!current || compareDeals(rawRow, current) < 0) {
          latestByClinic.set(key, rawRow);
        }
      }
    } catch (mergedMonthError) {
      console.error('deals board merged month deals error:', mergedMonthError);
      return res.status(500).json({ error: 'deal board merged month deals fetch failed' });
    }

    const liveRows = Array.from(latestByClinic.values());
    const mergedCustomerNameMap = await fetchMergedCustomerNameMap(liveRows);
    const deals = liveRows.map((row) => {
      const clinicKey = resolveClinicKey(row);
      const overrideState = currentStateMap.get(clinicKey);
      const mapped = mapBoardDeal(
        row,
        mergedCustomerNameMap,
        overrideState?.pipeline_stage ?? resolvePipelineStage(row)
      );
      return {
        ...mapped,
        is_carried_over: false,
      };
    });

    if (priorClosedMonthStart && priorClosedMonth) {
      const { data: carryStates, error: carryStatesError } = await supabaseAdmin
        .from('deal_board_states')
        .select('clinic_key, month_start, base_deal_id, pipeline_stage')
        .eq('month_start', priorClosedMonthStart);

      if (carryStatesError) {
        console.error('deals board carry states error:', carryStatesError);
        return res.status(500).json({ error: 'deal board carry states fetch failed' });
      }

      const carryStatesList = (carryStates ?? []) as DealBoardStateRow[];
      const carryBaseDealIds = Array.from(new Set(carryStatesList.map((row) => row.base_deal_id).filter(Boolean)));

      if (carryBaseDealIds.length > 0) {
        const { data: carryDealRows, error: carryDealRowsError } = await supabaseAdmin
          .from('deals')
          .select(DEAL_BOARD_SELECT)
          .in('id', carryBaseDealIds);

        if (carryDealRowsError) {
          console.error('deals board carry deals error:', carryDealRowsError);
          return res.status(500).json({ error: 'deal board carry deals fetch failed' });
        }

        const carryRowMap = new Map<string, DealRow>();
        for (const row of (carryDealRows ?? []) as DealRow[]) {
          carryRowMap.set(row.id, row);
        }

        const carryMergedCustomerNameMap = await fetchMergedCustomerNameMap((carryDealRows ?? []) as DealRow[]);

        for (const snapshot of carryStatesList) {
          if (latestByClinic.has(snapshot.clinic_key)) {
            continue;
          }

          const row = carryRowMap.get(snapshot.base_deal_id);
          if (!row) {
            continue;
          }

          const currentMonthOverride = currentStateMap.get(snapshot.clinic_key)?.pipeline_stage;
          const baseStage = resolvePipelineStage(row);
          const effectiveStage = currentMonthOverride ?? (baseStage === 'won' ? 'won' : snapshot.pipeline_stage);

          if (!currentMonthOverride && (isTerminalStage(snapshot.pipeline_stage) || isTerminalStage(effectiveStage))) {
            continue;
          }

          const mapped = mapBoardDeal(row, carryMergedCustomerNameMap, effectiveStage);
      deals.push({
        ...mapped,
        is_carried_over: true,
        source_month: priorClosedMonth,
      });
        }
      }
    }

    return res.status(200).json({
      month,
      lifecycle,
      is_closed: false,
      deals: deals.filter((deal) => matchesFilters(deal, lifecycle, userId, departmentId)),
    });
  } catch (error) {
    console.error('deals board api unexpected error:', error);
    return res.status(500).json({ error: 'deals board api failed' });
  }
}
