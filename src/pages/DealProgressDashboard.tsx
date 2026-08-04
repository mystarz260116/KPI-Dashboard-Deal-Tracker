import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { authFetch } from '../lib/authFetch';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical, LayoutDashboard,
  Loader2, Lock, LogOut, Users,
} from 'lucide-react';

type DealPipelineStage = 'targeting' | 'visiting' | 'negotiating' | 'accepted' | 'won' | 'lost';
type EditableDealPipelineStage = Exclude<DealPipelineStage, 'won'>;
type DealLifecycle = 'all' | 'new' | 'existing';
type NextActionFilter = 'unregistered' | 'overdue';

type BoardDeal = {
  id: string;
  user_id: string;
  user_name: string;
  clinic_name: string;
  clinic_kind: 'customer' | 'prospect';
  clinic_id: string;
  lifecycle: DealLifecycle;
  deal_date: string;
  created_at: string;
  pipeline_stage: DealPipelineStage;
  product_name: string | null;
  notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
  next_action_type: string | null;
  contact_role: string | null;
  decision_maker_contact: string | null;
  proposal_category: string | null;
  proposal_categories: string[];
  expected_monthly_amounts: Record<string, number> | null;
  amount: number | null;
  deal_temperature: string | null;
  source_month: string;
  is_carried_over: boolean;
  has_later_deal: boolean;
};

type UserOption = {
  id: string;
  name: string;
  department_id: number | null;
  department: string;
};

type DepartmentOption = {
  id: number;
  name: string;
};

type TemperatureTone = {
  label: string;
  shortLabel: string;
  chipClassName: string;
  cardClassName: string;
  glowClassName: string;
  priority: number;
};

const COLUMNS: Array<{ key: DealPipelineStage; title: string; accent: string; bg: string; hint: string; editable: boolean }> = [
  { key: 'targeting', title: 'ターゲティング', accent: '#8b5cf6', bg: 'bg-violet-50', hint: '候補先の選定・情報整理段階', editable: true },
  { key: 'visiting', title: '訪問中', accent: '#f59e0b', bg: 'bg-amber-50', hint: '初回訪問や継続接触を進めている段階', editable: true },
  { key: 'negotiating', title: '交渉中', accent: '#06b6d4', bg: 'bg-cyan-50', hint: '提案・見積・具体相談が進んでいる段階', editable: true },
  { key: 'accepted', title: '応諾済み', accent: '#22c55e', bg: 'bg-lime-50', hint: '先方応諾済み。受注確認待ちの段階', editable: true },
  { key: 'won', title: '受注', accent: '#10b981', bg: 'bg-emerald-50', hint: '受注確認完了後に自動で移動', editable: false },
  { key: 'lost', title: '失注', accent: '#ef4444', bg: 'bg-rose-50', hint: '見送り・失注。担当者が手動で更新', editable: true },
];

const DEAL_STAGE_TEMPERATURE_WEIGHTS: Record<DealPipelineStage, Record<'A' | 'B' | 'C' | 'D' | 'E' | 'unset', number>> = {
  targeting: { A: 0.3, B: 0.2, C: 0.1, D: 0.05, E: 0, unset: 0.1 },
  visiting: { A: 0.5, B: 0.35, C: 0.2, D: 0.1, E: 0, unset: 0.2 },
  negotiating: { A: 0.8, B: 0.6, C: 0.4, D: 0.2, E: 0, unset: 0.4 },
  accepted: { A: 1, B: 1, C: 1, D: 1, E: 1, unset: 1 },
  won: { A: 1, B: 1, C: 1, D: 1, E: 1, unset: 1 },
  lost: { A: 0, B: 0, C: 0, D: 0, E: 0, unset: 0 },
};

