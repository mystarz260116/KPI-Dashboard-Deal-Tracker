import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { authFetch } from '../lib/authFetch';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, ChevronLeft, ChevronRight, GripVertical, LayoutDashboard,
  Loader2, Lock, LogOut, Users,
} from 'lucide-react';

type DealPipelineStage = 'targeting' | 'visiting' | 'negotiating' | 'won' | 'lost';
type EditableDealPipelineStage = Exclude<DealPipelineStage, 'won'>;
type DealLifecycle = 'all' | 'new' | 'existing';

type BoardDeal = {
  id: string;
  user_id: string;
  user_name: string;
  clinic_name: string;
  clinic_kind: 'customer' | 'prospect';
  clinic_id: string;
  lifecycle: DealLifecycle;
  deal_date: string;
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
  deal_temperature: string | null;
  source_month: string;
  is_carried_over: boolean;
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
  { key: 'won', title: '受注', accent: '#10b981', bg: 'bg-emerald-50', hint: '受注確認完了後に自動で移動', editable: false },
  { key: 'lost', title: '失注', accent: '#ef4444', bg: 'bg-rose-50', hint: '見送り・失注。担当者が手動で更新', editable: true },
];

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

function buildNextActionLabel(deal: BoardDeal) {
  if (!deal.next_action) {
    return '次アクション未設定';
  }

  if (!deal.next_action_date) {
    return deal.next_action;
  }

  return `${deal.next_action} · ${deal.next_action_date}`;
}

export default function DealProgressDashboard() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const homePath = user?.can_view_dashboard ? '/dashboard' : '/deals/new';
  const homeLabel = user?.can_view_dashboard ? 'ダッシュボード' : '商談入力';
  const isRestrictedUser = Boolean(user && user.role !== 'admin' && !user.can_view_dashboard);

  const [month, setMonth] = useState(currentMonth());
  const [lifecycle, setLifecycle] = useState<DealLifecycle>('all');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [selectedTemperatures, setSelectedTemperatures] = useState<string[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [deals, setDeals] = useState<BoardDeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isClosed, setIsClosed] = useState(false);
  const [isClosingMonth, setIsClosingMonth] = useState(false);
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
      } catch (loadDealsError) {
        console.error('progress dashboard deals error:', loadDealsError);
        setError('商談進捗の取得に失敗しました');
        setDeals([]);
        setIsClosed(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadDeals();
  }, [month, lifecycle, selectedUserId, selectedDepartmentId]);

  const filteredDeals = useMemo(() => (
    deals.filter((deal) => {
      if (selectedTemperatures.length === 0) {
        return true;
      }

      const rawTemperature = (deal.deal_temperature ?? '').trim();
      if (!rawTemperature) {
        return false;
      }

      const normalizedTemperature = rawTemperature.charAt(0);
      return selectedTemperatures.includes(normalizedTemperature);
    })
  ), [deals, selectedTemperatures]);
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
      won: [],
      lost: [],
    })
  ), [filteredDeals]);

  const summary = useMemo(() => ({
    total: filteredDeals.length,
    newCount: filteredDeals.filter((deal) => deal.lifecycle === 'new').length,
    existingCount: filteredDeals.filter((deal) => deal.lifecycle === 'existing').length,
  }), [filteredDeals]);

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
          <div className="grid gap-5 xl:grid-cols-5">
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
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-zinc-900">{column.title}</h2>
                    <p className="mt-1 text-xs text-zinc-500">{column.hint}</p>
                    <p className="mt-2 text-xs font-semibold text-zinc-500">{groupedDeals[column.key].length} 件</p>
                  </div>
                  <div className="h-2 w-16 rounded-full" style={{ backgroundColor: column.accent }} />
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
                      const nextActionLabel = buildNextActionLabel(deal);
                      const metaBadges = [
                        deal.contact_role ? `接触: ${deal.contact_role}` : null,
                        deal.decision_maker_contact === 'yes'
                          ? '決裁者接触あり'
                          : deal.decision_maker_contact === 'no'
                            ? '決裁者未接触'
                            : null,
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
                          className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md ${
                            temperatureTone.cardClassName
                          } ${
                            updatingDealId === deal.id ? 'opacity-60' : ''
                          }`}
                        >
                          <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-linear-to-r ${temperatureTone.glowClassName}`} />

                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${temperatureTone.chipClassName}`}>
                                  {temperatureTone.label}
                                </span>
                                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                  deal.lifecycle === 'new'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-sky-50 text-sky-700'
                                }`}>
                                  {deal.lifecycle === 'new' ? '新規' : '既存'}
                                </span>
                                {deal.is_carried_over && (
                                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700">
                                    前月繰越
                                  </span>
                                )}
                                {deal.pipeline_stage === 'won' && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                    自動受注
                                  </span>
                                )}
                                {!canEditDeal(deal) && (
                                  <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-700">
                                    閲覧のみ
                                  </span>
                                )}
                              </div>
                              <div className="truncate text-left text-base font-bold text-zinc-900 hover:text-purple-600">
                                {deal.clinic_name}
                              </div>
                              <p className="mt-1 text-xs font-medium text-zinc-500">
                                {deal.user_name || '担当者未設定'} · {deal.deal_date}
                              </p>
                            </div>
                            <GripVertical className="h-4 w-4 shrink-0 text-zinc-300" />
                          </div>

                          <div className="mb-3 flex flex-wrap gap-2">
                            {categories.slice(0, 2).map((category) => (
                              <span key={category} className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                                {category}
                              </span>
                            ))}
                            {categories.length > 2 && (
                              <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-600">
                                +{categories.length - 2}
                              </span>
                            )}
                          </div>

                          <div className="space-y-2 text-sm text-zinc-600">
                            <div className="rounded-xl bg-white/80 px-3 py-2">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                                Next
                              </p>
                              <p className="mt-1 font-semibold text-zinc-800">{nextActionLabel}</p>
                            </div>

                            {metaBadges.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {metaBadges.map((badge) => (
                                  <span
                                    key={badge}
                                    className="rounded-full bg-white/85 px-2 py-1 text-[11px] font-medium text-zinc-600"
                                  >
                                    {badge}
                                  </span>
                                ))}
                              </div>
                            )}

                            {deal.notes && (
                              <p className="line-clamp-2 text-xs leading-5 text-zinc-500">
                                {deal.notes}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
