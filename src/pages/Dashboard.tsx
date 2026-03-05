import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { KPIData, Granularity, Period } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  LayoutDashboard,
  PlusCircle,
  Filter,
  Calendar,
  Users,
  TrendingUp,
  Target,
  LogOut,
  Download
} from 'lucide-react';
import { motion } from 'motion/react';

interface User {
  id: string;
  name: string;
  team: string;
}

const COLORS = ['#6366f1', '#10b981'];

const TEAMS = [
  { label: '①東京営業部・東京営業', key: '東京営業' },
  { label: '②大阪営業部・高槻営業', key: '高槻営業' },
  { label: '②大阪営業部・北浜営業', key: '北浜営業' },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>('monthly');
  const [granularity, setGranularity] = useState<Granularity>('all');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [data, setData] = useState<KPIData | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUsers([
      { id: '1', name: '権藤', team: '東京営業' },
      { id: '2', name: '浦上', team: '東京営業' },
      { id: '3', name: '井出', team: '東京営業' },
      { id: '4', name: '茂田', team: '東京営業' },
      { id: '5', name: '熊木', team: '東京営業' },
      { id: '6', name: '山口', team: '東京営業' },
      { id: '7', name: '小野寺', team: '東京営業' },
      { id: '8', name: '工藤', team: '東京営業' },
      { id: '9', name: '寺町', team: '高槻営業' },
      { id: '10', name: '今井', team: '高槻営業' },
      { id: '11', name: '阪本', team: '高槻営業' },
      { id: '12', name: '熊懐', team: '高槻営業' },
      { id: '13', name: '川合', team: '高槻営業' },
      { id: '14', name: '山田', team: '高槻営業' },
      { id: '15', name: '松井', team: '高槻営業' },
      { id: '16', name: '平', team: '高槻営業' },
      { id: '17', name: '宮川', team: '高槻営業' },
      { id: '18', name: '小山', team: '北浜営業' },
      { id: '19', name: '竹内', team: '北浜営業' },
      { id: '20', name: '中澤', team: '北浜営業' },
      { id: '21', name: '枡田', team: '北浜営業' },
      { id: '22', name: '藤丸', team: '北浜営業' },
      { id: '23', name: '中西', team: '北浜営業' },
      { id: '24', name: '片山', team: '北浜営業' },
      { id: '25', name: '山本', team: '北浜営業' },
    ]);
    setData({
      budget: { sales: 3200000, budget: 4000000, achievement_rate: 80 },
      sales: { sales: 3200000, prev_sales: 2800000, change_rate: 14.3 },
      pipeline: { proposal_count: 24, won_count: 8, conversion_rate: 33.3 },
      proposal_ranking: [
        { name: '権藤', count: 8 },
        { name: '寺町', count: 6 },
        { name: '浦上', count: 5 },
        { name: '山田', count: 3 },
        { name: '工藤', count: 2 },
      ],
      won_ranking: [
        { name: '権藤', count: 3 },
        { name: '寺町', count: 2 },
        { name: '浦上', count: 2 },
        { name: '山田', count: 1 },
        { name: '工藤', count: 0 },
      ],
      sales_mix: {
        existing_sales: 2240000,
        new_sales: 960000,
        existing_rate: 70,
        new_rate: 30,
      },
    });
    setIsLoading(false);
  }, [period, granularity, selectedDept, selectedUser]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

