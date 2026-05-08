import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import {
  ArrowLeft, Building2, Search, Filter,
  TrendingUp, CheckCircle, XCircle, MessageSquare, LayoutDashboard, LogOut, Trash2
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

export default function DealHistory() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<Deal['activityType'] | 'all'>('all');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [error, setError] = useState('');
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null);

  useEffect(() => {
    const fetchDeals = async () => {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from('deals')
        .select('id, customer_code, prospect_customer_id, deal_date, activity_type, executed_action_type, product_name, amount, notes, next_action, contact_role, decision_maker_contact, proposal_category, proposal_categories, deal_temperature, next_action_type, next_action_date, customers(name), prospect_customers(name)')
        .eq('user_id', user.id)
        .order('deal_date', { ascending: false })
        .order('created_at', { ascending: false });

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
    };

    fetchDeals();
  }, [user?.id]);

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

  return (
    <div className="min-h-screen bg-zinc-200 p-4 sm:p-8">
      <div className="mx-auto max-w-xl">

        {/* ヘッダー */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            ダッシュボード
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

                {deal.amount && (
                  <p className="mb-2 text-sm font-bold text-emerald-600">
                    ¥{deal.amount.toLocaleString()}
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
            onClick={() => navigate('/dashboard')}
            className="flex w-full items-center justify-center rounded-xl border border-zinc-200 bg-white py-4 font-bold text-zinc-600 transition hover:bg-zinc-50"
          >
            <LayoutDashboard className="mr-2 h-5 w-5" />ダッシュボードへ
          </button>
        </div>

      </div>
    </div>
  );
}