const TEMPERATURE_TONES: Record<string, TemperatureTone> = {
  A: {
    label: 'A すぐ案件化',
    shortLabel: 'A',
    chipClassName: 'bg-violet-600 text-white',
    cardClassName: 'border-violet-200 bg-violet-50/70',
    glowClassName: 'from-violet-500 via-fuchsia-500 to-transparent',
    priority: 0,
  },
  'A すぐ案件化': {
    label: 'A すぐ案件化',
    shortLabel: 'A',
    chipClassName: 'bg-violet-600 text-white',
    cardClassName: 'border-violet-200 bg-violet-50/70',
    glowClassName: 'from-violet-500 via-fuchsia-500 to-transparent',
    priority: 0,
  },
  B: {
    label: 'B 見込みあり',
    shortLabel: 'B',
    chipClassName: 'bg-sky-600 text-white',
    cardClassName: 'border-sky-200 bg-sky-50/70',
    glowClassName: 'from-sky-500 via-cyan-400 to-transparent',
    priority: 1,
  },
  'B 見込みあり': {
    label: 'B 見込みあり',
    shortLabel: 'B',
    chipClassName: 'bg-sky-600 text-white',
    cardClassName: 'border-sky-200 bg-sky-50/70',
    glowClassName: 'from-sky-500 via-cyan-400 to-transparent',
    priority: 1,
  },
  C: {
    label: 'C 長期フォロー',
    shortLabel: 'C',
    chipClassName: 'bg-zinc-100 text-zinc-600',
    cardClassName: 'border-zinc-200 bg-white',
    glowClassName: 'from-zinc-200 via-zinc-100 to-transparent',
    priority: 2,
  },
  'C 長期フォロー': {
    label: 'C 長期フォロー',
    shortLabel: 'C',
    chipClassName: 'bg-zinc-100 text-zinc-600',
    cardClassName: 'border-zinc-200 bg-white',
    glowClassName: 'from-zinc-200 via-zinc-100 to-transparent',
    priority: 2,
  },
  D: {
    label: 'D 可能性低い',
    shortLabel: 'D',
    chipClassName: 'bg-amber-50 text-amber-300',
    cardClassName: 'border-amber-50/40 bg-white',
    glowClassName: 'from-amber-50 via-transparent to-transparent',
    priority: 3,
  },
  'D 可能性低い': {
    label: 'D 可能性低い',
    shortLabel: 'D',
    chipClassName: 'bg-amber-50 text-amber-300',
    cardClassName: 'border-amber-50/40 bg-white',
    glowClassName: 'from-amber-50 via-transparent to-transparent',
    priority: 3,
  },
  E: {
    label: 'E 失注・拒否',
    shortLabel: 'E',
    chipClassName: 'bg-rose-100 text-rose-700',
    cardClassName: 'border-rose-100 bg-white',
    glowClassName: 'from-rose-200 via-rose-100 to-transparent',
    priority: 4,
  },
  'E 失注・拒否': {
    label: 'E 失注・拒否',
    shortLabel: 'E',
    chipClassName: 'bg-rose-100 text-rose-700',
    cardClassName: 'border-rose-100 bg-white',
    glowClassName: 'from-rose-200 via-rose-100 to-transparent',
    priority: 4,
  },
  'E 失注・拒否 ': {
    label: 'E 失注・拒否',
    shortLabel: 'E',
    chipClassName: 'bg-rose-100 text-rose-700',
    cardClassName: 'border-rose-100 bg-white',
    glowClassName: 'from-rose-200 via-rose-100 to-transparent',
    priority: 4,
  },
};

const DEFAULT_TEMPERATURE_TONE: TemperatureTone = {
  label: '商談温度未設定',
  shortLabel: '未設定',
  chipClassName: 'bg-zinc-200 text-zinc-700',
  cardClassName: 'border-zinc-200 bg-white',
  glowClassName: 'from-zinc-300 via-zinc-200 to-transparent',
  priority: 99,
};

const TEMPERATURE_FILTER_OPTIONS = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
  { value: 'D', label: 'D' },
  { value: 'E', label: 'E' },
] as const;

const PROGRESS_FILTER_STORAGE_KEY = 'dealProgressDashboardFilters';
const TEMPERATURE_FILTER_VALUES = new Set<string>(TEMPERATURE_FILTER_OPTIONS.map((option) => option.value));
const LIFECYCLE_VALUES = new Set<DealLifecycle>(['all', 'new', 'existing']);
const NEXT_ACTION_FILTER_VALUES = new Set<NextActionFilter>(['unregistered', 'overdue']);

type ProgressFilters = {
  month: string;
  lifecycle: DealLifecycle;
  selectedUserId: string;
  selectedDepartmentId: string;
  selectedTemperatures: string[];
  selectedNextActionFilters: NextActionFilter[];
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(value: string, diff: number) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1 + diff, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split('-');
  return `${year}年${Number(month)}月`;
}

function getTemperatureTone(temperature: string | null) {
  if (!temperature) {
    return DEFAULT_TEMPERATURE_TONE;
  }

  return TEMPERATURE_TONES[temperature] ?? DEFAULT_TEMPERATURE_TONE;
}

function normalizeTemperatureKey(temperature: string | null): 'A' | 'B' | 'C' | 'D' | 'E' | 'unset' {
  const key = (temperature ?? '').trim().charAt(0).toUpperCase();
  return TEMPERATURE_FILTER_VALUES.has(key) ? key as 'A' | 'B' | 'C' | 'D' | 'E' : 'unset';
}

function getDealAmount(deal: BoardDeal) {
  const amount = Number(deal.amount);
  return Number.isFinite(amount) ? amount : 0;
}

function getDealWeight(deal: BoardDeal) {
  return DEAL_STAGE_TEMPERATURE_WEIGHTS[deal.pipeline_stage][normalizeTemperatureKey(deal.deal_temperature)];
}

function getWeightedDealAmount(deal: BoardDeal) {
  return Math.round(getDealAmount(deal) * getDealWeight(deal));
}

function normalizeMonth(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : currentMonth();
}

function normalizeLifecycle(value: string | null | undefined): DealLifecycle {
  return value && LIFECYCLE_VALUES.has(value as DealLifecycle) ? value as DealLifecycle : 'all';
}

function normalizeTemperatures(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim().charAt(0).toUpperCase())
    .filter((entry, index, entries) => TEMPERATURE_FILTER_VALUES.has(entry) && entries.indexOf(entry) === index);
}

