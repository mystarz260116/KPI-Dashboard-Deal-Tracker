import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../lib/authFetch';
import {
  ArrowDownRight, ArrowLeft, ArrowUpDown, ArrowUpRight, Award, CalendarDays, CheckCircle2, Download,
  Loader2, LogOut, Search, Target, TrendingDown, TrendingUp, Users,
} from 'lucide-react';
import {
  Cell, Pie, PieChart, ResponsiveContainer, Tooltip,
} from 'recharts';

type AssetPeriod = '3m' | '6m' | '12m';
type ImportDataKind = 'delivery' | 'order';
type SortDirection = 'asc' | 'desc';
type TargetSalesFilter = '' | 'positive' | 'zero';
type SortKey =
  | 'user_name'
  | 'customer_code'
  | 'customer_name'
  | 'previous_year_total'
  | 'three_month_average'
  | 'total'
  | 'risk_state'
  | 'care_status'
  | 'next_care_date'
  | 'care_memo'
  | `month:${string}`;

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

type ClinicCareStatus = '未対応' | '訪問中' | '交渉中' | '応諾済み' | '受注';

type ClinicAssetRow = {
  user_id: string | null;
  user_name: string;
  external_staff_code: string | null;
  department_id: number | null;
  customer_code: string;
  customer_name: string;
  previous_year_total: number;
  previous_fiscal_total: number;
  three_month_average: number;
  total: number;
  year_over_year_delta: number;
  new_order_amount: number;
  is_new: boolean;
  is_churn_risk: boolean;
  monthly: Array<{ month: string; amount: number }>;
  ranking_insight: {
    reasons: string[];
    product_portfolio: Array<{ label: string; amount: number; share: number }>;
    ios_rental_enabled: boolean;
    ios_rental_start_date: string | null;
    order_count: number;
    average_order_amount: number;
  } | null;
  management: {
    status: ClinicCareStatus;
    next_action_date: string | null;
    memo: string;
    updated_at: string | null;
    updated_by: string | null;
  };
};

type ExcludedSalesRow = {
  reason: '得意先コードなし' | '担当紐付け漏れ' | '医院アセット対象外';
  month: string;
  department_id: number | null;
  department_name: string;
  external_staff_code: string;
  staff_name: string;
  customer_code: string;
  customer_name: string;
  amount: number;
  row_count: number;
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
    current_month_total: number;
    previous_year_total: number;
    previous_fiscal_total: number;
    year_over_year_delta: number;
    churn_rate: number;
    churn_clinic_count: number;
    base_clinic_count: number;
    active_clinic_count: number;
    new_order_amount: number;
  };
  rows: ClinicAssetRow[];
  excluded_sales?: {
    total_amount: number;
    total_groups: number;
    returned_groups: number;
    summary: Array<{
      reason: ExcludedSalesRow['reason'];
      amount: number;
      row_count: number;
    }>;
    rows: ExcludedSalesRow[];
  };
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
const CARE_STATUSES: ClinicCareStatus[] = ['未対応', '訪問中', '交渉中', '応諾済み', '受注'];
const RISK_FILTER_OPTIONS = ['新規', '離反', '危険', '減少注意', '成長', '維持'] as const;
const ATTENTION_RISK_LABELS = new Set(['離反', '危険', '減少注意']);
const CARE_STATUS_COLORS: Record<ClinicCareStatus, string> = {
  未対応: '#dc2626',
  訪問中: '#d97706',
  交渉中: '#0891b2',
  応諾済み: '#65a30d',
  受注: '#059669',
};
const DEFAULT_MANAGEMENT: ClinicAssetRow['management'] = {
  status: '未対応',
  next_action_date: null,
  memo: '',
  updated_at: null,
  updated_by: null,
};

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

function formatGrowthRate(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? '新規・復活' : '0%';
  const rate = ((current - previous) / previous) * 100;
  return `${rate >= 0 ? '+' : ''}${Math.round(rate)}%`;
}

