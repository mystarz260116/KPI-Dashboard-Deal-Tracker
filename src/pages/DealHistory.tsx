import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';
import {
  ArrowLeft, Building2, Search, Filter,
  TrendingUp, CheckCircle, XCircle, MessageSquare, LayoutDashboard
} from 'lucide-react';

interface Deal {
  id: string;
  clinicName: string;
  activityType: 'visit' | 'proposal' | 'negotiating' | 'won' | 'lost';
  date: string;
  productName?: string;
  amount?: number;
  notes?: string;
  nextAction?: string;
}

// ============================================
// 朱さんへ：差し替えが必要な箇所です
// --------------------------------------------
// 現在はデモ用のダミーデータです
// 本番稼働時は GET /api/deals?userId=xxx から取得する
// 形に差し替えをお願いします🙏
// ============================================
const DUMMY_DEALS: Deal[] = [
  {
    id: '1',
    clinicName: '山田歯科医院',
    activityType: 'won',
    date: '2026-03-06',
    productName: '商品A',
    amount: 500000,
    notes: '院長と面談、即決いただけた',
    nextAction: '契約書送付',
  },
  {
    id: '2',
    clinicName: 'さくら歯科',
    activityType: 'proposal',
    date: '2026-03-05',
    notes: '提案資料を持参、前向きな反応',
    nextAction: '来週フォロー',
  },
  {
    id: '3',
    clinicName: '東京歯科クリニック',
    activityType: 'visit',
    date: '2026-03-04',
    notes: '初回訪問、受付に資料置いてきた',
    nextAction: '再訪問',
  },
  {
    id: '4',
    clinicName: 'ほほえみ歯科',
    activityType: 'negotiating',
    date: '2026-03-03',
    notes: '価格交渉中',
    nextAction: '上長に確認後連絡',
  },
  {
    id: '5',
    clinicName: '高槻歯科医院',
    activityType: 'lost',
    date: '2026-03-02',
    notes: '他社に決定',
  },
  {
    id: '6',
    clinicName: '北浜デンタルクリニック',
    activityType: 'visit',
    date: '2026-03-01',
    notes: '院長不在、次回アポ取得',
    nextAction: '3/10 再訪問',
  },
];

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

export default function DealHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<Deal['activityType'] | 'all'>('all');

  const filtered = DUMMY_DEALS.filter(d => {
    const matchSearch = searchQuery === '' || d.clinicName.includes(searchQuery);
    const matchType = filterType === 'all' || d.activityType === filterType;
    return matchSearch && matchType;
  });

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
          <div className="w-20" />
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
                    <span className="font-bold text-zinc-900">{deal.clinicName}</span>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ACTIVITY_COLORS[deal.activityType]}`}>
                    {ACTIVITY_LABELS[deal.activityType]}
                  </span>
                </div>

                <p className="mb-2 text-xs text-zinc-400">{deal.date}</p>

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