function normalizeNextActionFilters(value: string | null | undefined): NextActionFilter[] {
  if (!value) return [];

  return value
    .split(',')
    .map((entry) => entry.trim() as NextActionFilter)
    .filter((entry, index, entries) => NEXT_ACTION_FILTER_VALUES.has(entry) && entries.indexOf(entry) === index);
}

function readStoredProgressFilters(): Partial<ProgressFilters> {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.sessionStorage.getItem(PROGRESS_FILTER_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Partial<ProgressFilters> & { nextActionFilter?: string };
    return {
      month: parsed.month ? normalizeMonth(parsed.month) : undefined,
      lifecycle: parsed.lifecycle ? normalizeLifecycle(parsed.lifecycle) : undefined,
      selectedUserId: typeof parsed.selectedUserId === 'string' ? parsed.selectedUserId : undefined,
      selectedDepartmentId: typeof parsed.selectedDepartmentId === 'string' ? parsed.selectedDepartmentId : undefined,
      selectedTemperatures: Array.isArray(parsed.selectedTemperatures)
        ? parsed.selectedTemperatures.filter((entry) => TEMPERATURE_FILTER_VALUES.has(entry))
        : undefined,
      selectedNextActionFilters: Array.isArray(parsed.selectedNextActionFilters)
        ? parsed.selectedNextActionFilters.filter((entry) => NEXT_ACTION_FILTER_VALUES.has(entry))
        : parsed.nextActionFilter
          ? normalizeNextActionFilters(parsed.nextActionFilter)
          : undefined,
    };
  } catch {
    return {};
  }
}

function getInitialProgressFilters(): ProgressFilters {
  const storedFilters = readStoredProgressFilters();
  const searchParams = typeof window === 'undefined'
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search);

  return {
    month: searchParams.has('month') ? normalizeMonth(searchParams.get('month')) : storedFilters.month ?? currentMonth(),
    lifecycle: searchParams.has('lifecycle') ? normalizeLifecycle(searchParams.get('lifecycle')) : storedFilters.lifecycle ?? 'all',
    selectedUserId: searchParams.has('userId') ? searchParams.get('userId') ?? '' : storedFilters.selectedUserId ?? '',
    selectedDepartmentId: searchParams.has('departmentId') ? searchParams.get('departmentId') ?? '' : storedFilters.selectedDepartmentId ?? '',
    selectedTemperatures: searchParams.has('temperatures')
      ? normalizeTemperatures(searchParams.get('temperatures'))
      : storedFilters.selectedTemperatures ?? [],
    selectedNextActionFilters: searchParams.has('nextAction')
      ? normalizeNextActionFilters(searchParams.get('nextAction'))
      : storedFilters.selectedNextActionFilters ?? [],
  };
}

function buildProgressFilterSearch(filters: ProgressFilters) {
  const params = new URLSearchParams();
  params.set('month', filters.month);

  if (filters.lifecycle !== 'all') {
    params.set('lifecycle', filters.lifecycle);
  }

  if (filters.selectedUserId) {
    params.set('userId', filters.selectedUserId);
  }

  if (filters.selectedDepartmentId) {
    params.set('departmentId', filters.selectedDepartmentId);
  }

  if (filters.selectedTemperatures.length > 0) {
    params.set('temperatures', filters.selectedTemperatures.join(','));
  }

  if (filters.selectedNextActionFilters.length > 0) {
    params.set('nextAction', filters.selectedNextActionFilters.join(','));
  }

  return params.toString();
}

function buildNextActionParts(deal: BoardDeal) {
  if (!deal.next_action) {
    return { action: '次アクション未設定', date: '' };
  }

  const datePattern = deal.next_action_date
    ? new RegExp(`（${deal.next_action_date}）|\\(${deal.next_action_date}\\)|・\\s*${deal.next_action_date}|·\\s*${deal.next_action_date}`)
    : null;
  const action = datePattern
    ? deal.next_action.replace(datePattern, '').trim()
    : deal.next_action.trim();

  if (!deal.next_action_date) {
    return { action, date: '' };
  }

  return { action: action || deal.next_action, date: deal.next_action_date };
}

function parseExpectedAmountNotes(notes: string | null) {
  if (!notes) {
    return { amountLines: [] as string[], cleanNotes: '' };
  }

  const lines = notes.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() === '【受注予定額/月】');

  if (headerIndex === -1) {
    return { amountLines: [] as string[], cleanNotes: notes.trim() };
  }

  const amountLines: string[] = [];
  let endIndex = lines.length;

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line) {
      endIndex = index + 1;
      break;
    }

    if (line.startsWith('合計：')) {
      endIndex = index + 1;
      break;
    }

    amountLines.push(line);
  }

  const cleanNotes = [
    ...lines.slice(0, headerIndex),
    ...lines.slice(endIndex),
  ].join('\n').trim();

  return { amountLines, cleanNotes };
}

