import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { toDateString } from '../../lib/dateUtils.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../../api/_lib/auth.js';
import { fetchFirstOrderDateByCustomerCode, filterMergedProspectsByFirstOrderDate } from '../../../api/_lib/newOrderDates.js';
import { detectExistingDealWins } from '../../../api/_lib/existingDealWins.js';

type PerformancePeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

type DealPipelineStage = 'targeting' | 'visiting' | 'negotiating' | 'accepted' | 'won' | 'lost';

type DealRow = {
  id: string;
  user_id: string;
  customer_code: string | null;
  prospect_customer_id: string | null;
  deal_date: string;
  pipeline_stage: DealPipelineStage | null;
  executed_action_type: string | null;
  deal_temperature: string | null;
  next_action_date: string | null;
  next_action_type: string | null;
  prospect_customers?: {
    status?: string | null;
    merged_customer_code?: string | null;
  } | null;
};

type ProfileRow = {
  id: string;
  name: string;
  department_id: number | null;
  last_login_at?: string | null;
  login_count?: number | null;
  departments?: { name?: string | null } | null;
};
type LoginEventRow = {
  user_id: string;
};
type DealPageViewRow = {
  viewer_user_id: string;
};
const EXCLUDED_DASHBOARD_DEPARTMENTS = new Set(['管理部']);

function parseDepartmentId(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePeriod(value: unknown): PerformancePeriod {
  return value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'custom'
    ? value
    : 'monthly';
}

function getDateRange(period: PerformancePeriod, fromParam?: string, toParam?: string) {
  if (fromParam && toParam) {
    const start = new Date(fromParam);
    const endExclusive = new Date(toParam);
    endExclusive.setDate(endExclusive.getDate() + 1);

    return {
      from: toDateString(start),
      toExclusive: toDateString(endExclusive),
    };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'daily') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      from: toDateString(today),
      toExclusive: toDateString(tomorrow),
    };
  }

  if (period === 'weekly') {
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(today);
    start.setDate(start.getDate() + diffToMonday);
    const endExclusive = new Date(start);
    endExclusive.setDate(endExclusive.getDate() + 7);

    return {
      from: toDateString(start),
      toExclusive: toDateString(endExclusive),
    };
  }

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  return {
    from: toDateString(monthStart),
    toExclusive: toDateString(nextMonth),
  };
}

function normalizeTemperature(value: string | null | undefined) {
  const raw = String(value ?? '').trim();
  if (!raw) return '未設定';
  return raw.charAt(0);
}

function parseCategoryFilter(...values: unknown[]) {
  const categories = values.flatMap((value) => {
    if (Array.isArray(value)) return value;
    return String(value ?? '').split(',');
  })
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  return categories.length > 0 ? new Set(categories) : undefined;
}

