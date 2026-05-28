import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../lib/authFetch';
import { toDateString } from '../lib/dateUtils';
import {
  Activity, ArrowLeft, CalendarDays, Loader2, LogOut, Medal, PieChart as PieChartIcon,
  Target, TrendingUp, Users,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

type PerformancePeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

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

type PerformanceData = {
  period: PerformancePeriod;
  from: string;
  to: string;
  summary: {
    total_deals: number;
    new_deals: number;
    existing_deals: number;
    total_won: number;
    new_won: number;
    existing_won: number;
    overdue_next_actions: number;
    upcoming_next_actions: number;
  };
  rankings: Array<{
    user_id: string;
    name: string;
    department: string;
    total_count: number;
    new_count: number;
    existing_count: number;
    won_count: number;
  }>;
  usage_members: Array<{
    user_id: string;
    name: string;
    department: string;
    last_login_at: string | null;
    login_count: number;
    deal_view_count: number;
  }>;
  temperature_portfolio: Array<{
    key: string;
    label: string;
    count: number;
  }>;
  phase_distribution: Array<{
    key: string;
    label: string;
    count: number;
  }>;
  action_distribution: Array<{
    label: string;
    count: number;
  }>;
};

function formatUsageDateTime(value: string | null) {
  if (!value) return '未ログイン';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未ログイン';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const PORTFOLIO_COLORS: Record<string, string> = {
  A: '#7c3aed',
  B: '#0284c7',
  C: '#d4d4d8',
  D: '#fffbeb',
  E: '#fecdd3',
  未設定: '#e2e8f0',
};

function getDefaultDateRange(period: PerformancePeriod) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'daily') {
    return {
      from: toDateString(today),
      to: toDateString(today),
    };
  }

  if (period === 'weekly') {
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(today);
    start.setDate(start.getDate() + diffToMonday);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return {
      from: toDateString(start),
      to: toDateString(end),
    };
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return {
    from: toDateString(start),
    to: toDateString(end),
  };
}

function SummaryCard({
  title,
  value,
  subLabel,
  accentClassName,
}: {
  title: string;
  value: string;
  subLabel: string;
  accentClassName: string;
}) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold text-zinc-500">{title}</p>
      <p className={`mt-3 text-4xl font-black ${accentClassName}`}>{value}</p>
      <p className="mt-3 text-sm text-zinc-500">{subLabel}</p>
    </div>
  );
}

