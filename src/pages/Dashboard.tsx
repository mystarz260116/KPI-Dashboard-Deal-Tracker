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

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444'];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('month');
  const [granularity, setGranularity] = useState<Granularity>('all');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [users, setUsers] = useState<{ id: string; name: string; department: string }[]>([]);
  const [data, setData] = useState<KPIData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const departments = Array.from(new Set(users.map(u => u.department)));

  const handleDownload = () => {
    window.open('/api/export/deals', '_blank');
  };

  useEffect(() => {
    // 🚧 デモ用ダミーデータ（朱さんのAPI実装後に差し替え）
    setUsers([
      { id: '1', name: '田中', department: '①大阪営業部' },
      { id: '2', name: '山田', department: '①大阪営業部' },
      { id: '3', name: '佐藤', department: '②東京営業部' },
    ]);
    setData({
      budget: { sales: 3200000, budget: 4000000, achievement_rate: 80 },
      sales: { sales: 3200000, prev_sales: 2800000, change_rate: 14.3 },
      pipeline: { proposal_count: 24, won_count: 8, conversion_rate: 33.3 },
      proposal_ranking: [
        { name: '田中', count: 8 },
        { name: '山田', count: 6 },
        { name: '佐藤', count: 5 },
        { name: '鈴木', count: 3 },
        { name: '伊藤', count: 2 },
      ],
      won_ranking: [
        { name: '田中', count: 3 },
        { name: '山田', count: 2 },
        { name: '佐藤', count: 2 },
        { name: '鈴木', count: 1 },
        { name: '伊藤', count: 0 },
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

  if (!data) return null;

  const achievementRate = data.budget.achievement_rate;
  const conversionRate = data.pipeline.conversion_rate;

  const pieData = [
    { name: '既存売上', value: data.sales_mix.existing_sales },
    { name: '新規売上', value: data.sales_mix.new_sales },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 pb-12">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-zinc-900">Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV出力</span>
            </button>
            <button
              onClick={() => navigate('/deals/new')}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">商談を入力</span>
            </button>
            <div className="h-8 w-px bg-zinc-200" />
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-zinc-900">{user?.name}</p>
                <p className="text-xs text-zinc-500">{user?.department}</p>
              </div>
              <button 
                onClick={logout}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        {/* Filters */}
        <div className="mb-8 grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Calendar className="h-3 w-3" /> 期間
            </label>
            <div className="flex rounded-lg bg-zinc-100 p-1">
              {(['day', 'week', 'month'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                    period === p ? 'bg-white text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  {p === 'day' ? '日' : p === 'week' ? '週' : '月'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Users className="h-3 w-3" /> 表示粒度
            </label>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as Granularity)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">全体</option>
              <option value="department">部署</option>
              <option value="individual">個人</option>
            </select>
          </div>

          {granularity === 'department' && (
            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                部署選択
              </label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">選択してください</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}

          {granularity === 'individual' && (
            <div>
              <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                担当者選択
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              >
                <option value="">選択してください</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* KPI Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* 予算達成率 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-500">予算達成率</h3>
              <Target className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold text-zinc-900">
                {achievementRate.toFixed(1)}%
              </span>
              <span className="mb-1 text-sm text-zinc-500">達成</span>
            </div>
            <div className="mt-4 h-2 w-full rounded-full bg-zinc-100">
              <div 
                className="h-full rounded-full bg-indigo-600 transition-all duration-1000" 
                style={{ width: `${Math.min(achievementRate, 100)}%` }}
              />
            </div>
            <div className="mt-4 flex justify-between text-xs text-zinc-500">
              <span>売上: ¥{data.budget.sales.toLocaleString()}</span>
              <span>予算: ¥{data.budget.budget.toLocaleString()}</span>
            </div>
          </motion.div>

          {/* 売上合計 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-500">売上合計</h3>
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="text-4xl font-bold text-zinc-900">
              ¥{data.sales.sales.toLocaleString()}
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm text-emerald-600">
              <TrendingUp className="h-4 w-4" />
              <span>
                {data.sales.change_rate >= 0 ? '+' : ''}
                {data.sales.change_rate.toFixed(1)}%{' '}
                <span className="text-zinc-400 text-xs ml-1">前期間比</span>
              </span>
            </div>
          </motion.div>

          {/* 提案パイプライン */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-500">提案パイプライン</h3>
              <Filter className="h-5 w-5 text-amber-600" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-zinc-500">提案件数</p>
                <p className="text-2xl font-bold text-zinc-900">
                  {data.pipeline.proposal_count}件
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">受注件数</p>
                <p className="text-2xl font-bold text-zinc-900">
                  {data.pipeline.won_count}件
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-4">
              <span className="text-sm text-zinc-500">受注転換率</span>
              <span className="text-lg font-bold text-indigo-600">
                {conversionRate.toFixed(1)}%
              </span>
            </div>
          </motion.div>

          {/* 営業別受注数ランキング */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-2 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <h3 className="mb-6 text-sm font-semibold text-zinc-500">
              営業別受注数ランキング
            </h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.won_ranking} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{ fill: '#f4f4f5' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="count" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* 既存vs新規売上比率 */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <h3 className="mb-6 text-sm font-semibold text-zinc-500">
              既存 vs 新規売上比率
            </h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex justify-between text-xs text-zinc-500">
              <span>既存: ¥{data.sales_mix.existing_sales.toLocaleString()}</span>
              <span>新規: ¥{data.sales_mix.new_sales.toLocaleString()}</span>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}