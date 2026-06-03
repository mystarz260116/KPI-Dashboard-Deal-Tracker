import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { authFetch } from '../lib/authFetch';
import { motion } from 'motion/react';
import {
  ArrowLeft, Building2, Search, CalendarDays, ChevronLeft, ChevronRight,
  MessageSquare, LayoutDashboard, LogOut, Trash2
} from 'lucide-react';

interface Deal {
  id: string;
  clinicId: string;
  clinicKind: 'customer' | 'prospect';
  clinicName: string;
  activityType: 'visit' | 'proposal' | 'negotiating' | 'won' | 'lost';
  executedActionType?: string;
  date: string;
  productName?: string;
  amount?: number;
  notes?: string;
  nextAction?: string;
  contactRole?: string;
  decisionMakerContact?: 'yes' | 'no' | 'unknown';
  proposalCategory?: string;
  proposalCategories?: string[];
  dealTemperature?: 'A' | 'B' | 'C' | 'D' | 'E';
  nextActionType?: string;
  nextActionDate?: string;
}

interface DealComment {
  id: string;
  deal_id: string | null;
  clinic_kind: 'customer' | 'prospect';
  clinic_id: string;
  body: string;
  created_at: string;
  author_user_id: string;
  author_name: string;
}

interface DealReactionSummary {
  deal_id: string;
  counts: {
    like: number;
    helpful: number;
    congrats: number;
  };
  mine: string[];
}

const ACTIVITY_LABELS: Record<Deal['activityType'], string> = {
  visit:       '訪問',
  proposal:    '提案中',
  negotiating: '交渉中',
  won:         '受注',
  lost:        '失注',
};

const ACTIVITY_COLORS: Record<Deal['activityType'], string> = {
  visit:       'bg-blue-100 text-blue-700',
  proposal:    'bg-yellow-100 text-yellow-700',
  negotiating: 'bg-orange-100 text-orange-700',
  won:         'bg-green-100 text-green-700',
  lost:        'bg-red-100 text-red-700',
};

const DECISION_MAKER_LABELS: Record<NonNullable<Deal['decisionMakerContact']>, string> = {
  yes: '決裁者接触あり',
  no: '決裁者接触なし',
  unknown: '決裁者不明',
};

const TEMPERATURE_LABELS: Record<NonNullable<Deal['dealTemperature']>, string> = {
  A: 'A すぐ案件化',
  B: 'B 見込みあり',
  C: 'C 長期フォロー',
  D: 'D 可能性低い',
  E: 'E 失注・拒否',
};

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split('-');
  return `${year}年${Number(month)}月`;
}

function shiftMonth(value: string, diff: number) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1 + diff, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthRange(value: string) {
  const [year, month] = value.split('-').map(Number);
  const start = `${value}-01`;
  const nextMonth = new Date(year, month, 1);
  const endExclusive = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, endExclusive };
}

