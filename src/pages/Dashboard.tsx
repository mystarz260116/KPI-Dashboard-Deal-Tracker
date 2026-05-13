import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { KPIData, Granularity, Period } from '../types';
import { toDateString } from '../lib/dateUtils';
import { authFetch } from '../lib/authFetch';
import { isPerfEnabled, perfNow } from '../lib/perf';
import {
  PlusCircle, Filter, Calendar, Users,
  TrendingUp, Target, LogOut, Search
} from 'lucide-react';
import { motion } from 'motion/react';
import logoImg from '../assets/M.png';

interface User {
  id: string;
  name: string;
  department_id: number | null;
  department: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

interface PerfStats {
  usersMs: number;
  usersStatus: number;
  departmentsMs: number;
  departmentsStatus: number;
  kpiMs: number;
  kpiStatus: number;
  totalMs: number;
}

interface ProductDepartmentPanelItem {
  key: string;
  label: string;
  sales?: number;
  share?: number;
  change_rate?: number | null;
}

interface SectionTitleProps { title: string; color: string; }
function SectionTitle({ title, color }: SectionTitleProps) {
  return (
    <h2 className="mb-4 text-lg font-bold text-zinc-800 pb-2 border-b-2" style={{ borderColor: color }}>
      {title}
    </h2>
  );
}

interface SectionGroupTitleProps {
  title: string;
  description: string;
}

function SectionGroupTitle({ title, description }: SectionGroupTitleProps) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-bold text-zinc-900">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
    </div>
  );
}

interface PerformanceRankingItem {
  user_id: string;
  name: string;
  sales: number;
  budget: number;
  visits: number;
  visit_goal: number | null;
  won_count: number;
}

function formatDateInput(date: Date) {
  return toDateString(date);
}

function formatImportDatetimeInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function extractCsvRecords(text: string) {
  const records: string[] = [];
  let start = 0;
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      const record = text.slice(start, i).replace(/\r$/, '');
      records.push(record);

      if (char === '\r' && next === '\n') {
        i += 1;
      }

      start = i + 1;
    }
  }

  return {
    records,
    remainder: text.slice(start),
  };
}

function formatChangeRate(changeRate: number | null | undefined) {
  if (changeRate == null) return '-';
  if (changeRate > 0) return `+${changeRate}`;
  return `${changeRate}`;
}

