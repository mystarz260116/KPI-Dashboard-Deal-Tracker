import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../lib/authFetch';
import {
  ArrowDownRight, ArrowLeft, ArrowUpRight, Building2, CalendarDays, Download,
  Loader2, LogOut, Search, Target, TrendingDown, TrendingUp, Users,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

type AssetPeriod = '3m' | '6m' | '12m';
type ImportDataKind = 'delivery' | 'order';

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

type ClinicAssetData = {
  period: AssetPeriod;
  data_kind: ImportDataKind;
  month: string;
  from: string;
  to: string;
  months: Array<{ key: string; label: string }>;
  summary: {
    sales_total: number;
    budget_total: number;
    budget_rate: number;
    previous_year_total: number;
    year_over_year_delta: number;
    churn_rate: number;
    churn_clinic_count: number;
    base_clinic_count: number;
    active_clinic_count: number;
    new_order_amount: number;
  };
  rows: Array<{
    user_id: string | null;
    user_name: string;
    department_id: number | null;
    customer_code: string;
    customer_name: string;
    previous_year_total: number;
    three_month_average: number;
    total: number;
    year_over_year_delta: number;
    new_order_amount: number;
    is_new: boolean;
    is_churn_risk: boolean;
    monthly: Array<{ month: string; amount: number }>;
  }>;
  filter_options?: {
    users: UserOption[];
    departments: DepartmentOption[];
  };
  debug?: {
    endpoint: string;
    totalMs: number;
    steps: Array<{
      stage: string;
      ms: number;
      totalMs: number;
      rows?: number;
      detail?: Record<string, unknown>;
    }>;
    counts?: Record<string, number>;
  };
};

type ClinicAssetsFetchResult = {
  payload: ClinicAssetData;
  status: number;
  networkMs: number;
};

const clinicAssetsFetchInFlight = new Map<string, Promise<ClinicAssetsFetchResult>>();
const CLINIC_ASSETS_TIMEOUT_MS = 30_000;

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrency(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return `¥${Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString()}`;
}

function formatSignedCurrency(value: number | null | undefined) {
  const amount = Math.round(Number(value ?? 0));
  if (amount > 0) return `+¥${amount.toLocaleString()}`;
  if (amount < 0) return `-¥${Math.abs(amount).toLocaleString()}`;
  return '¥0';
}

function SummaryPanel({
  title,
  value,
  detail,
  tone,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  tone: 'indigo' | 'emerald' | 'rose' | 'amber';
  icon: ReactNode;
}) {
  const toneClass = {
    indigo: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
  }[tone];

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold text-zinc-500">{title}</p>
        <div className={`rounded-lg p-2 ${toneClass}`}>{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-black tracking-normal text-zinc-950">{value}</p>
      <p className="mt-2 text-sm text-zinc-500">{detail}</p>
    </div>
  );
}

export default function ClinicAssetsDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<AssetPeriod>('3m');
  const [targetMonth, setTargetMonth] = useState(getCurrentMonth);
  const [dataKind, setDataKind] = useState<ImportDataKind>('delivery');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [appliedPeriod, setAppliedPeriod] = useState<AssetPeriod>('3m');
  const [appliedTargetMonth, setAppliedTargetMonth] = useState(getCurrentMonth);
  const [appliedDataKind, setAppliedDataKind] = useState<ImportDataKind>('delivery');
  const [appliedDepartmentId, setAppliedDepartmentId] = useState('');
  const [appliedUserId, setAppliedUserId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [data, setData] = useState<ClinicAssetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && user.can_view_dashboard === false) {
      navigate('/deals/new', { replace: true });
    }
  }, [navigate, user]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          path: 'clinic-assets',
          period: appliedPeriod,
          month: appliedTargetMonth,
          data_kind: appliedDataKind,
        });

        if (appliedDepartmentId) params.set('departmentId', appliedDepartmentId);
        if (appliedUserId) params.set('userId', appliedUserId);

        const requestStart = performance.now();
        const requestUrl = `/api/kpi?${params.toString()}`;
        const requestKey = params.toString();
        const existingRequest = clinicAssetsFetchInFlight.get(requestKey);
        if (existingRequest) {
          console.info(`[perf] clinic-assets reused in-flight request key=${requestKey}`);
        }

        const requestPromise = existingRequest ?? (async () => {
          console.info(`[debug] clinic-assets request start ${requestUrl}`);
          const progressTimer = window.setInterval(() => {
            const elapsedMs = performance.now() - requestStart;
            console.info(`[debug] clinic-assets still loading ${elapsedMs.toFixed(0)}ms`);
          }, 1000);
          const abortController = new AbortController();
          const timeoutId = window.setTimeout(() => {
            abortController.abort();
          }, CLINIC_ASSETS_TIMEOUT_MS);

          try {
            const response = await authFetch(requestUrl, {
              cache: 'no-store',
              signal: abortController.signal,
            });
            const networkMs = performance.now() - requestStart;
            console.info(`[debug] clinic-assets response status=${response.status} elapsed=${networkMs.toFixed(1)}ms`);
            if (!response.ok) {
              throw new Error('clinic assets fetch failed');
            }

            return {
              payload: await response.json(),
              status: response.status,
              networkMs,
            };
          } catch (fetchError: any) {
            if (abortController.signal.aborted) {
              throw new Error(`clinic assets fetch timed out after ${CLINIC_ASSETS_TIMEOUT_MS}ms`);
            }
            throw fetchError;
          } finally {
            window.clearInterval(progressTimer);
            window.clearTimeout(timeoutId);
            clinicAssetsFetchInFlight.delete(requestKey);
          }
        })();

        if (!existingRequest) {
          clinicAssetsFetchInFlight.set(requestKey, requestPromise);
        }

        const { payload, networkMs } = await requestPromise;
        if (cancelled) return;
        if (payload?.debug) {
          const debugSteps = (payload.debug.steps ?? []) as Array<{
            stage: string;
            ms: number;
            rows?: number;
          }>;
          const slowestSteps = [...debugSteps]
            .sort((a, b) => Number(b.ms ?? 0) - Number(a.ms ?? 0))
            .slice(0, 4)
            .map((step) => `${step.stage}:${Number(step.ms ?? 0).toFixed(0)}ms/${step.rows ?? '-'}rows`)
            .join(' | ');
          console.groupCollapsed(
            `[debug] clinic-assets api total=${networkMs.toFixed(1)}ms server=${Number(payload.debug.totalMs ?? 0).toFixed(0)}ms rows=${payload.rows?.length ?? 0}`
          );
          console.info(`[debug] clinic-assets slowest ${slowestSteps}`);
          console.table(debugSteps);
          console.info('[debug] clinic-assets counts', payload.debug.counts ?? {});
          console.groupEnd();
        }
        setUsers(Array.isArray(payload?.filter_options?.users) ? payload.filter_options.users : []);
        setDepartments(Array.isArray(payload?.filter_options?.departments) ? payload.filter_options.departments : []);
        setData(payload);
      } catch (loadError) {
        if (cancelled) return;
        console.error('clinic assets dashboard error:', loadError);
        setError('医院アセットの取得に失敗しました');
        setData(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [appliedDataKind, appliedDepartmentId, appliedPeriod, appliedTargetMonth, appliedUserId]);

  const sortedDepartments = useMemo(
    () => [...departments].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [departments]
  );
  const scopedUsers = useMemo(() => (
    selectedDepartmentId
      ? users.filter((entry) => String(entry.department_id ?? '') === selectedDepartmentId)
      : users
  ), [selectedDepartmentId, users]);
  const sortedScopedUsers = useMemo(
    () => [...scopedUsers].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    [scopedUsers]
  );
  const departmentNameById = useMemo(() => (
    new Map(departments.map((department) => [String(department.id), department.name]))
  ), [departments]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const rows = query
      ? (data?.rows ?? []).filter((row) => (
        row.customer_name.toLowerCase().includes(query)
        || row.customer_code.toLowerCase().includes(query)
        || row.user_name.toLowerCase().includes(query)
      ))
      : (data?.rows ?? []);

    if (appliedDepartmentId || appliedUserId) {
      return rows;
    }

    return [...rows].sort((a, b) => {
      const departmentA = departmentNameById.get(String(a.department_id ?? '')) ?? '部署未設定';
      const departmentB = departmentNameById.get(String(b.department_id ?? '')) ?? '部署未設定';
      return departmentA.localeCompare(departmentB, 'ja')
        || a.user_name.localeCompare(b.user_name, 'ja')
        || b.total - a.total
        || a.customer_name.localeCompare(b.customer_name, 'ja');
    });
  }, [appliedDepartmentId, appliedUserId, data?.rows, departmentNameById, searchQuery]);

  const chartData = useMemo(() => (
    (data?.months ?? []).map((month) => ({
      month: month.label,
      sales: (data?.rows ?? []).reduce((sum, row) => (
        sum + (row.monthly.find((entry) => entry.month === month.key)?.amount ?? 0)
      ), 0),
    }))
  ), [data]);

  const handleApplyFilters = () => {
    setAppliedPeriod(period);
    setAppliedTargetMonth(targetMonth);
    setAppliedDataKind(dataKind);
    setAppliedDepartmentId(selectedDepartmentId);
    setAppliedUserId(selectedUserId);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const downloadCsv = () => {
    if (!data) return;

    const header = [
      '担当者',
      '得意先コード',
      '得意先名',
      '前年同期間',
      '3か月平均',
      '合計',
      ...data.months.map((month) => month.label),
      '新規',
      'チャーン候補',
    ];
    const lines = filteredRows.map((row) => [
      row.user_name,
      row.customer_code,
      row.customer_name,
      row.previous_year_total,
      row.three_month_average,
      row.total,
      ...data.months.map((month) => row.monthly.find((entry) => entry.month === month.key)?.amount ?? 0),
      row.is_new ? '1' : '0',
      row.is_churn_risk ? '1' : '0',
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `clinic-assets-${data.from}-${data.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
          <div className="text-center">
            <h1 className="text-2xl font-black text-zinc-900">医院アセット</h1>
            <p className="mt-1 text-sm text-zinc-500">部署・担当別の医院売上資産を管理</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg bg-white p-3 text-zinc-400 shadow-sm transition hover:text-zinc-700"
            aria-label="ログアウト"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
                {([
                  { value: 'delivery', label: '納品' },
                  { value: 'order', label: '受注' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDataKind(option.value)}
                    className={`rounded-md px-4 py-2 text-sm font-bold transition ${
                      dataKind === option.value
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
                {([
                  { value: '3m', label: '3か月' },
                  { value: '6m', label: '6か月' },
                  { value: '12m', label: '12か月' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPeriod(option.value)}
                    className={`rounded-md px-4 py-2 text-sm font-bold transition ${
                      period === option.value
                        ? 'bg-zinc-900 text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2">
                <CalendarDays className="h-4 w-4 text-zinc-400" />
                <input
                  type="month"
                  value={targetMonth}
                  onChange={(event) => setTargetMonth(event.target.value)}
                  className="bg-transparent text-sm font-semibold text-zinc-700 outline-none"
                />
              </div>

              <div className="flex min-w-[220px] items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2">
                <Target className="h-4 w-4 text-zinc-400" />
                <select
                  value={selectedDepartmentId}
                  onChange={(event) => {
                    setSelectedDepartmentId(event.target.value);
                    setSelectedUserId('');
                  }}
                  className="w-full bg-transparent text-sm font-semibold text-zinc-700 outline-none"
                >
                  <option value="">部署すべて</option>
                  {sortedDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex min-w-[260px] items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2">
                <Users className="h-4 w-4 text-zinc-400" />
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className="w-full bg-transparent text-sm font-semibold text-zinc-700 outline-none"
                >
                  <option value="">担当すべて</option>
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
                className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-indigo-700"
              >
                反映
              </button>
            </div>

            <div className="rounded-lg bg-zinc-100 px-4 py-3 text-sm text-zinc-500">
              集計: <span className="font-bold text-zinc-900">{data?.from} 〜 {data?.to}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryPanel
            title="予算対比"
            value={`${data?.summary.budget_rate ?? 0}%`}
            detail={`${formatCurrency(data?.summary.sales_total)} / ${formatCurrency(data?.summary.budget_total)}`}
            tone="indigo"
            icon={<Target className="h-5 w-5" />}
          />
          <SummaryPanel
            title="チャーンレート"
            value={`${data?.summary.churn_rate ?? 0}%`}
            detail={`${data?.summary.churn_clinic_count ?? 0}件 / 基準 ${data?.summary.base_clinic_count ?? 0}件`}
            tone="rose"
            icon={<TrendingDown className="h-5 w-5" />}
          />
          <SummaryPanel
            title="新規受注金額"
            value={formatCurrency(data?.summary.new_order_amount)}
            detail={`稼働医院 ${data?.summary.active_clinic_count ?? 0}件`}
            tone="emerald"
            icon={<ArrowUpRight className="h-5 w-5" />}
          />
          <SummaryPanel
            title="前年差"
            value={formatSignedCurrency(data?.summary.year_over_year_delta)}
            detail={`前年 ${formatCurrency(data?.summary.previous_year_total)}`}
            tone={(data?.summary.year_over_year_delta ?? 0) < 0 ? 'amber' : 'emerald'}
            icon={(data?.summary.year_over_year_delta ?? 0) < 0 ? <ArrowDownRight className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
          />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.2fr]">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-zinc-900">医院資産サマリー</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-bold text-zinc-500">表示医院</p>
                <p className="mt-2 text-2xl font-black text-zinc-900">{filteredRows.length}</p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-bold text-zinc-500">新規医院</p>
                <p className="mt-2 text-2xl font-black text-emerald-600">
                  {filteredRows.filter((row) => row.is_new).length}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-bold text-zinc-500">チャーン候補</p>
                <p className="mt-2 text-2xl font-black text-rose-600">
                  {filteredRows.filter((row) => row.is_churn_risk).length}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4">
                <p className="text-xs font-bold text-zinc-500">平均医院売上</p>
                <p className="mt-2 text-2xl font-black text-zinc-900">
                  {formatCurrency(filteredRows.length > 0 ? (filteredRows.reduce((sum, row) => sum + row.total, 0) / filteredRows.length) : 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-cyan-600" />
              <h2 className="text-lg font-bold text-zinc-900">月別推移</h2>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 10000)}万`} width={56} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                <Bar dataKey="sales" name="売上" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-900">医院別アセット一覧</h2>
              <p className="mt-1 text-sm text-zinc-500">前年同期間・直近3か月平均・対象期間の月別金額を一覧できます</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2">
                <Search className="h-4 w-4 text-zinc-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="医院名・コード・担当者"
                  className="w-56 bg-transparent text-sm outline-none placeholder:text-zinc-400"
                />
              </div>
              <button
                type="button"
                onClick={downloadCsv}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
              >
                <Download className="h-4 w-4" />
                CSV
              </button>
            </div>
          </div>

          <div className="max-h-[680px] overflow-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-50 text-left text-xs font-bold uppercase tracking-normal text-zinc-500">
                <tr>
                  <th className="sticky left-0 z-20 min-w-[150px] border-b border-zinc-200 bg-zinc-50 px-4 py-3">担当者</th>
                  <th className="min-w-[110px] border-b border-zinc-200 px-4 py-3">得意先コード</th>
                  <th className="min-w-[260px] border-b border-zinc-200 px-4 py-3">得意先名</th>
                  <th className="min-w-[120px] border-b border-zinc-200 px-4 py-3 text-right">前年同期間</th>
                  <th className="min-w-[120px] border-b border-zinc-200 px-4 py-3 text-right">3か月平均</th>
                  <th className="min-w-[120px] border-b border-zinc-200 px-4 py-3 text-right">合計</th>
                  {(data?.months ?? []).map((month) => (
                    <th key={month.key} className="min-w-[110px] border-b border-zinc-200 px-4 py-3 text-right">
                      {month.label}
                    </th>
                  ))}
                  <th className="min-w-[92px] border-b border-zinc-200 px-4 py-3 text-center">状態</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={`${row.department_id ?? 'none'}-${row.customer_code}`}
                    className="group cursor-pointer text-zinc-700 hover:bg-indigo-50/50"
                    onClick={() => navigate(`/clinics/customer/${encodeURIComponent(row.customer_code)}`)}
                  >
                    <td className="sticky left-0 z-10 border-b border-zinc-100 bg-white px-4 py-3 font-bold text-zinc-900 group-hover:bg-indigo-50">
                      {row.user_name}
                    </td>
                    <td className="border-b border-zinc-100 px-4 py-3 font-mono text-xs text-zinc-500">{row.customer_code}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 font-bold text-zinc-900">{row.customer_name}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-right">{formatCurrency(row.previous_year_total)}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-right">{formatCurrency(row.three_month_average)}</td>
                    <td className="border-b border-zinc-100 px-4 py-3 text-right font-black text-zinc-950">{formatCurrency(row.total)}</td>
                    {(data?.months ?? []).map((month) => {
                      const amount = row.monthly.find((entry) => entry.month === month.key)?.amount ?? 0;
                      return (
                        <td key={month.key} className="border-b border-zinc-100 px-4 py-3 text-right">
                          <span className={amount > 0 ? 'font-semibold text-zinc-800' : 'text-zinc-300'}>
                            {amount > 0 ? formatCurrency(amount) : '-'}
                          </span>
                        </td>
                      );
                    })}
                    <td className="border-b border-zinc-100 px-4 py-3 text-center">
                      {row.is_new ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">新規</span>
                      ) : row.is_churn_risk ? (
                        <span className="rounded-full bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">要確認</span>
                      ) : (
                        <span className="text-xs text-zinc-400">既存</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={7 + (data?.months.length ?? 0)}
                      className="px-4 py-12 text-center text-sm text-zinc-400"
                    >
                      表示できる医院アセットがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