export default function DealHistory() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const homePath = user?.can_view_dashboard ? '/dashboard' : '/deals/new';
  const homeLabel = user?.can_view_dashboard ? 'ダッシュボード' : '商談入力';

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<Deal['activityType'] | 'all'>('all');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [commentsByDealId, setCommentsByDealId] = useState<Record<string, DealComment[]>>({});
  const [reactionsByDealId, setReactionsByDealId] = useState<Record<string, DealReactionSummary>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [submittingCommentDealId, setSubmittingCommentDealId] = useState<string | null>(null);
  const [submittingReactionKey, setSubmittingReactionKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null);

  useEffect(() => {
    const fetchDeals = async () => {
      if (!user?.id) return;

      let query = supabase
        .from('deals')
        .select('id, customer_code, prospect_customer_id, deal_date, activity_type, executed_action_type, product_name, amount, notes, next_action, contact_role, decision_maker_contact, proposal_category, proposal_categories, deal_temperature, next_action_type, next_action_date, customers(name), prospect_customers(name)')
        .gte('deal_date', getMonthRange(selectedMonth).start)
        .lt('deal_date', getMonthRange(selectedMonth).endExclusive)
        .order('deal_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (user.role !== 'admin') {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('deal history fetch error:', error);
        setError('商談履歴の取得に失敗しました');
        setDeals([]);
        return;
      }

      setError('');

      const results: Deal[] = (data ?? []).map((d: any) => ({
        id: d.id,
        clinicId: d.customer_code ?? d.prospect_customer_id,
        clinicKind: d.customer_code ? 'customer' : 'prospect',
        clinicName: d.customers?.name ?? d.prospect_customers?.name ?? d.customer_code ?? d.prospect_customer_id,
        activityType: d.activity_type,
        executedActionType: d.executed_action_type ?? undefined,
        date: d.deal_date,
        productName: d.product_name ?? undefined,
        amount: d.amount ?? undefined,
        notes: d.notes ?? undefined,
        nextAction: d.next_action ?? undefined,
        contactRole: d.contact_role ?? undefined,
        decisionMakerContact: d.decision_maker_contact ?? undefined,
        proposalCategory: d.proposal_category ?? undefined,
        proposalCategories: Array.isArray(d.proposal_categories) ? d.proposal_categories : undefined,
        dealTemperature: d.deal_temperature ?? undefined,
        nextActionType: d.next_action_type ?? undefined,
        nextActionDate: d.next_action_date ?? undefined,
      }));

      setDeals(results);

      const dealIds = results.map((deal) => deal.id);
      if (dealIds.length === 0) {
        setCommentsByDealId({});
        setReactionsByDealId({});
        return;
      }

      const [commentsResponse, reactionsResponse] = await Promise.all([
        authFetch('/api/deals?path=comments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mode: 'list',
            deal_ids: dealIds.join(','),
          }),
        }),
        authFetch('/api/deals?path=reactions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            mode: 'list',
            deal_ids: dealIds.join(','),
          }),
        }),
      ]);

      if (!commentsResponse.ok) {
        setError('コメントの取得に失敗しました');
        setCommentsByDealId({});
        setReactionsByDealId({});
        return;
      }

      if (!reactionsResponse.ok) {
        setError('リアクションの取得に失敗しました');
        setCommentsByDealId({});
        setReactionsByDealId({});
        return;
      }

      const commentsPayload = await commentsResponse.json();
      const reactionsPayload = await reactionsResponse.json();

      const nextCommentsByDealId: Record<string, DealComment[]> = {};
      for (const comment of Array.isArray(commentsPayload) ? commentsPayload : []) {
        const dealId = String(comment.deal_id ?? '').trim();
        if (!dealId) continue;
        nextCommentsByDealId[dealId] = [...(nextCommentsByDealId[dealId] ?? []), comment];
      }

      const nextReactionsByDealId: Record<string, DealReactionSummary> = {};
      for (const reaction of Array.isArray(reactionsPayload) ? reactionsPayload : []) {
        const dealId = String(reaction.deal_id ?? '').trim();
        if (!dealId) continue;
        nextReactionsByDealId[dealId] = reaction;
      }

      setCommentsByDealId(nextCommentsByDealId);
      setReactionsByDealId(nextReactionsByDealId);
    };

    fetchDeals();
  }, [selectedMonth, user?.id, user?.role]);

  const filtered = deals.filter(d => {
    const matchSearch = searchQuery === '' || d.clinicName.includes(searchQuery);
    const matchType = filterType === 'all' || d.activityType === filterType;
    return matchSearch && matchType;
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleDeleteDeal = async (deal: Deal) => {
    const shouldDelete = window.confirm(`「${deal.clinicName}」の商談履歴を削除しますか？`);
    if (!shouldDelete) {
      return;
    }

    setDeletingDealId(deal.id);
    setError('');

    try {
      const { error: deleteError } = await supabase
        .from('deals')
        .delete()
        .eq('id', deal.id);

      if (deleteError) {
        console.error('deal delete error:', deleteError);
        setError('商談履歴の削除に失敗しました');
        return;
      }

      setDeals((current) => current.filter((currentDeal) => currentDeal.id !== deal.id));
    } catch (deleteUnexpectedError) {
      console.error('deal delete unexpected error:', deleteUnexpectedError);
      setError('商談履歴の削除に失敗しました');
    } finally {
      setDeletingDealId(null);
    }
  };

  const handleSubmitComment = async (deal: Deal) => {
    const body = commentDrafts[deal.id]?.trim() ?? '';
    if (!body) return;

    setSubmittingCommentDealId(deal.id);
    setError('');

    try {
      const response = await authFetch('/api/deals?path=comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clinic_kind: deal.clinicKind,
          clinic_id: deal.clinicId,
          deal_id: deal.id,
          body,
        }),
      });

      if (!response.ok) {
        setError('コメントの投稿に失敗しました');
        return;
      }

      const newComment = await response.json();
      setCommentsByDealId((current) => ({
        ...current,
        [deal.id]: [newComment, ...(current[deal.id] ?? [])],
      }));
      setCommentDrafts((current) => ({
        ...current,
        [deal.id]: '',
      }));
    } catch (submitError) {
      console.error('deal history comment post error:', submitError);
      setError('コメントの投稿に失敗しました');
    } finally {
      setSubmittingCommentDealId(null);
    }
  };

  const handleToggleReaction = async (dealId: string, reactionType: 'like' | 'helpful' | 'congrats') => {
    setSubmittingReactionKey(`${dealId}:${reactionType}`);
    setError('');

    try {
      const response = await authFetch('/api/deals?path=reactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deal_id: dealId,
          reaction_type: reactionType,
        }),
      });

      if (!response.ok) {
        setError('リアクションの更新に失敗しました');
        return;
      }

      const payload = await response.json();
      setReactionsByDealId((current) => {
        const currentEntry = current[dealId] ?? {
          deal_id: dealId,
          counts: { like: 0, helpful: 0, congrats: 0 },
          mine: [],
        };
        const nextMine = new Set(currentEntry.mine);
        const nextCounts = { ...currentEntry.counts };
        if (payload.active) {
          nextMine.add(reactionType);
          nextCounts[reactionType] += 1;
        } else {
          nextMine.delete(reactionType);
          nextCounts[reactionType] = Math.max(0, nextCounts[reactionType] - 1);
        }

        return {
          ...current,
          [dealId]: {
            deal_id: dealId,
            counts: nextCounts,
            mine: Array.from(nextMine),
          },
        };
      });
    } catch (reactionError) {
      console.error('deal history reaction update error:', reactionError);
      setError('リアクションの更新に失敗しました');
    } finally {
      setSubmittingReactionKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-200 p-4 sm:p-8">
      <div className="mx-auto max-w-xl">

        {/* ヘッダー */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate(homePath)}
            className="flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            {homeLabel}
          </button>
          <h1 className="text-lg font-bold text-zinc-900">商談履歴</h1>
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

        {/* 検索・フィルター */}
        <div className="mb-4 space-y-3 rounded-2xl bg-white p-4 shadow-sm border border-zinc-200">
          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-2">
            <button
              type="button"
              onClick={() => setSelectedMonth((current) => shiftMonth(current, -1))}
              className="rounded-lg p-2 text-zinc-500 transition hover:bg-white hover:text-zinc-900"
              aria-label="前月へ"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">対象月</p>
              <p className="text-sm font-semibold text-zinc-900">{formatMonthLabel(selectedMonth)}</p>
            </div>
            <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-zinc-600 shadow-sm">
              <CalendarDays className="h-4 w-4 text-zinc-400" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-sm text-zinc-700 outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => setSelectedMonth((current) => shiftMonth(current, 1))}
              className="rounded-lg p-2 text-zinc-500 transition hover:bg-white hover:text-zinc-900"
              aria-label="翌月へ"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="医院名で検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-9 pr-4 text-sm focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'visit', 'proposal', 'negotiating', 'won', 'lost'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  filterType === type
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                    : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                }`}
              >
                {type === 'all' ? 'すべて' : ACTIVITY_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-600 shadow-sm border border-red-200">
            {error}
          </div>
        )}

        {/* 件数 */}
        <p className="mb-3 text-xs text-zinc-500">{filtered.length}件の商談</p>

        {/* 商談リスト */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-sm text-zinc-400 shadow-sm">
              該当する商談がありません
            </div>
          ) : (
            filtered.map((deal, i) => (
              <motion.div
                key={deal.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl bg-white p-5 shadow-sm border border-zinc-200"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-zinc-400" />
                    <button
                      type="button"
                      onClick={() => navigate(`/clinics/${deal.clinicKind}/${encodeURIComponent(deal.clinicId)}`)}
                      className="font-bold text-zinc-900 hover:text-purple-600"
                    >
                      {deal.clinicName}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    {deal.executedActionType && (
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                        {deal.executedActionType}
                      </span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACTIVITY_COLORS[deal.activityType]}`}>
                      {ACTIVITY_LABELS[deal.activityType]}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteDeal(deal)}
                      disabled={deletingDealId === deal.id}
                      className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      aria-label="商談履歴を削除"
                      title="商談履歴を削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <p className="mb-2 text-xs text-zinc-400">{deal.date}</p>

                {(deal.dealTemperature || deal.proposalCategory || deal.proposalCategories?.length || deal.contactRole || deal.decisionMakerContact) && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {deal.dealTemperature && (
                      <span className="rounded-full bg-purple-50 px-2 py-1 text-xs font-semibold text-purple-700">
                        {TEMPERATURE_LABELS[deal.dealTemperature]}
                      </span>
                    )}
                    {(deal.proposalCategories?.length
                      ? deal.proposalCategories
                      : deal.proposalCategory
                        ? [deal.proposalCategory]
                        : []
                    ).map(category => (
                      <span key={category} className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        {category}
                      </span>
                    ))}
                    {deal.contactRole && (
                      <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                        接触相手：{deal.contactRole}
                      </span>
                    )}
                    {deal.decisionMakerContact && (
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
                        {DECISION_MAKER_LABELS[deal.decisionMakerContact]}
                      </span>
                    )}
                  </div>
                )}

                {deal.amount != null && (
                  <p className="mb-2 text-sm font-bold text-purple-600">
                    受注予定額/月：¥{deal.amount.toLocaleString()}
                  </p>
                )}

                {deal.notes && (
                  <div className="mb-2 flex items-start gap-2">
                    <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <p className="text-sm text-zinc-600">{deal.notes}</p>
                  </div>
                )}

                {deal.nextAction && (
                  <div className="mt-2 rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-700">
                    次アクション：{deal.nextAction}
                  </div>
                )}

                {!deal.nextAction && (deal.nextActionType || deal.nextActionDate) && (
                  <div className="mt-2 rounded-lg bg-purple-50 px-3 py-2 text-xs text-purple-700">
                    次アクション：{deal.nextActionType ?? '未設定'}
                    {deal.nextActionDate ? `（${deal.nextActionDate}）` : ''}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {([
                    ['like', 'いいね'],
                    ['helpful', '参考になった'],
                    ['congrats', 'おめでとう'],
                  ] as const).map(([reactionType, label]) => {
                    const reactionState = reactionsByDealId[deal.id];
                    const isActive = reactionState?.mine.includes(reactionType) ?? false;
                    const count = reactionState?.counts[reactionType] ?? 0;
                    const isSubmitting = submittingReactionKey === `${deal.id}:${reactionType}`;

                    return (
                      <button
                        key={reactionType}
                        type="button"
                        onClick={() => handleToggleReaction(deal.id, reactionType)}
                        disabled={isSubmitting}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          isActive
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        } disabled:opacity-50`}
                      >
                        {label} {count > 0 ? `${count}` : ''}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-xl bg-zinc-50 p-4">
                  <textarea
                    value={commentDrafts[deal.id] ?? ''}
                    onChange={(event) => setCommentDrafts((current) => ({
                      ...current,
                      [deal.id]: event.target.value,
                    }))}
                    placeholder="この商談へのコメントを書く"
                    className="min-h-[80px] w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleSubmitComment(deal)}
                      disabled={submittingCommentDealId === deal.id || !(commentDrafts[deal.id] ?? '').trim()}
                      className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submittingCommentDealId === deal.id ? '投稿中...' : 'コメントを投稿'}
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {(commentsByDealId[deal.id] ?? []).length === 0 ? (
                    <div className="rounded-lg bg-zinc-50 px-3 py-3 text-sm text-zinc-500">
                      まだコメントはありません
                    </div>
                  ) : (
                    (commentsByDealId[deal.id] ?? []).map((comment) => (
                      <div key={comment.id} className="rounded-lg border border-zinc-200 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-zinc-900">{comment.author_name}</p>
                          <p className="text-xs text-zinc-500">
                            {new Intl.DateTimeFormat('ja-JP', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            }).format(new Date(comment.created_at))}
                          </p>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{comment.body}</p>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* 下部ボタン */}
        <div className="mt-8 space-y-3">
          <button
            onClick={() => navigate('/deals/new')}
            className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 py-4 font-bold text-white shadow-md transition hover:opacity-90"
          >
            新しい商談を入力する
          </button>
          <button
            onClick={() => navigate(homePath)}
            className="flex w-full items-center justify-center rounded-xl border border-zinc-200 bg-white py-4 font-bold text-zinc-600 transition hover:bg-zinc-50"
          >
            <LayoutDashboard className="mr-2 h-5 w-5" />{homeLabel}へ
          </button>
        </div>

      </div>
    </div>
  );
}