const handleDownload = () => {
  // ============================================
  // 🚨 朱さんへ：差し替えが必要な箇所です
  // --------------------------------------------
  // 現在はデモ用のダミーCSVを出力しています。
  // 本番稼働時は以下のコメントアウトを外して、
  // ダミーデータ部分を削除してください🙏
  //
  // 差し替え後のコード↓
  // window.open('/api/export/deals', '_blank');
  // ============================================

  const headers = ['案件名', '担当者', '部署', '金額', 'ステータス', '日付'];
  const rows = [
    ['案件A', '権藤', '東京営業', '1200000', '受注', '2026-03-01'],
    ['案件B', '寺町', '高槻営業', '800000', '提案中', '2026-03-02'],
    ['案件C', '浦上', '東京営業', '500000', '受注', '2026-03-03'],
    ['案件D', '山田', '高槻営業', '300000', '失注', '2026-03-04'],
    ['案件E', '小山', '北浜営業', '400000', '提案中', '2026-03-05'],
  ];
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'deals_demo.csv';
  a.click();
  URL.revokeObjectURL(url);
};


  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-zinc-900">KPI ダッシュボード</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <Download className="h-4 w-4" />
              CSV出力
            </button>
            <button
              onClick={() => navigate('/deals/new')}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <PlusCircle className="h-4 w-4" />
              新規案件入力
            </button>
            <span className="text-sm text-zinc-600">{user?.name ?? 'ゲスト'}</span>
            <button onClick={handleLogout} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 text-zinc-500">
            <Filter className="h-4 w-4" />
            <span className="text-sm font-medium">絞り込み</span>
          </div>

          {/* Period */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-zinc-400" />
            <select
              value={period}
              onChange={e => setPeriod(e.target.value as Period)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
            >
              <option value="daily">日次</option>
              <option value="weekly">週次</option>
              <option value="monthly">月次</option>
              <option value="yearly">年次</option>
            </select>
          </div>

          {/* Granularity */}
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-zinc-400" />
            <select
              value={granularity}
              onChange={e => {
                setGranularity(e.target.value as Granularity);
                setSelectedDept('');
                setSelectedUser('');
              }}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
            >
              <option value="all">全体</option>
              <option value="department">部署別</option>
              <option value="individual">個人</option>
            </select>
          </div>

          {/* Department select */}
          {granularity === 'department' && (
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-zinc-400" />
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
              >
                <option value="">部署を選択</option>
                <optgroup label="①東京営業部">
                  <option value="①東京営業部">①東京営業部全体</option>
                  <option value="東京営業">東京営業</option>
                </optgroup>
                <optgroup label="②大阪営業部">
                  <option value="②大阪営業部">②大阪営業部全体</option>
                  <option value="高槻営業">高槻営業</option>
                  <option value="北浜営業">北浜営業</option>
                </optgroup>
              </select>
            </div>
          )}

          {/* Individual select */}
          {granularity === 'individual' && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-400" />
              <select
                value={selectedUser}
                onChange={e => setSelectedUser(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
              >
                <option value="">担当者を選択</option>
                {TEAMS.map(team => (
                  <optgroup key={team.key} label={team.label}>
                    {users
                      .filter(u => u.team === team.key)
                      .map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
        </motion.div>

        {/* KPI Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-500">予算達成率</p>
            <p className="mt-2 text-3xl font-bold text-indigo-600">{data?.budget.achievement_rate ?? 0}%</p>
            <p className="mt-1 text-xs text-zinc-400">¥{(data?.budget.sales ?? 0).toLocaleString()} / ¥{(data?.budget.budget ?? 0).toLocaleString()}</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-500">総売上</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">¥{(data?.sales.sales ?? 0).toLocaleString()}</p>
            <p className="mt-1 text-xs text-zinc-400">前期比 +{data?.sales.change_rate ?? 0}%</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-xl bg-white p-6 shadow-sm">
            <p className="text-sm text-zinc-500">パイプライン</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">{data?.pipeline.proposal_count ?? 0}件</p>
            <p className="mt-1 text-xs text-zinc-400">受注 {data?.pipeline.won_count ?? 0}件 / 成約率 {data?.pipeline.conversion_rate ?? 0}%</p>
          </motion.div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-zinc-800">営業成績ランキング</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={data?.proposal_ranking ?? []} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={48} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-zinc-800">既存 vs 新規</h2>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={[
                    { name: '既存', value: data?.sales_mix.existing_sales ?? 0 },
                    { name: '新規', value: data?.sales_mix.new_sales ?? 0 },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {COLORS.map((color, i) => <Cell key={i} fill={color} />)}
                </Pie>
                <Legend />
                <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