export default function SalesPerformanceDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<PerformancePeriod>('monthly');
  const defaultRange = getDefaultDateRange(period);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [appliedPeriod, setAppliedPeriod] = useState<PerformancePeriod>('monthly');
  const [appliedFromDate, setAppliedFromDate] = useState(defaultRange.from);
  const [appliedToDate, setAppliedToDate] = useState(defaultRange.to);
  const [appliedDepartmentId, setAppliedDepartmentId] = useState('');
  const [appliedUserId, setAppliedUserId] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [data, setData] = useState<PerformanceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const nextRange = getDefaultDateRange(period);
    setFromDate(nextRange.from);
    setToDate(nextRange.to);
  }, [period]);

  useEffect(() => {
    if (user && user.can_view_dashboard === false) {
      navigate('/deals/new', { replace: true });
    }
  }, [navigate, user]);

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
      } catch (loadError) {
        console.error('sales performance filters error:', loadError);
      }
    };

    loadFilters();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          path: 'sales-performance',
          period: appliedPeriod,
          from: appliedFromDate,
          to: appliedToDate,
        });

        if (appliedDepartmentId) {
          params.set('departmentId', appliedDepartmentId);
        }

        if (appliedUserId) {
          params.set('userId', appliedUserId);
        }

        const response = await authFetch(`/api/kpi?${params.toString()}`);
        if (!response.ok) {
          throw new Error('sales performance fetch failed');
        }

        const payload = await response.json();
        setData(payload);
      } catch (loadError) {
        console.error('sales performance dashboard error:', loadError);
        setError('営業パフォーマンスボードの取得に失敗しました');
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [appliedDepartmentId, appliedFromDate, appliedPeriod, appliedToDate, appliedUserId]);

  const handleApplyFilters = () => {
    setAppliedPeriod(period);
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    setAppliedDepartmentId(selectedDepartmentId);
    setAppliedUserId(selectedUserId);
  };

  const scopedUsers = useMemo(() => (
    selectedDepartmentId
      ? users.filter((entry) => String(entry.department_id ?? '') === selectedDepartmentId)
      : users
  ), [selectedDepartmentId, users]);
  const sortedDepartments = useMemo(
    () => [...departments].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [departments]
  );
  const sortedScopedUsers = useMemo(
    () => [...scopedUsers].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [scopedUsers]
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const rankingChartHeight = Math.max((data?.rankings?.length ?? 0) * 44, 320);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#eef2f7] p-4 sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            ダッシュボード
          </button>
          <h1 className="text-2xl font-black text-zinc-900">営業パフォーマンス</h1>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl bg-white p-3 text-zinc-400 shadow-sm transition hover:text-zinc-700"
            aria-label="ログアウト"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-2 rounded-2xl bg-zinc-50 p-1">
                {([
                  { value: 'daily', label: '日次' },
                  { value: 'weekly', label: '週次' },
                  { value: 'monthly', label: '月次' },
                  { value: 'custom', label: '特定期間' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPeriod(option.value)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      period === option.value
                        ? 'bg-zinc-900 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2">
                <CalendarDays className="h-4 w-4 text-zinc-400" />
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="rounded-lg bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
                />
                <span className="text-sm text-zinc-400">〜</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="rounded-lg bg-white px-3 py-2 text-sm text-zinc-700 outline-none"
                />
              </div>

              <div className="flex min-w-[240px] items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2">
                <Target className="h-4 w-4 text-zinc-400" />
                <select
                  value={selectedDepartmentId}
                  onChange={(event) => {
                    setSelectedDepartmentId(event.target.value);
                    setSelectedUserId('');
                  }}
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

              <div className="flex min-w-[280px] items-center gap-2 rounded-2xl bg-zinc-50 px-3 py-2">
                <Users className="h-4 w-4 text-zinc-400" />
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-zinc-700 outline-none"
                >
                  <option value="">個人すべて</option>
                  {sortedScopedUsers.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}（{entry.department ?? ''}）
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleApplyFilters}
                className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
              >
                反映
              </button>
            </div>

            <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
              集計期間: <span className="font-semibold text-zinc-800">{data?.from} 〜 {data?.to}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="商談数"
            value={String(data?.summary.total_deals ?? 0)}
            subLabel={`新規 ${data?.summary.new_deals ?? 0} / 既存 ${data?.summary.existing_deals ?? 0}`}
            accentClassName="text-indigo-600"
          />
          <SummaryCard
            title="受注数"
            value={String(data?.summary.total_won ?? 0)}
            subLabel={`新規 ${data?.summary.new_won ?? 0} / 既存 ${data?.summary.existing_won ?? 0}`}
            accentClassName="text-emerald-600"
          />
          <SummaryCard
            title="次回アクション期限切れ"
            value={String(data?.summary.overdue_next_actions ?? 0)}
            subLabel={`7日以内の予定 ${data?.summary.upcoming_next_actions ?? 0}`}
            accentClassName="text-rose-600"
          />
          <SummaryCard
            title="新規比率"
            value={`${data?.summary.total_deals ? Math.round(((data.summary.new_deals / data.summary.total_deals) * 100)) : 0}%`}
            subLabel="商談全体に占める新規割合"
            accentClassName="text-amber-500"
          />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Medal className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-zinc-900">担当者別商談数ランキング</h2>
            </div>
            <div className="max-h-[620px] overflow-y-auto pr-2">
              <ResponsiveContainer width="100%" height={rankingChartHeight}>
                <BarChart
                  data={data?.rankings ?? []}
                  layout="vertical"
                  margin={{ top: 10, right: 20, left: 20, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={120} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="new_count" stackId="deals" fill="#6366f1" name="新規" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="existing_count" stackId="deals" fill="#10b981" name="既存" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-bold text-zinc-900">商談温度ポートフォリオ</h2>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data?.temperature_portfolio ?? []}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={2}
                >
                  {(data?.temperature_portfolio ?? []).map((entry) => (
                    <Cell key={entry.key} fill={PORTFOLIO_COLORS[entry.key] ?? '#cbd5e1'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
              {(data?.temperature_portfolio ?? []).map((entry) => (
                <div key={entry.key} className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: PORTFOLIO_COLORS[entry.key] ?? '#cbd5e1' }}
                  />
                  <span>{entry.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-cyan-600" />
              <h2 className="text-lg font-bold text-zinc-900">フェーズ別件数</h2>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.phase_distribution ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#06b6d4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-amber-600" />
              <h2 className="text-lg font-bold text-zinc-900">実行アクション別件数</h2>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.action_distribution ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-zinc-900">受注ランキング</h2>
            </div>
            <div className="max-h-[620px] space-y-3 overflow-y-auto pr-2">
              {(data?.rankings ?? []).map((entry, index) => (
                <div key={entry.user_id} className="flex items-center justify-between rounded-2xl bg-zinc-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-zinc-900">{index + 1}. {entry.name}</p>
                    <p className="text-xs text-zinc-500">{entry.department || '部署未設定'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-emerald-600">{entry.won_count}</p>
                    <p className="text-[11px] text-zinc-500">受注</p>
                  </div>
                </div>
              ))}
              {(data?.rankings?.length ?? 0) === 0 && (
                <div className="rounded-2xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-400">
                  データがありません
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-lg font-bold text-zinc-900">活用状況</h2>
              <p className="text-sm text-zinc-500">ログイン状況と商談閲覧状況を確認できます</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-zinc-500">
                  <th className="px-4 py-3 font-semibold">名前</th>
                  <th className="px-4 py-3 font-semibold">部署</th>
                  <th className="px-4 py-3 font-semibold">最終ログイン</th>
                  <th className="px-4 py-3 font-semibold">ログイン回数</th>
                  <th className="px-4 py-3 font-semibold">商談閲覧件数</th>
                </tr>
              </thead>
              <tbody>
                {(data?.usage_members ?? []).map((entry) => (
                  <tr key={entry.user_id} className="border-b border-zinc-50 text-zinc-700">
                    <td className="px-4 py-4 font-bold text-zinc-900">{entry.name}</td>
                    <td className="px-4 py-4">{entry.department || '部署未設定'}</td>
                    <td className="px-4 py-4">{formatUsageDateTime(entry.last_login_at)}</td>
                    <td className="px-4 py-4 font-semibold text-zinc-900">{entry.login_count}回</td>
                    <td className={`px-4 py-4 font-semibold ${entry.deal_view_count > 0 ? 'text-indigo-600' : 'text-zinc-400'}`}>
                      {entry.deal_view_count}件
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
