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

const COLUMNS: Array<{ key: DealPipelineStage; title: string; accent: string; bg: string; hint: string; editable: boolean }> = [
  { key: 'targeting', title: 'ターゲティング', accent: '#8b5cf6', bg: 'bg-violet-50', hint: '候補先の選定・情報整理段階', editable: true },
  { key: 'visiting', title: '訪問中', accent: '#f59e0b', bg: 'bg-amber-50', hint: '初回訪問や継続接触を進めている段階', editable: true },
  { key: 'negotiating', title: '交渉中', accent: '#06b6d4', bg: 'bg-cyan-50', hint: '提案・見積・具体相談が進んでいる段階', editable: true },
  { key: 'won', title: '受注', accent: '#10b981', bg: 'bg-emerald-50', hint: '受注確認完了後に自動で移動', editable: false },
  { key: 'lost', title: '失注', accent: '#ef4444', bg: 'bg-rose-50', hint: '見送り・失注。担当者が手動で更新', editable: true },
];

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

  const groupedDeals = useMemo(() => (
    COLUMNS.reduce<Record<DealPipelineStage, BoardDeal[]>>((acc, column) => {
      acc[column.key] = deals.filter((deal) => deal.pipeline_stage === column.key);
      return acc;
    }, {
      targeting: [],
      visiting: [],
      negotiating: [],
      won: [],
      lost: [],
    })
  ), [deals]);

  const summary = useMemo(() => ({
    total: deals.length,
    newCount: deals.filter((deal) => deal.lifecycle === 'new').length,
    existingCount: deals.filter((deal) => deal.lifecycle === 'existing').length,
  }), [deals]);

  const canEditDeal = (deal: BoardDeal) => (
    !isClosed
    && deal.pipeline_stage !== 'won'
    && (user?.role === 'admin' || deal.user_id === user?.id)
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
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

              <div className="flex min-w-[220px] items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2">
                <Users className="h-4 w-4 text-zinc-400" />
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-zinc-700 outline-none"
                >
                  <option value="">担当者すべて</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex min-w-[220px] items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2">
                <Users className="h-4 w-4 text-zinc-400" />
                <select
                  value={selectedDepartmentId}
                  onChange={(e) => setSelectedDepartmentId(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-zinc-700 outline-none"
                >
                  <option value="">部署すべて</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
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
                          className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 ${
                            updatingDealId === deal.id ? 'opacity-60' : ''
                          }`}
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="text-left font-bold text-zinc-900 hover:text-purple-600">
                              {deal.clinic_name}
                            </div>
                            <GripVertical className="h-4 w-4 shrink-0 text-zinc-300" />
                          </div>

                          <div className="mb-3 flex flex-wrap gap-2">
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
                            {categories.slice(0, 2).map((category) => (
                              <span key={category} className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                                {category}
                              </span>
                            ))}
                          </div>

                          <div className="space-y-2 text-sm text-zinc-600">
                            <p className="font-medium text-zinc-800">{deal.user_name || '担当者未設定'}</p>
                            <p>{deal.deal_date}</p>
                            {deal.product_name && <p>具体商品: {deal.product_name}</p>}
                            {deal.next_action && <p>次回: {deal.next_action}</p>}
                            {deal.notes && (
                              <p className="line-clamp-3 text-zinc-500">
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