function getRiskState(row: ClinicAssetRow, months: Array<{ key: string; label: string }>) {
  const recentMonths = months.slice(-3).map((month) => (
    row.monthly.find((entry) => entry.month === month.key)?.amount ?? 0
  ));
  const latestAmount = recentMonths.at(-1) ?? 0;
  const recentTwo = recentMonths.slice(-2);
  const allRecentZero = recentMonths.length > 0 && recentMonths.every((amount) => amount <= 0);
  const recentTwoZero = recentTwo.length >= 2 && recentTwo.every((amount) => amount <= 0);

  if (row.is_new) return { label: '新規', className: 'bg-emerald-50 text-emerald-700' };
  if (allRecentZero && (row.previous_year_total > 0 || row.three_month_average > 0)) {
    return { label: '離反', className: 'bg-rose-100 text-rose-800' };
  }
  if (recentTwoZero && (row.previous_year_total > 0 || row.three_month_average > 0)) {
    return { label: '危険', className: 'bg-red-50 text-red-700' };
  }
  if (row.three_month_average > 0 && latestAmount < row.three_month_average * 0.5) {
    return { label: '減少注意', className: 'bg-amber-50 text-amber-700' };
  }
  if (row.total > row.previous_year_total && row.previous_year_total > 0) {
    return { label: '成長', className: 'bg-cyan-50 text-cyan-700' };
  }
  return { label: '維持', className: 'bg-zinc-100 text-zinc-600' };
}

function getCareStatusClass(status: ClinicCareStatus) {
  if (status === '受注') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === '応諾済み') return 'border-lime-200 bg-lime-50 text-lime-700';
  if (status === '交渉中') return 'border-cyan-200 bg-cyan-50 text-cyan-700';
  if (status === '訪問中') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-rose-200 bg-rose-50 text-rose-700';
}

function normalizeManagement(row: ClinicAssetRow): ClinicAssetRow {
  return {
    ...row,
    management: {
      ...DEFAULT_MANAGEMENT,
      ...(row.management ?? {}),
      status: CARE_STATUSES.includes(row.management?.status)
        ? row.management.status
        : DEFAULT_MANAGEMENT.status,
    },
  };
}

function isNumericSortKey(key: SortKey) {
  return key === 'previous_year_total'
    || key === 'three_month_average'
    || key === 'total'
    || key.startsWith('month:');
}

function getSortValue(row: ClinicAssetRow, key: SortKey, months: Array<{ key: string; label: string }>) {
  if (key.startsWith('month:')) {
    const monthKey = key.replace('month:', '');
    return row.monthly.find((entry) => entry.month === monthKey)?.amount ?? 0;
  }

  if (key === 'risk_state') return getRiskState(row, months).label;
  if (key === 'care_status') return row.management?.status ?? DEFAULT_MANAGEMENT.status;
  if (key === 'next_care_date') return row.management?.next_action_date ?? '';
  if (key === 'care_memo') return row.management?.memo ?? '';
  if (key === 'total') return row.previous_fiscal_total;
  if (key === 'user_name') return `${row.external_staff_code ?? ''} ${row.user_name}`;
  return row[key];
}

function formatStaffName(row: ClinicAssetRow) {
  return row.user_name;
}

function parseStaffCode(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  const numericPrefix = normalized.match(/^\d+/)?.[0] ?? '';
  const numericValue = numericPrefix ? Number.parseInt(numericPrefix, 10) : Number.POSITIVE_INFINITY;

  return {
    normalized,
    numericValue: Number.isFinite(numericValue) ? numericValue : Number.POSITIVE_INFINITY,
  };
}