function getDefaultDateRange(period: Period) {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'yearly') {
    const start = new Date(current.getFullYear(), 0, 1);
    const end = new Date(current.getFullYear(), 11, 31);
    return {
      from: formatDateInput(start),
      to: formatDateInput(end),
    };
  }

  if (period === 'quarterly') {
    const quarterStartMonth = Math.floor(current.getMonth() / 3) * 3;
    const start = new Date(current.getFullYear(), quarterStartMonth, 1);
    const end = new Date(current.getFullYear(), quarterStartMonth + 3, 0);
    return {
      from: formatDateInput(start),
      to: formatDateInput(end),
    };
  }

  if (period === 'weekly') {
    const day = current.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(current.getFullYear(), current.getMonth(), current.getDate() + diffToMonday);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return {
      from: formatDateInput(start),
      to: formatDateInput(end),
    };
  }

  const start = new Date(current.getFullYear(), current.getMonth(), 1);
  const end = new Date(current.getFullYear(), current.getMonth() + 1, 0);
  return {
    from: formatDateInput(start),
    to: formatDateInput(end),
  };
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>('monthly');
  const [granularity, setGranularity] = useState<Granularity>('all');
  const defaultRange = getDefaultDateRange(period);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);

  const [selectedDept, setSelectedDept] = useState('');
  const [selectedUser, setSelectedUser] = useState('');

  const [appliedPeriod, setAppliedPeriod] = useState<Period>('monthly');
  const [appliedGranularity, setAppliedGranularity] = useState<Granularity>('all');
  const [appliedFromDate, setAppliedFromDate] = useState(defaultRange.from);
  const [appliedToDate, setAppliedToDate] = useState(defaultRange.to);
  const [appliedDept, setAppliedDept] = useState('');
  const [appliedUser, setAppliedUser] = useState('');
  const [data, setData] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingMergeCount, setPendingMergeCount] = useState(0);
  const [isMergeCountLoading, setIsMergeCountLoading] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [importResultMessage, setImportResultMessage] = useState('');
  const [importDepartmentId, setImportDepartmentId] = useState('');
  const [importedAtInput, setImportedAtInput] = useState(() => formatImportDatetimeInput(new Date()));
  const [perfStats, setPerfStats] = useState<{
    usersMs: number;
    usersStatus: number;
    departmentsMs: number;
    departmentsStatus: number;
    kpiMs: number;
    kpiStatus: number;
    totalMs: number;
  } | null>(null);

  const userDepartmentOptions = Array.from(
    new Map(
      users
        .filter((u) => u.department_id != null && u.department)
        .map((u) => [String(u.department_id), {
          id: String(u.department_id),
          name: u.department,
        } satisfies DepartmentOption])
    ).values()
  );
  const departmentOptions = departments.length > 0 ? departments : userDepartmentOptions;
  const productDepartmentSales: ProductDepartmentPanelItem[] = data?.product_department_sales ?? [];
  const performanceRanking: PerformanceRankingItem[] = data?.performance_ranking ?? [];

  const fetchPendingMergeCount = async () => {
    setIsMergeCountLoading(true);

    try {
      const res = await authFetch('/api/merge/candidates/count');
      if (!res.ok) {
        throw new Error('merge candidates count fetch failed');
      }

      const result = await res.json();
      setPendingMergeCount(result.pending_count ?? 0);
    } catch (err) {
      console.error('merge candidates count error:', err);
      setPendingMergeCount(0);
    } finally {
      setIsMergeCountLoading(false);
    }
  };

  useEffect(() => {
    const nextRange = getDefaultDateRange(period);
    setFromDate(nextRange.from);
    setToDate(nextRange.to);
  }, [period]);

  useEffect(() => {
    if (user && user.can_view_dashboard === false) {
      navigate('/deals/new', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    fetchPendingMergeCount();
  }, []);
  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const totalStart = perfNow();
        const readPayload = async (res: Response) => {
          const contentType = res.headers.get('content-type') ?? '';

          if (contentType.includes('application/json')) {
            return await res.json();
          }

          return await res.text();
        };

        const fetchWithTiming = async (url: string) => {
          const start = perfNow();
          const res = await authFetch(url);
          const payload = await readPayload(res);

          return {
            res,
            data: payload,
            ms: perfNow() - start,
            contentType: res.headers.get('content-type') ?? '',
          };
        };

        const params = new URLSearchParams({
          period: appliedPeriod,
          granularity: appliedGranularity,
          from: appliedFromDate,
          to: appliedToDate,
        });

        if (appliedDept) params.set('departmentId', appliedDept);
        if (appliedUser) params.set('userId', appliedUser);

        const usersPromise = fetchWithTiming('/api/users');
        const departmentsPromise = fetchWithTiming('/api/departments');
        const kpiPromise = fetchWithTiming(`/api/kpi?${params.toString()}`);

        const [usersResult, departmentsResult, kpiResult] = await Promise.all([
          usersPromise,
          departmentsPromise,
          kpiPromise,
        ]);

        const totalMs = perfNow() - totalStart;

        if (isPerfEnabled()) {
          const nextPerfStats: PerfStats = {
            usersMs: usersResult.ms,
            usersStatus: usersResult.res.status,
            departmentsMs: departmentsResult.ms,
            departmentsStatus: departmentsResult.res.status,
            kpiMs: kpiResult.ms,
            kpiStatus: kpiResult.res.status,
            totalMs,
          };

          setPerfStats(nextPerfStats);
          console.info(
            `[perf] dashboard users=${usersResult.ms.toFixed(1)}ms (${usersResult.res.status}) departments=${departmentsResult.ms.toFixed(1)}ms (${departmentsResult.res.status}) kpi=${kpiResult.ms.toFixed(1)}ms (${kpiResult.res.status}) total=${totalMs.toFixed(1)}ms`
          );
        }

        if (!usersResult.res.ok) {
          throw new Error('users fetch failed');
        }
        if (!departmentsResult.res.ok) {
          throw new Error('departments fetch failed');
        }
        if (!kpiResult.res.ok) {
          throw new Error('kpi fetch failed');
        }

        const usersData: User[] = usersResult.data;
        const departmentsData: DepartmentOption[] = (departmentsResult.data ?? []).map((department: any) => ({
          id: String(department.id),
          name: department.name,
        }));
        const kpiData = kpiResult.data;

        setUsers(usersData);
        setDepartments(departmentsData);
        setData(kpiData);
      } catch (err) {
        console.error('dashboard fetch error:', err);
        setError('ダッシュボードの取得に失敗しました');
        setUsers([]);
        setDepartments([]);
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [appliedPeriod, appliedGranularity, appliedDept, appliedUser, appliedFromDate, appliedToDate]);
  const handleApplyFilters = () => {
    setAppliedPeriod(period);
    setAppliedGranularity(granularity);
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    setAppliedDept(selectedDept);
    setAppliedUser(selectedUser);
  };

  const parseCsvLine = (line: string) => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }

      current += char;
    }

    values.push(current);
    return values;
  };

  const buildCsvRow = (headers: string[], line: string) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      return null;
    }

    const cells = parseCsvLine(trimmedLine);
    const row = headers.reduce<Record<string, string>>((result, header, index) => {
      result[header] = cells[index] ?? '';
      return result;
    }, {});

    if (String(row['得意先コード'] ?? '').trim() === '') {
      return null;
    }

    return row;
  };

  const uploadSalesChunk = async (
    rows: Record<string, string>[],
    importBatchId: string,
    departmentId: string,
    importedAt: string
  ) => {
    const uploadRes = await authFetch('/api/import/sales/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rows,
        import_batch_id: importBatchId,
        department_id: Number(departmentId),
        imported_at: importedAt,
      }),
    });

    const uploadContentType = uploadRes.headers.get('content-type') ?? '';
    const uploadResult = uploadContentType.includes('application/json')
      ? await uploadRes.json()
      : null;

    if (!uploadRes.ok) {
      const debugMessage = [
        uploadResult?.error,
        uploadResult?.message,
        uploadResult?.details,
        uploadResult?.code ? `code=${uploadResult.code}` : '',
      ]
        .filter(Boolean)
        .join(' / ');

      throw new Error(debugMessage || 'CSV取込に失敗しました。');
    }

    return uploadResult?.uploaded_count ?? rows.length;
  };

  const uploadSalesCsv = async () => {
    if (!selectedCsvFile) {
      setImportResultMessage('CSVファイルを選択してください。');
      return;
    }
    if (!importDepartmentId) {
      setImportResultMessage('取り込み部署を選択してください。');
      return;
    }

    setIsImportingCsv(true);
    setImportResultMessage('');

    try {
      const importBatchId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const importedAt = new Date(importedAtInput).toISOString();
      const reader = selectedCsvFile.stream().getReader();
      const decoder = new TextDecoder('utf-8');
      const uploadChunkSize = 500;
      const pendingRows: Record<string, string>[] = [];
      let headers: string[] | null = null;
      let bufferedText = '';
      let isFirstChunk = true;
      let uploadedCount = 0;
      let parsedRowCount = 0;
      let uploadedBytes = 0;

      const flushPendingRows = async () => {
        if (pendingRows.length === 0) {
          return;
        }

        const chunk = pendingRows.splice(0, pendingRows.length);
        uploadedCount += await uploadSalesChunk(chunk, importBatchId, importDepartmentId, importedAt);
        const progressRate = selectedCsvFile.size > 0
          ? Math.min(100, (uploadedBytes / selectedCsvFile.size) * 100)
          : 0;

        setImportResultMessage(
          `CSV取込中... ${uploadedCount.toLocaleString()}件送信済み (${progressRate.toFixed(1)}%)`
        );
      };

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          bufferedText += decoder.decode();
          break;
        }

        uploadedBytes += value?.byteLength ?? 0;
        bufferedText += decoder.decode(value, { stream: true });

        if (isFirstChunk) {
          bufferedText = bufferedText.replace(/^\uFEFF/, '');
          isFirstChunk = false;
        }

        const { records, remainder } = extractCsvRecords(bufferedText);
        bufferedText = remainder;

        for (const rawLine of records) {
          const trimmedLine = rawLine.trim();
          if (!trimmedLine) continue;

          if (!headers) {
            headers = parseCsvLine(trimmedLine);
            continue;
          }

          const row = buildCsvRow(headers, trimmedLine);
          if (!row) continue;

          pendingRows.push(row);
          parsedRowCount += 1;

          if (pendingRows.length >= uploadChunkSize) {
            await flushPendingRows();
          }
        }
      }

      const trailingLine = bufferedText.trim();
      if (trailingLine) {
        if (!headers) {
          headers = parseCsvLine(trailingLine);
        } else {
          const row = buildCsvRow(headers, trailingLine);
          if (row) {
            pendingRows.push(row);
            parsedRowCount += 1;
          }
        }
      }

      if (!headers || parsedRowCount === 0) {
        throw new Error('CSVに取込対象の行がありません。');
      }

      await flushPendingRows();

      const finalizeRes = await authFetch('/api/import/sales/finalize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          import_batch_id: importBatchId,
          department_id: Number(importDepartmentId),
        }),
      });

      const finalizeContentType = finalizeRes.headers.get('content-type') ?? '';
      const finalizeResult = finalizeContentType.includes('application/json')
        ? await finalizeRes.json()
        : null;

      if (!finalizeRes.ok) {
        throw new Error(finalizeResult?.error ?? '取込後の同期処理に失敗しました。');
      }

      const importDepartmentName = departmentOptions.find((d) => d.id === importDepartmentId)?.name ?? importDepartmentId;
      setImportResultMessage(
        `CSV取込と同期処理が完了しました。部署: ${importDepartmentName} / 取り込み日時: ${importedAtInput.replace('T', ' ')} / 取込件数: ${uploadedCount}件 / 顧客担当紐付け更新: ${finalizeResult?.customer_external_staff_maps_upserted ?? 0}件 / 候補生成件数: ${finalizeResult?.inserted_count ?? 0}件`
      );
      setSelectedCsvFile(null);
      await fetchPendingMergeCount();
      setIsImportModalOpen(false);
    } catch (err: any) {
      console.error('sales csv import error:', err);
      setImportResultMessage(err?.message ?? 'CSV取込に失敗しました。');
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (user && user.can_view_dashboard === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-6">
        <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-zinc-900">ダッシュボード閲覧権限がありません</h1>
          <p className="mt-3 text-sm text-zinc-600">案件入力画面へ移動します。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-200">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <img src={logoImg} alt="Mystarz" className="h-8 w-auto object-contain" />
            <h1 className="text-xl font-bold text-zinc-900 xl:whitespace-nowrap">売上管理ダッシュボード</h1>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex flex-wrap gap-2">
            <button onClick={() => {
              setIsImportModalOpen(true);
              setImportResultMessage('');
            }}
              className="inline-flex items-center gap-1 rounded-xl border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-50 whitespace-nowrap">
              <PlusCircle className="h-4 w-4" />CSV取込
            </button>

            <button onClick={() => navigate('/deals/history')}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 whitespace-nowrap">
              <TrendingUp className="h-4 w-4" />商談履歴
            </button>

            <button onClick={() => navigate('/deals/progress')}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 whitespace-nowrap">
              <Users className="h-4 w-4" />進捗管理
            </button>

            <button onClick={() => navigate('/sales-performance')}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 whitespace-nowrap">
              <TrendingUp className="h-4 w-4" />営業パフォーマンス
            </button>

            <button onClick={() => navigate('/crm')}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 whitespace-nowrap">
              <Search className="h-4 w-4" />CRM検索
            </button>

            <button onClick={() => navigate('/customer-merge')}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 whitespace-nowrap">
              <Target className="h-4 w-4" />受注確認
              {!isMergeCountLoading && pendingMergeCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  {pendingMergeCount}
                </span>
              )}
            </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              <button onClick={() => navigate('/deals/new')}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 whitespace-nowrap">
                <PlusCircle className="h-4 w-4" />新規案件入力
              </button>
              <span className="max-w-[160px] truncate text-sm text-zinc-600">{user?.name ?? 'ゲスト'}</span>
              <button onClick={handleLogout} className="rounded-xl p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {perfStats && (
          <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900 shadow-sm">
            users API: {perfStats.usersMs.toFixed(0)}ms ({perfStats.usersStatus}) / departments API: {perfStats.departmentsMs.toFixed(0)}ms ({perfStats.departmentsStatus}) / kpi API: {perfStats.kpiMs.toFixed(0)}ms ({perfStats.kpiStatus}) / total: {perfStats.totalMs.toFixed(0)}ms
          </div>
        )}
        {importResultMessage && (
          <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800 shadow-sm">
            {importResultMessage}
          </div>
        )}
        {!isMergeCountLoading && pendingMergeCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
          >
            <div>
              未対応の受注確認候補が <span className="font-bold">{pendingMergeCount}件</span> あります。
            </div>
            <button
              onClick={() => navigate('/customer-merge')}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
            >
              確認する
            </button>
          </motion.div>
        )}
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
              <option value="weekly">週次</option>
              <option value="monthly">月次</option>
              <option value="quarterly">四半期</option>
              <option value="yearly">年次</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-zinc-400" />
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
            />
            <span className="text-sm text-zinc-400">〜</span>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
            />
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
                {departmentOptions.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
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
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}（{u.department}）
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={handleApplyFilters}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            確定
          </button>
        </motion.div>
      
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}
        <section className="mb-8">
          <SectionGroupTitle title="売上サマリー" description="まず売上の着地と予算差分を確認しやすい並びに変えています。" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="rounded-xl bg-white p-6 shadow-sm">
              <SectionTitle title="売上合計" color="#10b981" />
              <p className="text-4xl font-bold text-emerald-600">¥{(data?.sales.sales ?? 0).toLocaleString()}</p>
              <p className="mt-2 text-sm text-zinc-500">前期間比 {formatChangeRate(data?.sales.change_rate)}%</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
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
          </div>
        </section>

        <section className="mb-8">
          <SectionGroupTitle title="商品部門別" description="商品部門別の売上パネルを置く受け皿です。具体的な集計ロジックはあとから差し込めます。" />
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="rounded-xl bg-white p-6 shadow-sm">
            <SectionTitle title="商品部門別売上" color="#14b8a6" />
            {productDepartmentSales.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {productDepartmentSales.map((item) => (
                  <div key={item.key} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-sm font-semibold text-zinc-500">{item.label}</p>
                    <p className="mt-2 text-3xl font-bold text-zinc-900">¥{(item.sales ?? 0).toLocaleString()}</p>
                    <div className="mt-3 flex items-center justify-between text-sm text-zinc-500">
                      <span>構成比 {(item.share ?? 0).toFixed(1)}%</span>
                      <span>前期間比 {formatChangeRate(item.change_rate)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-5 py-8 text-sm text-zinc-500">
                商品部門別の集計ロジック待ちです。ここは「部門名 / 売上 / 構成比 / 前期間比」を並べる前提で、先にパネルだけ整えています。
              </div>
            )}
          </motion.div>
        </section>

        <section className="mb-8">
          <SectionGroupTitle title="担当別売上" description="担当者ごとの売上と受注の偏りを見比べられる並びにしています。" />
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
            className="mb-6 rounded-xl bg-white p-5 shadow-sm">
            <SectionTitle title="営業担当別売上ランキング" color="#0f766e" />
            <div className="space-y-3">
              {performanceRanking.length > 0 ? performanceRanking.map((item, index) => {
                return (
                  <div key={item.user_id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[56px_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_100px] md:items-center">
                      <div className="text-sm font-semibold text-zinc-400">#{index + 1}</div>

                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold text-zinc-900">{item.name}</p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-zinc-500">売上 / 予算</p>
                        <p className="truncate text-base font-bold text-teal-700">
                          ¥{item.sales.toLocaleString()}
                          <span className="ml-2 text-xs font-medium text-zinc-500">
                            / ¥{item.budget.toLocaleString()}
                          </span>
                        </p>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-zinc-500">訪問数 / 訪問目標</p>
                        <p className="truncate text-base font-bold text-indigo-700">
                          {item.visits.toLocaleString()}件
                          <span className="ml-2 text-xs font-medium text-zinc-500">
                            / {item.visit_goal != null ? `${item.visit_goal.toLocaleString()}件` : '未設定'}
                          </span>
                        </p>
                      </div>

                      <div className="text-left md:text-right">
                        <p className="text-[11px] font-semibold text-zinc-500">新規受注</p>
                        <p className="text-base font-bold text-emerald-700">{item.won_count.toLocaleString()}件</p>
                      </div>
                    </div>
                  </div>
                );
              }) : (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-5 py-8 text-sm text-zinc-500">
                  対象データがありません。
                </div>
              )}
            </div>
          </motion.div>

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
                      <td className="py-2 font-medium text-indigo-600">{o.clinic}</td>
                      <td className="py-2 text-zinc-700">{o.sales}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </section>
      </main>
    {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">CSV取込</h2>
              <button
                onClick={() => {
                  if (!isImportingCsv) setIsImportModalOpen(false);
                }}
                className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
              >
                閉じる
              </button>
            </div>

            <p className="mb-4 text-sm text-zinc-600">
              売上CSVを取り込んだ後、顧客同期・担当紐付け・マージ候補生成までまとめて実行します。
            </p>

            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-zinc-700">
                <span className="mb-1 block font-medium">取り込み部署</span>
                <select
                  value={importDepartmentId}
                  onChange={e => setImportDepartmentId(e.target.value)}
                  disabled={isImportingCsv}
                  className="block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="">部署を選択</option>
                  {departmentOptions.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm text-zinc-700">
                <span className="mb-1 block font-medium">取り込み日時</span>
                <input
                  type="datetime-local"
                  value={importedAtInput}
                  onChange={e => setImportedAtInput(e.target.value)}
                  disabled={isImportingCsv}
                  className="block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => setSelectedCsvFile(e.target.files?.[0] ?? null)}
              className="mb-4 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />

            {selectedCsvFile && (
              <div className="mb-4 text-sm text-zinc-600">
                選択中: {selectedCsvFile.name}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setIsImportModalOpen(false)}
                disabled={isImportingCsv}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={uploadSalesCsv}
                disabled={isImportingCsv}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isImportingCsv ? '取込中...' : '取込実行'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
