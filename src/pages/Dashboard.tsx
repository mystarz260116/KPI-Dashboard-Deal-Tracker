import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { KPIData, Granularity, Period } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import {
  LayoutDashboard, PlusCircle, Filter, Calendar, Users,
  TrendingUp, Target, LogOut, Download
} from 'lucide-react';
import { motion } from 'motion/react';
import logoImg from '../assets/M.png';

interface User {
  id: string;
  name: string;
  department: string;
  team: string;
}

const COLORS = ['#6366f1', '#10b981'];

const TEAMS = [
  { dept: '①東京営業部', team: '東京営業' },
  { dept: '②大阪営業部', team: '高槻営業' },
  { dept: '②大阪営業部', team: '北浜営業' },
];

const DEPARTMENTS = ['①東京営業部', '②大阪営業部'];

interface SectionTitleProps { title: string; color: string; }
function SectionTitle({ title, color }: SectionTitleProps) {
  return (
    <h2 className="mb-4 text-lg font-bold text-zinc-800 pb-2 border-b-2" style={{ borderColor: color }}>
      {title}
    </h2>
  );
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>('monthly');
  const [granularity, setGranularity] = useState<Granularity>('all');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [data, setData] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // TODO: replace with /api/users
    setUsers([
      { id: '1',  name: '権藤',  department: '①東京営業部', team: '東京営業' },
      { id: '2',  name: '浦上',  department: '①東京営業部', team: '東京営業' },
      { id: '3',  name: '井出',  department: '①東京営業部', team: '東京営業' },
      { id: '4',  name: '茂田',  department: '①東京営業部', team: '東京営業' },
      { id: '5',  name: '熊木',  department: '①東京営業部', team: '東京営業' },
      { id: '6',  name: '山口',  department: '①東京営業部', team: '東京営業' },
      { id: '7',  name: '小野寺',department: '①東京営業部', team: '東京営業' },
      { id: '8',  name: '工藤',  department: '①東京営業部', team: '東京営業' },
      { id: '9',  name: '寺町',  department: '②大阪営業部', team: '高槻営業' },
      { id: '10', name: '今井',  department: '②大阪営業部', team: '高槻営業' },
      { id: '11', name: '阪本',  department: '②大阪営業部', team: '高槻営業' },
      { id: '12', name: '熊懐',  department: '②大阪営業部', team: '高槻営業' },
      { id: '13', name: '川合',  department: '②大阪営業部', team: '高槻営業' },
      { id: '14', name: '山田',  department: '②大阪営業部', team: '高槻営業' },
      { id: '15', name: '松井',  department: '②大阪営業部', team: '北浜営業' },
      { id: '16', name: '平',    department: '②大阪営業部', team: '北浜営業' },
      { id: '17', name: '宮川',  department: '②大阪営業部', team: '北浜営業' },
      { id: '18', name: '小山',  department: '②大阪営業部', team: '北浜営業' },
      { id: '19', name: '竹内',  department: '②大阪営業部', team: '北浜営業' },
      { id: '20', name: '中澤',  department: '②大阪営業部', team: '北浜営業' },
      { id: '21', name: '枡田',  department: '②大阪営業部', team: '北浜営業' },
      { id: '22', name: '藤丸',  department: '②大阪営業部', team: '北浜営業' },
      { id: '23', name: '中西',  department: '②大阪営業部', team: '北浜営業' },
      { id: '24', name: '片山',  department: '②大阪営業部', team: '北浜営業' },
      { id: '25', name: '山本',  department: '②大阪営業部', team: '北浜営業' },
    ]);

    // TODO: replace with /api/kpi?period=...&granularity=...
    setData({
      budget: { sales: 3200000, budget: 4000000, achievement_rate: 80 },
      sales: { sales: 3200000, prev_sales: 2800000, change_rate: 14.3 },
      visit_ranking: [
        { name: '権藤',   count: 12 },
        { name: '寺町',   count: 10 },
        { name: '浦上',   count: 8  },
        { name: '山田',   count: 7  },
        { name: '工藤',   count: 5  },
      ],
      won_ranking: [
        { name: '権藤',   count: 3 },
        { name: '寺町',   count: 2 },
        { name: '浦上',   count: 2 },
        { name: '山田',   count: 1 },
        { name: '工藤',   count: 0 },
      ],
      conversion_rate: 33.3,
      avg_order_value: 400000,
      new_orders: [
        { clinic: '山田歯科医院',       sales: '権藤'  },
        { clinic: 'さくら歯科',         sales: '寺町'  },
        { clinic: '東京歯科クリニック', sales: '浦上'  },
        { clinic: 'ほほえみ歯科',       sales: '山田'  },
        { clinic: 'スマイル歯科医院',   sales: '工藤'  },
      ],
    });
    setIsLoading(false);
  }, [period, granularity, selectedDept, selectedUser]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleDownload = () => {
    // Demo CSV – replace with window.open('/api/export/deals', '_blank') in production
    const headers = ['案件名','担当者','部署','金額','ステータス','日付'];
    const rows = [
      ['案件A','権藤','東京営業','1200000','受注','2026-03-01'],
      ['案件B','寺町','高槻営業','800000','提案中','2026-03-02'],
      ['案件C','浦上','東京営業','500000','受注','2026-03-03'],
      ['案件D','山田','高槻営業','300000','失注','2026-03-04'],
      ['案件E','小山','北浜営業','400000','提案中','2026-03-05'],
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
    <div className="min-h-screen bg-zinc-200">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Mystarz" className="h-8 w-auto object-contain" />
            <h1 className="text-xl font-bold text-zinc-900">KPI ダッシュボード</h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleDownload}
              className="flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              <Download className="h-4 w-4" />CSV出力
            </button>

<button onClick={() => navigate('/deals/history')}
  className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
  <TrendingUp className="h-4 w-4" />商談履歴
</button>

            <button onClick={() => navigate('/deals/new')}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              <PlusCircle className="h-4 w-4" />新規案件入力
            </button>
            <span className="text-sm text-zinc-600">{user?.name ?? 'ゲスト'}</span>
            <button onClick={handleLogout} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Filters */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500">
            <Filter className="h-4 w-4" />
            <span className="text-sm font-medium">絞り込み</span>
          </div>

          {/* Period */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-zinc-400" />
            <select value={period} onChange={e => setPeriod(e.target.value as Period)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm">
              <option value="daily">日次</option>
              <option value="weekly">週次</option>
              <option value="monthly">月次</option>
            </select>
          </div>

          {/* Granularity */}
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-zinc-400" />
            <select value={granularity} onChange={e => {
              setGranularity(e.target.value as Granularity);
              setSelectedDept('');
              setSelectedUser('');
            }} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm">
              <option value="all">全体</option>
              <option value="department">部署</option>
              <option value="individual">個人</option>
            </select>
          </div>

          {/* Department select */}
          {granularity === 'department' && (
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-zinc-400" />
              <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm">
                <option value="">部署を選択</option>
                {DEPARTMENTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
                <option value="東京営業">東京営業</option>
                <option value="高槻営業">高槻営業</option>
                <option value="北浜営業">北浜営業</option>
              </select>
            </div>
          )}

          {/* Individual select */}
          {granularity === 'individual' && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-zinc-400" />
              <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm">
                <option value="">担当者を選択</option>
                {TEAMS.map(t => (
                  <optgroup key={t.team} label={`${t.dept}・${t.team}`}>
                    {users.filter(u => u.team === t.team).map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
        </motion.div>

        {/* Row 1: 予算達成率 + 売上合計 */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="rounded-xl bg-white p-6 shadow-sm">
            <SectionTitle title="予算達成率" color="#6366f1" />
            <p className="text-4xl font-bold text-indigo-600">{data?.budget.achievement_rate ?? 0}%</p>
            <p className="mt-2 text-sm text-zinc-500">
              売上：¥{(data?.budget.sales ?? 0).toLocaleString()} ／ 予算：¥{(data?.budget.budget ?? 0).toLocaleString()}
            </p>
            <div className="mt-4 h-3 w-full rounded-full bg-zinc-100">
              <div className="h-3 rounded-full bg-indigo-500"
                style={{ width: `${Math.min(data?.budget.achievement_rate ?? 0, 100)}%` }} />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-xl bg-white p-6 shadow-sm">
            <SectionTitle title="売上合計" color="#10b981" />
            <p className="text-4xl font-bold text-emerald-600">¥{(data?.sales.sales ?? 0).toLocaleString()}</p>
            <p className="mt-2 text-sm text-zinc-500">前期間比 +{data?.sales.change_rate ?? 0}%</p>
          </motion.div>
        </div>

        {/* Row 2: 開拓転換率 + 受注単価 */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="rounded-xl bg-white p-6 shadow-sm">
            <SectionTitle title="開拓転換率" color="#f59e0b" />
            <p className="text-4xl font-bold text-amber-500">{data?.conversion_rate ?? 0}%</p>
            <p className="mt-2 text-sm text-zinc-500">訪問件数 ÷ 受注件数</p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="rounded-xl bg-white p-6 shadow-sm">
            <SectionTitle title="受注単価 / 医院" color="#ec4899" />
            <p className="text-4xl font-bold text-pink-500">¥{(data?.avg_order_value ?? 0).toLocaleString()}</p>
            <p className="mt-2 text-sm text-zinc-500">受注金額 ÷ 受注件数</p>
          </motion.div>
        </div>

        {/* Row 3: ランキング2つ */}
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="rounded-xl bg-white p-6 shadow-sm">
            <SectionTitle title="営業別訪問数ランキング" color="#6366f1" />
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.visit_ranking ?? []} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={48} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            className="rounded-xl bg-white p-6 shadow-sm">
            <SectionTitle title="営業別新規受注数ランキング" color="#10b981" />
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data?.won_ranking ?? []} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={48} />
                <Tooltip />
                <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* Row 4: 新規受注先一覧 */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
          className="rounded-xl bg-white p-6 shadow-sm">
          <SectionTitle title="新規受注先一覧" color="#8b5cf6" />
          <div className="overflow-auto max-h-64">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500">
                  <th className="pb-2 font-medium">医院名</th>
                  <th className="pb-2 font-medium">営業担当</th>
                </tr>
              </thead>
              <tbody>
                {(data?.new_orders ?? []).map((o: any, i: number) => (
                  <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="py-2 text-indigo-600 font-medium">{o.clinic}</td>
                    <td className="py-2 text-zinc-700">{o.sales}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