function compareStaffRows(a: ClinicAssetRow, b: ClinicAssetRow) {
  const staffA = parseStaffCode(a.external_staff_code);
  const staffB = parseStaffCode(b.external_staff_code);

  if (staffA.numericValue !== staffB.numericValue) {
    return staffA.numericValue - staffB.numericValue;
  }

  return staffA.normalized.localeCompare(staffB.normalized, 'ja', { numeric: true })
    || a.user_name.localeCompare(b.user_name, 'ja');
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

  const [targetMonth, setTargetMonth] = useState(getCurrentMonth);
  const [dataKind, setDataKind] = useState<ImportDataKind>('delivery');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
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
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const [tableFilters, setTableFilters] = useState<{
    staffKey: string;
    riskState: string;
    careStatus: string;
    targetSales: TargetSalesFilter;
  }>({
    staffKey: '',
    riskState: '',
    careStatus: '',
    targetSales: '',
  });

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
        setData({
          ...payload,
          rows: Array.isArray(payload?.rows) ? payload.rows.map(normalizeManagement) : [],
        });
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
  }, [appliedDataKind, appliedDepartmentId, appliedTargetMonth, appliedUserId]);

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
  const staffFilterOptions = useMemo(() => {
    const optionMap = new Map<string, ClinicAssetRow>();
    (data?.rows ?? []).forEach((row) => {
      const key = `${row.department_id ?? 'none'}:${row.external_staff_code ?? ''}:${row.user_id ?? row.user_name}`;
      if (!optionMap.has(key)) {
        optionMap.set(key, row);
      }
    });

    return [...optionMap.entries()]
      .map(([key, row]) => ({ key, row }))
      .sort((a, b) => {
        const departmentA = departmentNameById.get(String(a.row.department_id ?? '')) ?? '部署未設定';
        const departmentB = departmentNameById.get(String(b.row.department_id ?? '')) ?? '部署未設定';
        return departmentA.localeCompare(departmentB, 'ja')
          || compareStaffRows(a.row, b.row)
          || formatStaffName(a.row).localeCompare(formatStaffName(b.row), 'ja');
      });
  }, [data?.rows, departmentNameById]);
  const hasActiveTableFilters = Boolean(
    tableFilters.staffKey
    || tableFilters.riskState
    || tableFilters.careStatus
    || tableFilters.targetSales
  );
  const getTargetMonthAmount = (row: ClinicAssetRow) => (
    row.monthly.find((entry) => entry.month === data?.month)?.amount ?? 0
  );

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let rows = query
      ? (data?.rows ?? []).filter((row) => (
        row.customer_name.toLowerCase().includes(query)
        || row.customer_code.toLowerCase().includes(query)
        || row.user_name.toLowerCase().includes(query)
        || String(row.external_staff_code ?? '').toLowerCase().includes(query)
      ))
      : (data?.rows ?? []);

    if (tableFilters.staffKey) {
      rows = rows.filter((row) => (
        `${row.department_id ?? 'none'}:${row.external_staff_code ?? ''}:${row.user_id ?? row.user_name}` === tableFilters.staffKey
      ));
    }

    if (tableFilters.riskState) {
      rows = rows.filter((row) => getRiskState(row, data?.months ?? []).label === tableFilters.riskState);
    }

    if (tableFilters.careStatus) {
      rows = rows.filter((row) => (row.management?.status ?? DEFAULT_MANAGEMENT.status) === tableFilters.careStatus);
    }

    if (tableFilters.targetSales === 'positive') {
      rows = rows.filter((row) => getTargetMonthAmount(row) > 0);
    } else if (tableFilters.targetSales === 'zero') {
      rows = rows.filter((row) => getTargetMonthAmount(row) <= 0);
    }

    if (appliedDepartmentId || appliedUserId) {
      return rows;
    }

    return [...rows].sort((a, b) => {
      const departmentA = departmentNameById.get(String(a.department_id ?? '')) ?? '部署未設定';
      const departmentB = departmentNameById.get(String(b.department_id ?? '')) ?? '部署未設定';
      return departmentA.localeCompare(departmentB, 'ja')
        || compareStaffRows(a, b)
        || b.total - a.total
        || a.customer_name.localeCompare(b.customer_name, 'ja');
    });
  }, [
    appliedDepartmentId,
    appliedUserId,
    data?.month,
    data?.months,
    data?.rows,
    departmentNameById,
    searchQuery,
    tableFilters,
  ]);

  const attentionCareSummary = useMemo(() => {
    const riskCounts = new Map<string, number>();
    const targetRows = (data?.rows ?? []).filter((row) => {
      const label = getRiskState(row, data?.months ?? []).label;
      if (!ATTENTION_RISK_LABELS.has(label)) return false;
      riskCounts.set(label, (riskCounts.get(label) ?? 0) + 1);
      return true;
    });
    const counts = new Map<ClinicCareStatus, number>();
    targetRows.forEach((row) => {
      const status = row.management?.status ?? DEFAULT_MANAGEMENT.status;
      counts.set(status, (counts.get(status) ?? 0) + 1);
    });
    const chartRows = CARE_STATUSES
      .map((status) => ({
        status,
        value: counts.get(status) ?? 0,
        fill: CARE_STATUS_COLORS[status],
      }))
      .filter((entry) => entry.value > 0);
    const unresolvedCount = counts.get('未対応') ?? 0;

    return {
      total: targetRows.length,
      unresolvedCount,
      unresolvedRate: targetRows.length > 0
        ? Number(((unresolvedCount / targetRows.length) * 100).toFixed(1))
        : 0,
      riskRows: Array.from(ATTENTION_RISK_LABELS).map((status) => ({
        status,
        value: riskCounts.get(status) ?? 0,
      })),
      chartRows,
    };
  }, [data?.months, data?.rows]);
  const displayRows = useMemo(() => {
    if (!sortConfig) return filteredRows;

    return [...filteredRows].sort((a, b) => {
      if (sortConfig.key === 'user_name') {
        const staffDiff = compareStaffRows(a, b);
        if (staffDiff !== 0) {
          return staffDiff * (sortConfig.direction === 'asc' ? 1 : -1);
        }

        return a.customer_name.localeCompare(b.customer_name, 'ja');
      }

      const left = getSortValue(a, sortConfig.key, data?.months ?? []);
      const right = getSortValue(b, sortConfig.key, data?.months ?? []);
      const direction = sortConfig.direction === 'asc' ? 1 : -1;

      if (typeof left === 'number' || typeof right === 'number') {
        const diff = Number(left ?? 0) - Number(right ?? 0);
        if (diff !== 0) return diff * direction;
      } else {
        const diff = String(left ?? '').localeCompare(String(right ?? ''), 'ja');
        if (diff !== 0) return diff * direction;
      }

      return a.customer_name.localeCompare(b.customer_name, 'ja');
    });
  }, [data?.months, filteredRows, sortConfig]);

  const growthRankingRows = useMemo(() => {
    const targetMonth = data?.month;
    if (!targetMonth) return [];
    return (data?.rows ?? [])
      .map((row) => {
        const currentAmount = row.monthly.find((entry) => entry.month === targetMonth)?.amount ?? 0;
        const previousAmount = row.previous_year_total;
        const growthRate = previousAmount > 0
          ? (currentAmount - previousAmount) / previousAmount
          : currentAmount > 0 ? Number.POSITIVE_INFINITY : 0;
        return { row, currentAmount, previousAmount, growthRate };
      })
      .filter((entry) => entry.currentAmount > 0 && entry.growthRate > 0)
      .sort((a, b) => b.growthRate - a.growthRate || (b.currentAmount - b.previousAmount) - (a.currentAmount - a.previousAmount))
      .slice(0, 10);
  }, [data?.month, data?.rows]);

  const handleSort = (key: SortKey) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        return {
          key,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        };
      }

      return {
        key,
        direction: isNumericSortKey(key) ? 'desc' : 'asc',
      };
    });
  };

  const SortHeader = ({
    sortKey,
    children,
    className,
    align = 'left',
    sticky = false,
  }: {
    sortKey: SortKey;
    children: ReactNode;
    className: string;
    align?: 'left' | 'center' | 'right';
    sticky?: boolean;
  }) => {
    const active = sortConfig?.key === sortKey;
    const justifyClass = align === 'right'
      ? 'justify-end'
      : align === 'center'
        ? 'justify-center'
        : 'justify-start';

    return (
      <th className={`${className} ${sticky ? 'sticky left-0 z-20 bg-zinc-50' : ''}`}>
        <button
          type="button"
          onClick={() => handleSort(sortKey)}
          className={`flex w-full items-center gap-1 ${justifyClass} rounded-md text-inherit transition hover:text-zinc-900`}
        >
          <span>{children}</span>
          <ArrowUpDown className={`h-3.5 w-3.5 ${active ? 'text-indigo-600' : 'text-zinc-300'}`} />
          {active && (
            <span className="text-[10px] font-black text-indigo-600">
              {sortConfig.direction === 'asc' ? '↑' : '↓'}
            </span>
          )}
        </button>
      </th>
    );
  };

  const handleApplyFilters = () => {
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
      '前年同月',
      '3か月平均',
      '前会計期間合計',
      ...data.months.map((month) => month.label),
      '離反リスク',
      'ケア状況',
      '次回ケア日',
      'ケアメモ',
    ];
    const lines = displayRows.map((row) => [
      formatStaffName(row),
      row.customer_code,
      row.customer_name,
      row.previous_year_total,
      row.three_month_average,
      row.previous_fiscal_total,
      ...data.months.map((month) => row.monthly.find((entry) => entry.month === month.key)?.amount ?? 0),
      getRiskState(row, data.months).label,
      row.management.status,
      row.management.next_action_date ?? '',
      row.management.memo,
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/clinic-sales-trend')}
              className="rounded-lg bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700"
            >
              2医院の売上推移
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-white p-3 text-zinc-400 shadow-sm transition hover:text-zinc-700"
              aria-label="ログアウト"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
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
            title="離反リスク率"
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
            title="前年同月差"
            value={formatSignedCurrency(data?.summary.year_over_year_delta)}
            detail={`対象月 ${formatCurrency(data?.summary.current_month_total)} / 前年同月 ${formatCurrency(data?.summary.previous_year_total)}`}
            tone={(data?.summary.year_over_year_delta ?? 0) < 0 ? 'amber' : 'emerald'}
            icon={(data?.summary.year_over_year_delta ?? 0) < 0 ? <ArrowDownRight className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
          />
        </div>

        <section className="mb-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-zinc-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-black text-zinc-900">医院別 伸び率ランキング</h2>
              </div>
              <p className="mt-1 text-sm text-zinc-500">対象月と前年同月を比較し、上昇理由・商品構成・IOS利用状況を表示</p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
              TOP {growthRankingRows.length}
            </span>
          </div>

          <div className="divide-y divide-zinc-100">
            {growthRankingRows.map(({ row, currentAmount, previousAmount }, index) => {
              const insight = row.ranking_insight;
              const portfolioColors = ['bg-indigo-500', 'bg-cyan-500', 'bg-emerald-500', 'bg-amber-400'];
              return (
                <button
                  key={`ranking-${row.customer_code}`}
                  type="button"
                  onClick={() => navigate(`/clinics/customer/${encodeURIComponent(row.customer_code)}`)}
                  className="grid w-full gap-4 px-5 py-4 text-left transition hover:bg-indigo-50/40 lg:grid-cols-[52px_1.1fr_0.7fr_1.5fr_1.2fr]"
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-black ${
                    index === 0 ? 'bg-amber-400 text-white'
                      : index === 1 ? 'bg-zinc-300 text-zinc-800'
                        : index === 2 ? 'bg-orange-200 text-orange-800'
                          : 'bg-zinc-100 text-zinc-600'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-black text-zinc-900">{row.customer_name}</p>
                    <p className="mt-1 text-xs text-zinc-500">{row.customer_code}・{formatStaffName(row)}</p>
                    {insight?.ios_rental_enabled && (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        IOSレンタル
                        {insight.ios_rental_start_date ? ` ${insight.ios_rental_start_date}` : ''}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-2xl font-black text-emerald-600">{formatGrowthRate(currentAmount, previousAmount)}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatCurrency(previousAmount)} → {formatCurrency(currentAmount)}
                    </p>
                    <p className="mt-1 text-xs font-bold text-emerald-700">
                      {formatSignedCurrency(currentAmount - previousAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-black text-zinc-500">上昇理由</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(insight?.reasons.length ? insight.reasons : ['売上が前年同月を上回りました']).map((reason) => (
                        <span key={reason} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-black text-zinc-500">商品ポートフォリオ</p>
                    {insight?.product_portfolio.length ? (
                      <>
                        <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-100">
                          {insight.product_portfolio.map((product, productIndex) => (
                            <span
                              key={product.label}
                              className={portfolioColors[productIndex] ?? 'bg-zinc-400'}
                              style={{ width: `${product.share}%` }}
                              title={`${product.label} ${product.share}%`}
                            />
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                          {insight.product_portfolio.map((product, productIndex) => (
                            <span key={product.label} className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600">
                              <span className={`h-2 w-2 rounded-full ${portfolioColors[productIndex] ?? 'bg-zinc-400'}`} />
                              {product.label} {product.share}%
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-zinc-400">商品情報なし</p>
                    )}
                  </div>
                </button>
              );
            })}
            {growthRankingRows.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-zinc-500">
                前年同月を上回った医院はありません
              </div>
            )}
          </div>
        </section>

        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="lg:w-[340px]">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-rose-600" />
                <h2 className="text-lg font-bold text-zinc-900">要対応医院のケア状況</h2>
              </div>
              <p className="mt-2 text-sm text-zinc-500">離反・危険・減少注意</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-zinc-50 p-4">
                  <p className="text-xs font-bold text-zinc-500">要対応</p>
                  <p className="mt-2 text-2xl font-black text-zinc-900">
                    {attentionCareSummary.total.toLocaleString()}件
                  </p>
                </div>
                <div className="rounded-lg bg-rose-50 p-4">
                  <p className="text-xs font-bold text-rose-600">未対応率</p>
                  <p className="mt-2 text-2xl font-black text-rose-700">
                    {attentionCareSummary.unresolvedRate}%
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-xs font-black text-zinc-500">ステータス別フィルタ</p>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                  {attentionCareSummary.riskRows.map((entry) => (
                    <button
                      key={entry.status}
                      type="button"
                      onClick={() => setTableFilters((current) => ({ ...current, riskState: entry.status }))}
                      disabled={entry.value === 0}
                      className={`flex h-10 items-center justify-between gap-3 rounded-lg border px-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                        tableFilters.riskState === entry.status
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      <span className="truncate text-sm font-bold">{entry.status}</span>
                      <span className="shrink-0 text-sm font-black">{entry.value.toLocaleString()}件</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="min-h-[220px] flex-1">
              {attentionCareSummary.chartRows.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={attentionCareSummary.chartRows}
                      dataKey="value"
                      nameKey="status"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={2}
                    >
                      {attentionCareSummary.chartRows.map((entry) => (
                        <Cell key={entry.status} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [`${Number(value).toLocaleString()}件`, String(name)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[220px] items-center justify-center rounded-lg bg-zinc-50 text-sm font-semibold text-zinc-400">
                  要対応医院はありません
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:w-[360px]">
              <div>
                <p className="mb-2 text-xs font-black text-zinc-500">ケア状況別フィルタ</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {CARE_STATUSES.map((status) => {
                    const item = attentionCareSummary.chartRows.find((entry) => entry.status === status);
                    const value = item?.value ?? 0;
                    const rate = attentionCareSummary.total > 0
                      ? Number(((value / attentionCareSummary.total) * 100).toFixed(1))
                      : 0;

                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setTableFilters((current) => ({ ...current, careStatus: status }))}
                        disabled={value === 0}
                        className={`flex h-11 items-center justify-between gap-3 rounded-lg border px-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                          tableFilters.careStatus === status
                            ? 'border-indigo-300 bg-indigo-50'
                            : 'border-zinc-200 bg-white hover:bg-zinc-50'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: CARE_STATUS_COLORS[status] }}
                          />
                          <span className="truncate text-sm font-bold text-zinc-700">{status}</span>
                        </span>
                        <span className="shrink-0 text-sm font-black text-zinc-900">
                          {value.toLocaleString()}件
                          <span className="ml-2 text-xs font-bold text-zinc-400">{rate}%</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-zinc-900">医院別アセット一覧</h2>
              <p className="mt-1 text-sm text-zinc-500">前年同月・直近3か月平均・前会計期間合計・対象期間の月別金額を一覧できます</p>
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

          <div className="grid gap-3 border-b border-zinc-100 bg-zinc-50/70 p-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
            <label className="flex flex-col gap-1 text-xs font-bold text-zinc-500">
              担当者
              <select
                value={tableFilters.staffKey}
                onChange={(event) => setTableFilters((current) => ({ ...current, staffKey: event.target.value }))}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none focus:border-indigo-300"
              >
                <option value="">すべて</option>
                {staffFilterOptions.map(({ key, row }) => {
                  const departmentName = departmentNameById.get(String(row.department_id ?? '')) ?? '部署未設定';
                  return (
                    <option key={key} value={key}>
                      {formatStaffName(row)}（{departmentName} / {row.external_staff_code ?? '-'}）
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-bold text-zinc-500">
              離反リスク
              <select
                value={tableFilters.riskState}
                onChange={(event) => setTableFilters((current) => ({ ...current, riskState: event.target.value }))}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none focus:border-indigo-300"
              >
                <option value="">すべて</option>
                {RISK_FILTER_OPTIONS.map((risk) => (
                  <option key={risk} value={risk}>{risk}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-bold text-zinc-500">
              ケア状況
              <select
                value={tableFilters.careStatus}
                onChange={(event) => setTableFilters((current) => ({ ...current, careStatus: event.target.value }))}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none focus:border-indigo-300"
              >
                <option value="">すべて</option>
                {CARE_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-bold text-zinc-500">
              対象月売上
              <select
                value={tableFilters.targetSales}
                onChange={(event) => setTableFilters((current) => ({
                  ...current,
                  targetSales: event.target.value as TargetSalesFilter,
                }))}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none focus:border-indigo-300"
              >
                <option value="">すべて</option>
                <option value="positive">売上あり</option>
                <option value="zero">売上なし</option>
              </select>
            </label>

            <div className="flex items-end gap-2">
              <div className="flex h-10 min-w-[112px] items-center justify-center rounded-lg bg-white px-3 text-sm font-bold text-zinc-700">
                {displayRows.length.toLocaleString()} / {(data?.rows.length ?? 0).toLocaleString()}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setTableFilters({
                    staffKey: '',
                    riskState: '',
                    careStatus: '',
                    targetSales: '',
                  });
                }}
                disabled={!hasActiveTableFilters && !searchQuery}
                className="h-10 rounded-lg border border-zinc-300 px-3 text-sm font-bold text-zinc-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                解除
              </button>
            </div>
          </div>

          <div className="max-h-[680px] overflow-auto">
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-50 text-left text-xs font-bold uppercase tracking-normal text-zinc-500">
                <tr>
                  <SortHeader sortKey="user_name" sticky className="min-w-[150px] border-b border-zinc-200 px-4 py-3">
                    担当者
                  </SortHeader>
                  <SortHeader sortKey="customer_code" className="min-w-[110px] border-b border-zinc-200 px-4 py-3">
                    得意先コード
                  </SortHeader>
                  <SortHeader sortKey="customer_name" className="min-w-[260px] border-b border-zinc-200 px-4 py-3">
                    得意先名
                  </SortHeader>
                  <SortHeader sortKey="previous_year_total" align="right" className="min-w-[120px] border-b border-zinc-200 px-4 py-3 text-right">
                    前年同月
                  </SortHeader>
                  <SortHeader sortKey="three_month_average" align="right" className="min-w-[120px] border-b border-zinc-200 px-4 py-3 text-right">
                    3か月平均
                  </SortHeader>
                  <SortHeader sortKey="total" align="right" className="min-w-[150px] border-b border-zinc-200 px-4 py-3 text-right">
                    前会計期間合計
                  </SortHeader>
                  {(data?.months ?? []).map((month) => (
                    <SortHeader
                      key={month.key}
                      sortKey={`month:${month.key}`}
                      align="right"
                      className="min-w-[110px] border-b border-zinc-200 px-4 py-3 text-right"
                    >
                      {month.label}
                    </SortHeader>
                  ))}
                  <SortHeader sortKey="risk_state" align="center" className="min-w-[110px] border-b border-zinc-200 px-4 py-3 text-center">
                    離反リスク
                  </SortHeader>
                  <SortHeader sortKey="care_status" className="min-w-[130px] border-b border-zinc-200 px-4 py-3">
                    ケア状況
                  </SortHeader>
                  <SortHeader sortKey="next_care_date" className="min-w-[150px] border-b border-zinc-200 px-4 py-3">
                    次回ケア日
                  </SortHeader>
                  <SortHeader sortKey="care_memo" className="min-w-[260px] border-b border-zinc-200 px-4 py-3">
                    ケアメモ
                  </SortHeader>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => {
                  const riskState = getRiskState(row, data?.months ?? []);
                  const management = row.management ?? DEFAULT_MANAGEMENT;

                  return (
                    <tr
                      key={`${row.department_id ?? 'none'}-${row.customer_code}`}
                      className="group cursor-pointer text-zinc-700 hover:bg-indigo-50/50"
                      onClick={() => navigate(`/clinics/customer/${encodeURIComponent(row.customer_code)}`)}
                    >
                      <td className="sticky left-0 z-10 border-b border-zinc-100 bg-white px-4 py-3 font-bold text-zinc-900 group-hover:bg-indigo-50">
                        {formatStaffName(row)}
                      </td>
                      <td className="border-b border-zinc-100 px-4 py-3 font-mono text-xs text-zinc-500">{row.customer_code}</td>
                      <td className="border-b border-zinc-100 px-4 py-3 font-bold text-zinc-900">{row.customer_name}</td>
                      <td className="border-b border-zinc-100 px-4 py-3 text-right">{formatCurrency(row.previous_year_total)}</td>
                      <td className="border-b border-zinc-100 px-4 py-3 text-right">{formatCurrency(row.three_month_average)}</td>
                      <td className="border-b border-zinc-100 px-4 py-3 text-right font-black text-zinc-950">{formatCurrency(row.previous_fiscal_total)}</td>
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
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${riskState.className}`}>
                          {riskState.label}
                        </span>
                      </td>
                      <td className="border-b border-zinc-100 px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${getCareStatusClass(management.status)}`}>
                          {management.status}
                        </span>
                      </td>
                      <td className="border-b border-zinc-100 px-4 py-3 text-xs font-semibold text-zinc-600">
                        {management.next_action_date ?? '-'}
                      </td>
                      <td className="border-b border-zinc-100 px-4 py-3 text-xs text-zinc-600">
                        <p className="line-clamp-2 min-w-[220px] whitespace-pre-wrap">
                          {management.memo || '-'}
                        </p>
                      </td>
                    </tr>
                  );
                })}
                {displayRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={10 + (data?.months.length ?? 0)}
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