function buildExpectedAmountLines(deal: BoardDeal) {
  if (deal.expected_monthly_amounts && typeof deal.expected_monthly_amounts === 'object') {
    const lines = Object.entries(deal.expected_monthly_amounts)
      .filter(([, amount]) => Number.isFinite(Number(amount)))
      .map(([category, amount]) => `${category}：¥${Number(amount).toLocaleString()}`);

    if (lines.length > 0) {
      return lines;
    }
  }

  return parseExpectedAmountNotes(deal.notes).amountLines;
}

export default function DealProgressDashboard() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const initialFilters = useMemo(getInitialProgressFilters, []);
  const homePath = user?.can_view_dashboard ? '/dashboard' : '/deals/new';
  const homeLabel = user?.can_view_dashboard ? 'ダッシュボード' : '商談入力';
  const isRestrictedUser = Boolean(user && user.role !== 'admin' && !user.can_view_dashboard);

  const [month, setMonth] = useState(initialFilters.month);
  const [lifecycle, setLifecycle] = useState<DealLifecycle>(initialFilters.lifecycle);
  const [selectedUserId, setSelectedUserId] = useState(initialFilters.selectedUserId);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(initialFilters.selectedDepartmentId);
  const [selectedTemperatures, setSelectedTemperatures] = useState<string[]>(initialFilters.selectedTemperatures);
  const [selectedNextActionFilters, setSelectedNextActionFilters] = useState<NextActionFilter[]>(initialFilters.selectedNextActionFilters);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [deals, setDeals] = useState<BoardDeal[]>([]);
  const [targetMonthGoal, setTargetMonthGoal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isClosed, setIsClosed] = useState(false);
  const [isClosingMonth, setIsClosingMonth] = useState(false);
  const [expandedDealIds, setExpandedDealIds] = useState<Set<string>>(() => new Set());
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [updatingDealId, setUpdatingDealId] = useState<string | null>(null);
  const [didInitializeUserFilter, setDidInitializeUserFilter] = useState(false);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [usersResponse, departmentsResponse] = await Promise.all([
          authFetch('/api/users'),
          authFetch('/api/departments'),
        ]);

        if (!usersResponse.ok) {
          throw new Error('users fetch failed');
        }

        if (!departmentsResponse.ok) {
          throw new Error('departments fetch failed');
        }

        const usersPayload = await usersResponse.json();
        const departmentsPayload = await departmentsResponse.json();
        setUsers(Array.isArray(usersPayload) ? usersPayload : []);
        setDepartments(Array.isArray(departmentsPayload) ? departmentsPayload : []);
      } catch (loadFiltersError) {
        console.error('progress dashboard filters error:', loadFiltersError);
      }
    };

    loadFilters();
  }, []);

  useEffect(() => {
    if (!didInitializeUserFilter && isRestrictedUser && user?.id) {
      setSelectedUserId(user.id);
      setDidInitializeUserFilter(true);
      return;
    }

    if (!didInitializeUserFilter && !isRestrictedUser) {
      setDidInitializeUserFilter(true);
    }
  }, [didInitializeUserFilter, isRestrictedUser, user?.id]);

  useEffect(() => {
    const filters = {
      month,
      lifecycle,
      selectedUserId,
      selectedDepartmentId,
      selectedTemperatures,
      selectedNextActionFilters,
    };
    const nextSearch = buildProgressFilterSearch(filters);
    const nextUrl = nextSearch ? `/deals/progress?${nextSearch}` : '/deals/progress';

    window.sessionStorage.setItem(PROGRESS_FILTER_STORAGE_KEY, JSON.stringify(filters));
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      navigate(nextUrl, { replace: true });
    }
  }, [lifecycle, month, navigate, selectedDepartmentId, selectedNextActionFilters, selectedTemperatures, selectedUserId]);

  useEffect(() => {
    const loadDeals = async () => {
      setIsLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          month,
          lifecycle,
        });

        if (selectedUserId) {
          params.set('userId', selectedUserId);
        }

        if (selectedDepartmentId) {
          params.set('departmentId', selectedDepartmentId);
        }

        const response = await authFetch(`/api/deals/board?${params.toString()}`);
        if (!response.ok) {
          throw new Error('deals board fetch failed');
        }

        const payload = await response.json();
        setDeals(Array.isArray(payload.deals) ? payload.deals : []);
        setIsClosed(Boolean(payload.is_closed));
        setTargetMonthGoal(Number(payload.target_month_goal ?? 0));
      } catch (loadDealsError) {
        console.error('progress dashboard deals error:', loadDealsError);
        setError('商談進捗の取得に失敗しました');
        setDeals([]);
        setTargetMonthGoal(0);
        setIsClosed(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadDeals();
  }, [month, lifecycle, selectedUserId, selectedDepartmentId]);

  const filteredDeals = useMemo(() => (
    deals.filter((deal) => {
      const today = new Date();
      const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const hasNextAction = Boolean(deal.next_action?.trim() && deal.next_action_date);

      if (selectedNextActionFilters.length > 0) {
        if (deal.has_later_deal) {
          return false;
        }

        const matchesUnregistered = selectedNextActionFilters.includes('unregistered') && !hasNextAction;
        const matchesOverdue = selectedNextActionFilters.includes('overdue')
          && Boolean(deal.next_action_date && deal.next_action_date < todayString);

        if (!matchesUnregistered && !matchesOverdue) {
          return false;
        }
      }

      if (selectedTemperatures.length === 0) {
        return true;
      }

      if (deal.pipeline_stage === 'won') {
        return true;
      }

      const rawTemperature = (deal.deal_temperature ?? '').trim();
      if (!rawTemperature) {
        return false;
      }

      const normalizedTemperature = rawTemperature.charAt(0);
      return selectedTemperatures.includes(normalizedTemperature);
    })
  ), [deals, selectedNextActionFilters, selectedTemperatures]);
  const sortedDepartments = useMemo(
    () => [...departments].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [departments]
  );
  const scopedUsers = useMemo(
    () => (
      selectedDepartmentId
        ? users.filter((entry) => String(entry.department_id ?? '') === selectedDepartmentId)
        : users
    ),
    [selectedDepartmentId, users]
  );
  const sortedScopedUsers = useMemo(
    () => [...scopedUsers].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [scopedUsers]
  );

  const groupedDeals = useMemo(() => (
    COLUMNS.reduce<Record<DealPipelineStage, BoardDeal[]>>((acc, column) => {
      acc[column.key] = filteredDeals
        .filter((deal) => deal.pipeline_stage === column.key)
        .sort((left, right) => {
          const leftTone = getTemperatureTone(left.deal_temperature);
          const rightTone = getTemperatureTone(right.deal_temperature);
          if (leftTone.priority !== rightTone.priority) {
            return leftTone.priority - rightTone.priority;
          }

          return new Date(right.deal_date).getTime() - new Date(left.deal_date).getTime();
        });
      return acc;
    }, {
      targeting: [],
      visiting: [],
      negotiating: [],
      accepted: [],
      won: [],
      lost: [],
    })
  ), [filteredDeals]);

  const columnAmountTotals = useMemo(() => (
    COLUMNS.reduce<Record<DealPipelineStage, number>>((acc, column) => {
      acc[column.key] = groupedDeals[column.key].reduce((sum, deal) => (
        sum + getDealAmount(deal)
      ), 0);
      return acc;
    }, {
      targeting: 0,
      visiting: 0,
      negotiating: 0,
      accepted: 0,
      won: 0,
      lost: 0,
    })
  ), [groupedDeals]);

  const weightedColumnAmountTotals = useMemo(() => (
    COLUMNS.reduce<Record<DealPipelineStage, number>>((acc, column) => {
      acc[column.key] = groupedDeals[column.key].reduce((sum, deal) => (
        sum + getWeightedDealAmount(deal)
      ), 0);
      return acc;
    }, {
      targeting: 0,
      visiting: 0,
      negotiating: 0,
      accepted: 0,
      won: 0,
      lost: 0,
    })
  ), [groupedDeals]);

  const summary = useMemo(() => ({
    total: filteredDeals.length,
    newCount: filteredDeals.filter((deal) => deal.lifecycle === 'new').length,
    existingCount: filteredDeals.filter((deal) => deal.lifecycle === 'existing').length,
  }), [filteredDeals]);

  const portfolioSummary = useMemo(() => {
    const totalAmount = COLUMNS.reduce((sum, column) => sum + weightedColumnAmountTotals[column.key], 0);
    const rawTotalAmount = COLUMNS.reduce((sum, column) => sum + columnAmountTotals[column.key], 0);
    return {
      totalAmount,
      rawTotalAmount,
      goalAmount: targetMonthGoal,
      goalRate: targetMonthGoal > 0 ? Math.round((totalAmount / targetMonthGoal) * 100) : 0,
      columns: COLUMNS.map((column) => ({
        ...column,
        count: groupedDeals[column.key].length,
        amount: weightedColumnAmountTotals[column.key],
        rawAmount: columnAmountTotals[column.key],
        ratio: totalAmount > 0 ? Math.round((weightedColumnAmountTotals[column.key] / totalAmount) * 100) : 0,
      })),
    };
  }, [columnAmountTotals, groupedDeals, targetMonthGoal, weightedColumnAmountTotals]);

  const canEditDeal = (deal: BoardDeal) => (
    !isClosed
    && deal.pipeline_stage !== 'won'
    && (user?.role === 'admin' || deal.user_id === user?.id)
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleTemperatureFilter = (temperature: string) => {
    setSelectedTemperatures((current) => (
      current.includes(temperature)
        ? current.filter((value) => value !== temperature)
        : [...current, temperature]
    ));
  };

  const handleDrop = async (nextStatus: EditableDealPipelineStage) => {
    if (!draggingDealId || isClosed) {
      return;
    }

    const targetDeal = deals.find((deal) => deal.id === draggingDealId);
    if (!targetDeal || targetDeal.pipeline_stage === nextStatus || !canEditDeal(targetDeal)) {
      setDraggingDealId(null);
      return;
    }

    const previousStatus = targetDeal.pipeline_stage;
    setUpdatingDealId(targetDeal.id);
    setError('');
    setDeals((current) => current.map((deal) => (
      deal.id === targetDeal.id
        ? { ...deal, pipeline_stage: nextStatus }
        : deal
    )));

    try {
      const response = await authFetch('/api/deals/status', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deal_id: targetDeal.id,
          pipeline_stage: nextStatus,
          board_month: month,
        }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('forbidden');
        }
        throw new Error('deal status update failed');
      }
    } catch (updateError) {
      console.error('progress dashboard deal status error:', updateError);
      setError(updateError instanceof Error && updateError.message === 'forbidden'
        ? '他担当の商談ステータスは変更できません'
        : 'ステータス更新に失敗しました');
      setDeals((current) => current.map((deal) => (
        deal.id === targetDeal.id
          ? { ...deal, pipeline_stage: previousStatus }
          : deal
      )));
    } finally {
      setDraggingDealId(null);
      setUpdatingDealId(null);
    }
  };

  const handleCloseMonth = async () => {
    if (user?.role !== 'admin') {
      return;
    }

    setIsClosingMonth(true);
    setError('');

    try {
      const response = await authFetch('/api/deals/close-month', {
        method: isClosed ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ month }),
      });

      if (!response.ok) {
        throw new Error(isClosed ? 'deal board reopen month failed' : 'deal board close month failed');
      }

      setIsClosed((current) => !current);
    } catch (closeMonthError) {
      console.error('progress dashboard close month error:', closeMonthError);
      setError(isClosed ? '締め解除に失敗しました' : '月締めに失敗しました');
    } finally {
      setIsClosingMonth(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f5f8] p-4 sm:p-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate(homePath)}
            className="flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            {homeLabel}
          </button>
          <h1 className="flex items-center gap-2 text-lg font-bold text-zinc-900">
            <LayoutDashboard className="h-5 w-5 text-purple-600" />
            商談ボード
          </h1>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-white hover:text-zinc-700"
            aria-label="ログアウト"
            title="ログアウト"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setMonth((current) => shiftMonth(current, -1))}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-white hover:text-zinc-800"
                  aria-label="前月"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[110px] text-center text-sm font-semibold text-zinc-800">
                  {formatMonthLabel(month)}
                </span>
                <button
                  type="button"
                  onClick={() => setMonth((current) => shiftMonth(current, 1))}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-white hover:text-zinc-800"
                  aria-label="翌月"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="flex gap-2 rounded-2xl bg-zinc-50 p-1">
                {([
                  { value: 'all', label: 'すべて' },
                  { value: 'new', label: '新規' },
                  { value: 'existing', label: '既存' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLifecycle(option.value)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      lifecycle === option.value
                        ? 'bg-white text-zinc-900 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex min-w-[240px] items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2">
                <Users className="h-4 w-4 text-zinc-400" />
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-zinc-700 outline-none"
                >
                  <option value="">担当者すべて</option>
                  {sortedScopedUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}（{user.department ?? ''}）
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex min-w-[240px] items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2">
                <Users className="h-4 w-4 text-zinc-400" />
                <select
                  value={selectedDepartmentId}
                  onChange={(e) => setSelectedDepartmentId(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-zinc-700 outline-none"
                >
                  <option value="">部署すべて</option>
                  {sortedDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                  </select>
                </div>

              <div className="flex flex-wrap gap-2 rounded-2xl bg-zinc-50 p-2">
                {TEMPERATURE_FILTER_OPTIONS.map((option) => {
                  const isActive = selectedTemperatures.includes(option.value);
                  const tone = getTemperatureTone(option.value);

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleTemperatureFilter(option.value)}
                      className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                        isActive
                          ? tone.chipClassName
                          : 'bg-white text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      商談温度 {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2 rounded-2xl bg-zinc-50 p-2">
                <button
                  type="button"
                  aria-pressed={selectedNextActionFilters.includes('unregistered')}
                  onClick={() => setSelectedNextActionFilters((current) => (
                    current.includes('unregistered')
                      ? current.filter((value) => value !== 'unregistered')
                      : [...current, 'unregistered']
                  ))}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                    selectedNextActionFilters.includes('unregistered')
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'bg-white text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  次回未登録
                </button>
                <button
                  type="button"
                  aria-pressed={selectedNextActionFilters.includes('overdue')}
                  onClick={() => setSelectedNextActionFilters((current) => (
                    current.includes('overdue')
                      ? current.filter((value) => value !== 'overdue')
                      : [...current, 'overdue']
                  ))}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                    selectedNextActionFilters.includes('overdue')
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-white text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  期限切れ
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
              <span className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-700">総件数 {summary.total}</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">新規 {summary.newCount}</span>
              <span className="rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-700">既存 {summary.existingCount}</span>
              {isClosed && (
                <span className="rounded-full bg-zinc-100 px-3 py-1 font-semibold text-zinc-700">この月は締め済み</span>
              )}
              {user?.role === 'admin' && (
                <button
                  type="button"
                  onClick={handleCloseMonth}
                  disabled={isClosingMonth}
                  className={`inline-flex items-center rounded-full px-3 py-1 font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-zinc-300 ${
                    isClosed ? 'bg-amber-600' : 'bg-zinc-900'
                  }`}
                >
                  {isClosingMonth ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Lock className="mr-1 h-3.5 w-3.5" />
                  )}
                  {isClosed ? '締め解除' : '月締め'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mb-5 rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold text-zinc-400">商談ポートフォリオ</p>
              <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
                <p className="text-2xl font-black text-zinc-900">
                  ¥{portfolioSummary.totalAmount.toLocaleString()}
                </p>
                <p className="pb-1 text-xs font-semibold text-zinc-500">
                  加重予定額/月 合計
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">
                  当月目標 ¥{portfolioSummary.goalAmount.toLocaleString()}
                </span>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-zinc-600">
                  見込総額 ¥{portfolioSummary.rawTotalAmount.toLocaleString()}
                </span>
                <span className={`rounded-full px-3 py-1 ${
                  portfolioSummary.goalAmount > 0 && portfolioSummary.goalRate >= 100
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-zinc-100 text-zinc-600'
                }`}
                >
                  達成率 {portfolioSummary.goalAmount > 0 ? `${portfolioSummary.goalRate}%` : '-'}
                </span>
              </div>
            </div>

            <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
              {portfolioSummary.columns.map((item) => (
                <div key={item.key} className="rounded-2xl bg-zinc-50 px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-zinc-700">{item.title}</span>
                    <span className="text-[10px] font-bold text-zinc-400">{item.count}件</span>
                  </div>
                  <p className="text-sm font-black text-zinc-900">¥{item.amount.toLocaleString()}</p>
                  <p className="mt-0.5 text-[10px] font-semibold text-zinc-400">
                    見込総額 ¥{item.rawAmount.toLocaleString()}
                  </p>
                  <div className="mt-2 h-1.5 rounded-full bg-white">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${item.ratio}%`, backgroundColor: item.accent }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] font-semibold text-zinc-400">
                    構成比 {item.ratio}%
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-3xl bg-white p-12 text-center text-sm text-zinc-500 shadow-sm">
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-purple-500" />
            商談進捗を読み込み中です...
          </div>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="grid gap-4 md:min-w-[1280px] md:grid-cols-6 2xl:min-w-0">
              {COLUMNS.map((column) => (
                <div
                key={column.key}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!isClosed && column.key !== 'won') {
                    handleDrop(column.key);
                  }
                }}
                className={`rounded-3xl border border-zinc-200/80 p-4 shadow-sm ${column.bg}`}
              >
                <div className="mb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                    <h2 className="text-base font-bold text-zinc-900">{column.title}</h2>
                    <p className="mt-1 text-xs text-zinc-500">{column.hint}</p>
                    </div>
                    <div className="h-2 w-14 shrink-0 rounded-full" style={{ backgroundColor: column.accent }} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-white/75 px-3 py-2">
                      <p className="text-[10px] font-bold text-zinc-400">件数</p>
                      <p className="mt-0.5 text-sm font-black text-zinc-900">{groupedDeals[column.key].length}件</p>
                    </div>
                    <div className="rounded-2xl bg-white/75 px-3 py-2">
                      <p className="text-[10px] font-bold text-zinc-400">加重予定額/月</p>
                      <p className="mt-0.5 text-sm font-black text-zinc-900">¥{weightedColumnAmountTotals[column.key].toLocaleString()}</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-zinc-400">見込総額 ¥{columnAmountTotals[column.key].toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {groupedDeals[column.key].length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-zinc-200 bg-white/70 p-4 text-center text-xs text-zinc-400">
                      カードがありません
                    </div>
                  ) : (
                    groupedDeals[column.key].map((deal) => {
                      const categories = deal.proposal_categories.length > 0
                        ? deal.proposal_categories
                          : deal.proposal_category
                            ? [deal.proposal_category]
                            : [];
                      const temperatureTone = getTemperatureTone(deal.deal_temperature);
                      const nextActionParts = buildNextActionParts(deal);
                      const amountLines = buildExpectedAmountLines(deal);
                      const dealWeight = getDealWeight(deal);
                      const weightedDealAmount = getWeightedDealAmount(deal);
                      const { cleanNotes } = parseExpectedAmountNotes(deal.notes);
                      const isDealCollapsed = !expandedDealIds.has(deal.id);
                      const metaBadges = [
                        deal.contact_role ? `接触: ${deal.contact_role}` : null,
                      ].filter(Boolean);

                      return (
                        <motion.div
                          key={deal.id}
                          layout
                          draggable={canEditDeal(deal)}
                          onDragStart={() => {
                            if (canEditDeal(deal)) {
                              setDraggingDealId(deal.id);
                            }
                          }}
                          onDragEnd={() => setDraggingDealId(null)}
                          onClick={() => {
                            if (!draggingDealId) {
                              navigate(`/clinics/${deal.clinic_kind}/${encodeURIComponent(deal.clinic_id)}`);
                            }
                          }}
                          className={`relative overflow-hidden rounded-2xl border shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md ${
                            isDealCollapsed ? 'p-2.5' : 'p-3'
                          } ${
                            temperatureTone.cardClassName
                          } ${
                            updatingDealId === deal.id ? 'opacity-60' : ''
                          }`}
                        >
                          <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r ${temperatureTone.glowClassName}`} />

                          <div className={`${isDealCollapsed ? '' : 'mb-3'} flex items-start justify-between gap-2`}>
                            <div className="min-w-0">
                              <div className={`${isDealCollapsed ? 'mb-1 flex-nowrap' : 'mb-2 flex-wrap'} flex items-center gap-1.5 overflow-hidden`}>
                                <span className={`shrink-0 rounded-full font-bold ${
                                  isDealCollapsed ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
                                } ${temperatureTone.chipClassName}`}>
                                  {isDealCollapsed ? temperatureTone.shortLabel : temperatureTone.label}
                                </span>
                                <span className={`shrink-0 rounded-full font-semibold ${
                                  isDealCollapsed ? 'px-2 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'
                                } ${
                                  deal.lifecycle === 'new'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-sky-50 text-sky-700'
                                }`}>
                                  {deal.lifecycle === 'new' ? '新規' : '既存'}
                                </span>
                                {!isDealCollapsed && deal.is_carried_over && (
                                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700">
                                    前月繰越
                                  </span>
                                )}
                                {!isDealCollapsed && deal.pipeline_stage === 'won' && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                    自動受注
                                  </span>
                                )}
                                {!isDealCollapsed && !canEditDeal(deal) && (
                                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700">
                                    閲覧のみ
                                  </span>
                                )}
                              </div>
                              <div
                                title={deal.clinic_name}
                                className={`${isDealCollapsed ? 'truncate text-sm leading-5' : 'line-clamp-2 text-base leading-snug'} text-left font-bold text-zinc-900 hover:text-purple-600`}
                              >
                                {deal.clinic_name}
                              </div>
                              <p className={`${isDealCollapsed ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs'} truncate font-medium text-zinc-500`}>
                                {deal.user_name || '担当者未設定'} ・ {deal.deal_date}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                aria-label={`${deal.clinic_name}の詳細を${isDealCollapsed ? '展開' : '折り畳む'}`}
                                aria-expanded={!isDealCollapsed}
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setExpandedDealIds((current) => {
                                    const next = new Set(current);
                                    if (next.has(deal.id)) {
                                      next.delete(deal.id);
                                    } else {
                                      next.add(deal.id);
                                    }
                                    return next;
                                  });
                                }}
                                className="rounded-full bg-white/80 p-1 text-zinc-400 transition hover:bg-white hover:text-purple-600"
                              >
                                {isDealCollapsed ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronUp className="h-4 w-4" />
                                )}
                              </button>
                              <GripVertical className="h-4 w-4 text-zinc-300" />
                            </div>
                          </div>

                          {!isDealCollapsed && (
                          <>
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {categories.slice(0, 2).map((category) => (
                              <span key={category} className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                                {category}
                              </span>
                            ))}
                            {categories.length > 2 && (
                              <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-600">
                                +{categories.length - 2}
                              </span>
                            )}
                          </div>

                          <div className="space-y-2 text-sm text-zinc-600">
                            <div className="rounded-xl border border-zinc-100 bg-white/85 px-3 py-2">
                              <p className="mb-1 text-[10px] font-bold text-zinc-400">
                                次回
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-bold leading-5 text-zinc-900">
                                  {nextActionParts.action}
                                </span>
                                {nextActionParts.date && (
                                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-bold text-zinc-600">
                                    {nextActionParts.date}
                                  </span>
                                )}
                              </div>
                            </div>

                            {deal.amount != null && (
                              <div className="rounded-xl border border-purple-100 bg-purple-50/70 px-3 py-2 text-purple-900">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-purple-400">
                                    加重予定額/月
                                  </p>
                                  <p className="shrink-0 text-sm font-bold">
                                    ¥{weightedDealAmount.toLocaleString()}
                                  </p>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-semibold text-purple-600">
                                  <span>見込額 ¥{deal.amount.toLocaleString()}</span>
                                  <span>掛け目 {Math.round(dealWeight * 100)}%</span>
                                </div>
                                {amountLines.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {amountLines.slice(0, 3).map((line) => (
                                      <p key={line} className="truncate text-[11px] font-medium text-purple-700">
                                        {line}
                                      </p>
                                    ))}
                                    {amountLines.length > 3 && (
                                      <p className="text-[11px] font-semibold text-purple-500">
                                        +{amountLines.length - 3}カテゴリ
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {metaBadges.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {metaBadges.map((badge) => (
                                  <span
                                    key={badge}
                                    className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold text-zinc-600"
                                  >
                                    {badge}
                                  </span>
                                ))}
                              </div>
                            )}

                            {cleanNotes && (
                              <p className="line-clamp-2 text-xs leading-5 text-zinc-500">
                                {cleanNotes}
                              </p>
                            )}
                          </div>
                          </>
                          )}
                        </motion.div>
                      );
                    })
                  )}
                </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