function resolveStage(row: DealRow): DealPipelineStage {
  const isMergedProspect = row.prospect_customer_id
    && row.prospect_customers?.status === 'merged'
    && row.prospect_customers?.merged_customer_code;

  if (isMergedProspect) {
    return 'won';
  }

  return (row.pipeline_stage ?? 'visiting') as DealPipelineStage;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireDashboardAccess(profile, res)) return;

    const period = parsePeriod(req.query.period);
    const userId = String(req.query.userId ?? '').trim();
    const departmentId = parseDepartmentId(req.query.departmentId);
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;
    const existingDealWinCategories = parseCategoryFilter(
      req.query.existingDealWinCategories,
      req.query.existing_deal_win_categories,
      req.query.proposal_category
    );
    const { from, toExclusive } = getDateRange(period, fromParam, toParam);

    const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, department_id, last_login_at, login_count, departments(name)')
      .order('name', { ascending: true });

    if (profilesError) {
      console.error('sales performance profiles error:', profilesError);
      return res.status(500).json({ error: 'sales performance profiles fetch failed' });
    }

    const users = ((profilesData ?? []) as ProfileRow[]).filter(
      (row) => !EXCLUDED_DASHBOARD_DEPARTMENTS.has(row.departments?.name ?? '')
    );
    const filteredUsers = users.filter((row) => {
      if (departmentId !== null && row.department_id !== departmentId) {
        return false;
      }

      if (userId && row.id !== userId) {
        return false;
      }

      return true;
    });

    const allowedUserIds = new Set(filteredUsers.map((row) => row.id));
    const allowedUserIdList = Array.from(allowedUserIds);

    let loginEventsData: LoginEventRow[] = [];
    let dealPageViewsData: DealPageViewRow[] = [];

    if (allowedUserIdList.length > 0) {
      const [loginEventsResult, dealPageViewsResult] = await Promise.all([
        supabaseAdmin
          .from('login_events')
          .select('user_id')
          .gte('logged_in_at', from)
          .lt('logged_in_at', toExclusive)
          .in('user_id', allowedUserIdList),
        supabaseAdmin
          .from('deal_page_views')
          .select('viewer_user_id')
          .gte('viewed_at', from)
          .lt('viewed_at', toExclusive)
          .in('viewer_user_id', allowedUserIdList),
      ]);

      if (loginEventsResult.error) {
        console.error('sales performance login events error:', loginEventsResult.error);
        return res.status(500).json({ error: 'sales performance login events fetch failed' });
      }

      if (dealPageViewsResult.error) {
        console.error('sales performance deal page views error:', dealPageViewsResult.error);
        return res.status(500).json({ error: 'sales performance deal page views fetch failed' });
      }

      loginEventsData = (loginEventsResult.data ?? []) as LoginEventRow[];
      dealPageViewsData = (dealPageViewsResult.data ?? []) as DealPageViewRow[];
    }

    let dealsQuery = supabaseAdmin
      .from('deals')
      .select(`
        id,
        user_id,
        customer_code,
        prospect_customer_id,
        deal_date,
        pipeline_stage,
        executed_action_type,
        deal_temperature,
        next_action_date,
        next_action_type,
        prospect_customers(status, merged_customer_code)
      `)
      .gte('deal_date', from)
      .lt('deal_date', toExclusive)
      .order('deal_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (userId) {
      dealsQuery = dealsQuery.eq('user_id', userId);
    }

    const { data: dealsData, error: dealsError } = await dealsQuery;
    if (dealsError) {
      console.error('sales performance deals error:', dealsError);
      return res.status(500).json({ error: 'sales performance deals fetch failed' });
    }

    let mergedProspectsQuery = supabaseAdmin
      .from('prospect_customers')
      .select('id, created_by, merged_at, merged_customer_code')
      .eq('status', 'merged')
      .not('merged_customer_code', 'is', null);

    if (userId) {
      mergedProspectsQuery = mergedProspectsQuery.eq('created_by', userId);
    }

    const { data: mergedProspects, error: mergedProspectsError } = await mergedProspectsQuery;
    if (mergedProspectsError) {
      console.error('sales performance merged prospects error:', mergedProspectsError);
      return res.status(500).json({ error: 'sales performance merged prospects fetch failed' });
    }

    const scopedDeals = ((dealsData ?? []) as DealRow[]).filter((row) => allowedUserIds.has(row.user_id));
    const scopedMergedProspectsByOwner = (mergedProspects ?? []).filter((row: any) => allowedUserIds.has(row.created_by));
    const firstOrderDateByCustomerCode = await fetchFirstOrderDateByCustomerCode(
      scopedMergedProspectsByOwner.map((row: any) => row.merged_customer_code).filter(Boolean)
    );
    const scopedMergedProspects = filterMergedProspectsByFirstOrderDate(
      scopedMergedProspectsByOwner,
      firstOrderDateByCustomerCode,
      from,
      toExclusive
    );
    const existingDealWins = await detectExistingDealWins({
      startDate: from,
      endExclusiveDate: toExclusive,
      allowedUserIds,
      proposalCategories: existingDealWinCategories,
    });

    const userMap = new Map(
      users.map((row) => [
        row.id,
        {
          name: row.name ?? '未設定',
          department_id: row.department_id ?? null,
          department: row.departments?.name ?? '',
        },
      ])
    );

    const rankingMap = new Map<string, {
      user_id: string;
      name: string;
      department: string;
      total_count: number;
      new_count: number;
      existing_count: number;
      won_count: number;
    }>();

    for (const row of filteredUsers) {
      rankingMap.set(row.id, {
        user_id: row.id,
        name: row.name ?? '未設定',
        department: row.departments?.name ?? '',
        total_count: 0,
        new_count: 0,
        existing_count: 0,
        won_count: 0,
      });
    }

    const stageCounts = new Map<DealPipelineStage, number>();
    const temperatureCounts = new Map<string, number>();
    const actionCounts = new Map<string, number>();

    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let overdueNextActions = 0;
    let upcomingNextActions = 0;

    for (const row of scopedDeals) {
      const owner = userMap.get(row.user_id);
      const rankingRow = rankingMap.get(row.user_id) ?? {
        user_id: row.user_id,
        name: owner?.name ?? '未設定',
        department: owner?.department ?? '',
        total_count: 0,
        new_count: 0,
        existing_count: 0,
        won_count: 0,
      };

      rankingRow.total_count += 1;
      if (row.prospect_customer_id) {
        rankingRow.new_count += 1;
      } else {
        rankingRow.existing_count += 1;
      }

      const stage = resolveStage(row);
      stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);

      const temperature = normalizeTemperature(row.deal_temperature);
      temperatureCounts.set(temperature, (temperatureCounts.get(temperature) ?? 0) + 1);

      const action = row.executed_action_type ?? '未設定';
      actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);

      if (row.next_action_date && stage !== 'won' && stage !== 'lost') {
        const nextDate = new Date(row.next_action_date);
        const normalized = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
        const diffDays = Math.floor((normalized.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
          overdueNextActions += 1;
        } else if (diffDays <= 7) {
          upcomingNextActions += 1;
        }
      }

      rankingMap.set(row.user_id, rankingRow);
    }

    for (const row of scopedMergedProspects) {
      const owner = userMap.get(row.created_by);
      const rankingRow = rankingMap.get(row.created_by) ?? {
        user_id: row.created_by,
        name: owner?.name ?? '未設定',
        department: owner?.department ?? '',
        total_count: 0,
        new_count: 0,
        existing_count: 0,
        won_count: 0,
      };

      rankingRow.won_count += 1;
      rankingMap.set(row.created_by, rankingRow);
    }

    for (const row of existingDealWins) {
      const owner = userMap.get(row.user_id);
      const rankingRow = rankingMap.get(row.user_id) ?? {
        user_id: row.user_id,
        name: owner?.name ?? '未設定',
        department: owner?.department ?? '',
        total_count: 0,
        new_count: 0,
        existing_count: 0,
        won_count: 0,
      };

      rankingRow.won_count += 1;
      rankingMap.set(row.user_id, rankingRow);
    }

    const rankings = Array.from(rankingMap.values())
      .sort((left, right) => {
        if (right.total_count !== left.total_count) {
          return right.total_count - left.total_count;
        }

        if (right.won_count !== left.won_count) {
          return right.won_count - left.won_count;
        }

        return left.name.localeCompare(right.name, 'ja');
      });

    const totalDeals = scopedDeals.length;
    const totalNewDeals = scopedDeals.filter((row) => row.prospect_customer_id).length;
    const totalExistingDeals = scopedDeals.filter((row) => !row.prospect_customer_id).length;
    const newWonCount = scopedMergedProspects.length;
    const existingWonCount = existingDealWins.length;
    const totalWonCount = newWonCount + existingWonCount;

    const temperaturePortfolio = Array.from(temperatureCounts.entries())
      .map(([key, count]) => ({ key, label: key, count }))
      .sort((left, right) => left.key.localeCompare(right.key));

    const phaseDistribution = Array.from(stageCounts.entries()).map(([key, count]) => ({
      key,
      label: key === 'targeting'
        ? 'ターゲティング'
        : key === 'visiting'
          ? '訪問中'
          : key === 'negotiating'
            ? '交渉中'
            : key === 'accepted'
              ? '応諾済み'
              : key === 'won'
                ? '受注'
                : '失注',
      count,
    }));

    const actionDistribution = Array.from(actionCounts.entries()).map(([key, count]) => ({
      label: key,
      count,
    }));

    const loginCountMap = new Map<string, number>();
    for (const row of loginEventsData) {
      loginCountMap.set(row.user_id, (loginCountMap.get(row.user_id) ?? 0) + 1);
    }

    const dealViewCountMap = new Map<string, number>();
    for (const row of dealPageViewsData) {
      dealViewCountMap.set(row.viewer_user_id, (dealViewCountMap.get(row.viewer_user_id) ?? 0) + 1);
    }

    const usageMembers = filteredUsers.map((row) => ({
      user_id: row.id,
      name: row.name ?? '未設定',
      department: row.departments?.name ?? '',
      last_login_at: row.last_login_at ?? null,
      login_count: loginCountMap.get(row.id) ?? 0,
      deal_view_count: dealViewCountMap.get(row.id) ?? 0,
    }));

    return res.status(200).json({
      period,
      from,
      to: toDateString(new Date(new Date(toExclusive).getTime() - 1000 * 60 * 60 * 24)),
      summary: {
        total_deals: totalDeals,
        new_deals: totalNewDeals,
        existing_deals: totalExistingDeals,
        total_won: totalWonCount,
        new_won: newWonCount,
        existing_won: existingWonCount,
        overdue_next_actions: overdueNextActions,
        upcoming_next_actions: upcomingNextActions,
      },
      rankings,
      usage_members: usageMembers,
      temperature_portfolio: temperaturePortfolio,
      phase_distribution: phaseDistribution,
      action_distribution: actionDistribution,
    });
  } catch (error) {
    console.error('sales performance api unexpected error:', error);
    return res.status(500).json({ error: 'sales performance api failed' });
  }
}
