import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { KPIData, Granularity, Period } from '../types';
import { toDateString } from '../lib/dateUtils';
import { authFetch } from '../lib/authFetch';
import { isPerfEnabled, perfNow } from '../lib/perf';
import {
  PlusCircle, Filter, Calendar, Users,
  TrendingUp, Target, LogOut, Search, BellRing, ChevronDown
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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

interface ImportMonthClosureItem {
  target_year_month: string;
  closed_at: string | null;
  closed_by: string | null;
  closed_by_name: string;
}

interface ProductDepartmentPanelItem {
  key: string;
  label: string;
  sales?: number;
  share?: number;
  change_rate?: number | null;
}

interface DealCommentNotification {
  id: string;
  deal_id: string;
  comment_id: string;
  created_at: string;
  read_at: string | null;
  clinic_kind: 'customer' | 'prospect';
  clinic_id: string;
  clinic_name: string;
  deal_date: string | null;
  comment_body: string;
  comment_author_name: string;
  comment_created_at: string;
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

function formatYearMonthInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function normalizeCsvHeader(header: string) {
  return header.replace(/^\uFEFF/, '').trim();
}

function canonicalizeCsvHeader(header: string) {
  const normalized = normalizeCsvHeader(header);
  if (normalized.replace(/\s+/g, '') === '得意先コード') {
    return '得意先コード';
  }
  return normalized;
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

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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
  const [importClosureMonth, setImportClosureMonth] = useState(() => formatYearMonthInput(new Date()));
  const [importedAtInput, setImportedAtInput] = useState(() => formatImportDatetimeInput(new Date()));
  const [isMonthClosureLoading, setIsMonthClosureLoading] = useState(false);
  const [isMonthClosureUpdating, setIsMonthClosureUpdating] = useState(false);
  const [importMonthClosed, setImportMonthClosed] = useState(false);
  const [importMonthClosedAt, setImportMonthClosedAt] = useState<string | null>(null);
  const [importMonthClosedByName, setImportMonthClosedByName] = useState('');
  const [recentImportClosedMonths, setRecentImportClosedMonths] = useState<ImportMonthClosureItem[]>([]);
  const [importMonthMessage, setImportMonthMessage] = useState('');
  const [commentNotifications, setCommentNotifications] = useState<DealCommentNotification[]>([]);
  const [unreadCommentNotificationCount, setUnreadCommentNotificationCount] = useState(0);
  const [isLoadingCommentNotifications, setIsLoadingCommentNotifications] = useState(false);
  const [commentNotificationError, setCommentNotificationError] = useState('');
  const [isCommentNotificationsOpen, setIsCommentNotificationsOpen] = useState(false);
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
  const scopedUsers = selectedDept
    ? users.filter((u) => String(u.department_id ?? '') === selectedDept)
    : users;
  const sortedDepartmentOptions = [...departmentOptions].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const sortedScopedUsers = [...scopedUsers].sort((a, b) => {
    const departmentCompare = (a.department ?? '').localeCompare((b.department ?? ''), 'ja');
    if (departmentCompare !== 0) return departmentCompare;
    return a.name.localeCompare(b.name, 'ja');
  });

  const fetchPendingMergeCount = async () => {
    setIsMergeCountLoading(true);

    try {
      const res = await authFetch(`/api/merge/candidates/count?ts=${Date.now()}`, {
        cache: 'no-store',
      });
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

  const fetchCommentNotifications = async () => {
    if (!user?.id) {
      setCommentNotifications([]);
      setUnreadCommentNotificationCount(0);
      return;
    }

    setIsLoadingCommentNotifications(true);
    setCommentNotificationError('');

    try {
      const response = await authFetch('/api/deals?path=notifications&limit=10', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('comment notifications fetch failed');
      }

      const payload = await response.json();
      setCommentNotifications(Array.isArray(payload?.notifications) ? payload.notifications : []);
      setUnreadCommentNotificationCount(Number(payload?.unread_count ?? 0));
    } catch (notificationError) {
      console.error('dashboard comment notifications fetch error:', notificationError);
      setCommentNotificationError('コメント通知の取得に失敗しました');
      setCommentNotifications([]);
      setUnreadCommentNotificationCount(0);
    } finally {
      setIsLoadingCommentNotifications(false);
    }
  };

  const markCommentNotificationRead = async (notificationId: string) => {
    try {
      await authFetch('/api/deals?path=notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notification_id: notificationId }),
      });

      setCommentNotifications((current) => current.map((notification) => (
        notification.id === notificationId
          ? { ...notification, read_at: notification.read_at ?? new Date().toISOString() }
          : notification
      )));
      setUnreadCommentNotificationCount((current) => Math.max(0, current - 1));
    } catch (notificationError) {
      console.error('dashboard comment notification read error:', notificationError);
    }
  };

  const markAllCommentNotificationsRead = async () => {
    try {
      await authFetch('/api/deals?path=notifications', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'read_all' }),
      });

      const now = new Date().toISOString();
      setCommentNotifications((current) => current.map((notification) => ({
        ...notification,
        read_at: notification.read_at ?? now,
      })));
      setUnreadCommentNotificationCount(0);
    } catch (notificationError) {
      console.error('dashboard comment notifications read all error:', notificationError);
    }
  };

  const openCommentNotification = async (notification: DealCommentNotification) => {
    if (!notification.read_at) {
      await markCommentNotificationRead(notification.id);
    }

    navigate(`/clinics/${notification.clinic_kind}/${encodeURIComponent(notification.clinic_id)}`);
  };

  const fetchImportMonthClosureStatus = async (departmentId: string, targetYearMonth: string) => {
    if (!departmentId || !targetYearMonth) {
      setImportMonthClosed(false);
      setImportMonthClosedAt(null);
      setImportMonthClosedByName('');
      setRecentImportClosedMonths([]);
      return;
    }

    setIsMonthClosureLoading(true);
    setImportMonthMessage('');

    try {
      const params = new URLSearchParams({
        department_id: departmentId,
        target_year_month: targetYearMonth,
      });

      const res = await authFetch(`/api/import/sales/month-closures?${params.toString()}`, {
        cache: 'no-store',
      });

      const contentType = res.headers.get('content-type') ?? '';
      const payload = contentType.includes('application/json')
        ? await res.json()
        : null;

      if (!res.ok) {
        throw new Error(payload?.error ?? '月締め状態の取得に失敗しました。');
      }

      setImportMonthClosed(Boolean(payload?.is_closed));
      setImportMonthClosedAt(payload?.closed_at ?? null);
      setImportMonthClosedByName(payload?.closed_by_name ?? '');
      setRecentImportClosedMonths(payload?.recent_closed_months ?? []);
    } catch (err: any) {
      console.error('sales import month closure status error:', err);
      setImportMonthClosed(false);
      setImportMonthClosedAt(null);
      setImportMonthClosedByName('');
      setRecentImportClosedMonths([]);
      setImportMonthMessage(err?.message ?? '月締め状態の取得に失敗しました。');
    } finally {
      setIsMonthClosureLoading(false);
    }
  };

  const toggleImportMonthClosure = async () => {
    if (!importDepartmentId || !importClosureMonth) {
      setImportMonthMessage('部署と対象月を選択してください。');
      return;
    }

    setIsMonthClosureUpdating(true);
    setImportMonthMessage('');

    try {
      const res = await authFetch('/api/import/sales/close-month', {
        method: importMonthClosed ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          department_id: Number(importDepartmentId),
          target_year_month: importClosureMonth,
        }),
      });

      const contentType = res.headers.get('content-type') ?? '';
      const payload = contentType.includes('application/json')
        ? await res.json()
        : null;

      if (!res.ok) {
        throw new Error(payload?.error ?? (importMonthClosed ? '締め解除に失敗しました。' : '月締めに失敗しました。'));
      }

      setImportMonthMessage(importMonthClosed ? '月締めを解除しました。' : '月締めを実行しました。');
      await fetchImportMonthClosureStatus(importDepartmentId, importClosureMonth);
    } catch (err: any) {
      console.error('sales import month closure update error:', err);
      setImportMonthMessage(err?.message ?? (importMonthClosed ? '締め解除に失敗しました。' : '月締めに失敗しました。'));
    } finally {
      setIsMonthClosureUpdating(false);
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
    fetchCommentNotifications();
  }, [user?.id]);

  useEffect(() => {
    if (!isImportModalOpen) {
      return;
    }

    if (!importDepartmentId || !importClosureMonth) {
      setImportMonthClosed(false);
      setImportMonthClosedAt(null);
      setImportMonthClosedByName('');
      setRecentImportClosedMonths([]);
      return;
    }

    void fetchImportMonthClosureStatus(importDepartmentId, importClosureMonth);
  }, [isImportModalOpen, importDepartmentId, importClosureMonth]);

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

  const parseCsvRows = (text: string) => {
    const normalizedText = text.replace(/^\uFEFF/, '');
    const { records, remainder } = extractCsvRecords(normalizedText);
    const completeRecords = [...records];
    const trailingLine = remainder.trim();

    if (trailingLine) {
      completeRecords.push(trailingLine);
    }

    if (completeRecords.length === 0) {
      return {
        headers: null as string[] | null,
        rows: [] as Record<string, string>[],
      };
    }

    const rawHeaders = parseCsvLine(completeRecords[0]).map(canonicalizeCsvHeader);
    const rows = completeRecords
      .slice(1)
      .map((line) => buildCsvRow(rawHeaders, line))
      .filter((row): row is Record<string, string> => Boolean(row));

    return {
      headers: rawHeaders,
      rows,
    };
  };

  const decodeCsvFile = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const utf8Text = new TextDecoder('utf-8').decode(buffer);
    const utf8Parsed = parseCsvRows(utf8Text);

    if (utf8Parsed.rows.length > 0) {
      return utf8Parsed;
    }

    const utf8HasTargetHeader = (utf8Parsed.headers ?? []).includes('得意先コード');
    if (utf8HasTargetHeader) {
      return utf8Parsed;
    }

    try {
      const shiftJisText = new TextDecoder('shift-jis').decode(buffer);
      const shiftJisParsed = parseCsvRows(shiftJisText);
      if (shiftJisParsed.rows.length > 0 || (shiftJisParsed.headers ?? []).includes('得意先コード')) {
        return shiftJisParsed;
      }
    } catch (decodeError) {
      console.warn('shift-jis decode fallback failed:', decodeError);
    }

    return utf8Parsed;
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
      const uploadChunkSize = 500;
      let uploadedCount = 0;
      const { headers, rows } = await decodeCsvFile(selectedCsvFile);
      const parsedRowCount = rows.length;

      const flushPendingRows = async (chunk: Record<string, string>[]) => {
        if (chunk.length === 0) {
          return;
        }

        uploadedCount += await uploadSalesChunk(chunk, importBatchId, importDepartmentId, importedAt);
        const progressRate = parsedRowCount > 0
          ? Math.min(100, (uploadedCount / parsedRowCount) * 100)
          : 0;

        setImportResultMessage(
          `CSV取込中... ${uploadedCount.toLocaleString()}件送信済み (${progressRate.toFixed(1)}%)`
        );
      };

      if (!headers || parsedRowCount === 0) {
        throw new Error('CSVに取込対象の行がありません。');
      }

      for (let index = 0; index < rows.length; index += uploadChunkSize) {
        const chunk = rows.slice(index, index + uploadChunkSize);
        await flushPendingRows(chunk);
      }

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
      const replacedMonths = Array.isArray(finalizeResult?.replaced_months)
        ? finalizeResult.replaced_months.join(', ')
        : '';
      setImportResultMessage(
        `CSV取込と同期処理が完了しました。部署: ${importDepartmentName} / 取り込み日時: ${importedAtInput.replace('T', ' ')} / 対象月: ${replacedMonths || '判定不可'} / 取込件数: ${uploadedCount}件 / 置換raw件数: ${finalizeResult?.deleted_raw_rows ?? 0}件 / 置換売上件数: ${finalizeResult?.deleted_sales_rows ?? 0}件 / 顧客担当紐付け更新: ${finalizeResult?.customer_external_staff_maps_upserted ?? 0}件 / 候補生成件数: ${finalizeResult?.inserted_count ?? 0}件`
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

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
        >
          <button
            type="button"
            onClick={() => setIsCommentNotificationsOpen((current) => !current)}
            className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="relative rounded-full bg-indigo-50 p-2 text-indigo-600">
                <BellRing className="h-5 w-5" />
                {unreadCommentNotificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-pink-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                    {unreadCommentNotificationCount}
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900">コメント通知</p>
                <p className="text-xs text-zinc-500">商談コメントの更新を確認できます</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {unreadCommentNotificationCount > 0 && (
                <span className="rounded-full bg-pink-50 px-2.5 py-1 text-xs font-bold text-pink-600">
                  未読 {unreadCommentNotificationCount}
                </span>
              )}
              <ChevronDown className={`h-4 w-4 text-zinc-400 transition ${isCommentNotificationsOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>

          <AnimatePresence>
            {isCommentNotificationsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden border-t border-zinc-100"
              >
                <div className="p-4 pt-3">
                  {unreadCommentNotificationCount > 0 && (
                    <div className="mb-3 flex justify-end">
                      <button
                        type="button"
                        onClick={markAllCommentNotificationsRead}
                        className="rounded-lg px-3 py-2 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
                      >
                        すべて既読
                      </button>
                    </div>
                  )}

                  {isLoadingCommentNotifications ? (
                    <div className="rounded-xl bg-zinc-50 px-4 py-5 text-center text-sm text-zinc-500">
                      <div className="mx-auto mb-2 h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                      読み込み中です...
                    </div>
                  ) : commentNotificationError ? (
                    <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                      {commentNotificationError}
                    </div>
                  ) : commentNotifications.length === 0 ? (
                    <div className="rounded-xl bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
                      新しいコメント通知はありません
                    </div>
                  ) : (
                    <div className="grid gap-2 lg:grid-cols-2">
                      {commentNotifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => openCommentNotification(notification)}
                          className={`rounded-xl border px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/50 ${
                            notification.read_at
                              ? 'border-zinc-100 bg-zinc-50'
                              : 'border-indigo-200 bg-indigo-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-zinc-900">
                                {notification.clinic_name}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-indigo-600">
                                {notification.comment_author_name}さんがコメントしました
                              </p>
                            </div>
                            <span className="shrink-0 text-xs text-zinc-400">
                              {formatNotificationTime(notification.comment_created_at)}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-600">
                            {notification.comment_body}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

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
            }} className="min-w-[140px] rounded-lg border border-zinc-200 px-3 py-1.5 text-sm">
              <option value="all">全体</option>
              <option value="department">部署</option>
              <option value="individual">個人</option>
            </select>
          </div>

          {/* Department select */}
          {(granularity === 'department' || granularity === 'individual') && (
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-zinc-400" />
              <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)}
                className="min-w-[220px] rounded-lg border border-zinc-200 px-3 py-1.5 text-sm">
                <option value="">{granularity === 'individual' ? '部署で絞る（任意）' : '部署を選択'}</option>
                {sortedDepartmentOptions.map(d => (
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
                className="min-w-[280px] rounded-lg border border-zinc-200 px-3 py-1.5 text-sm">
                <option value="">担当者を選択</option>
                {sortedScopedUsers.map(u => (
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
          <SectionGroupTitle title="商品部門別" description="商品マスターにひもづく部門別に、売上の構成と前期間比を見られるようにしています。" />
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
                商品マスターにひもづく売上がまだありません。商品分類マスターの設定後に、部門名ごとの売上・構成比・前期間比が表示されます。
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

              <label className="block text-sm text-zinc-700">
                <span className="mb-1 block font-medium">月締め管理対象月</span>
                <input
                  type="month"
                  value={importClosureMonth}
                  onChange={e => setImportClosureMonth(e.target.value)}
                  disabled={isImportingCsv || isMonthClosureUpdating}
                  className="block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-800">月次締め</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    未締め月は、その月の既存CSV売上を削除して今回の取込内容で上書きします。
                  </p>
                  <p className="mt-2 text-sm">
                    状態:
                    <span className={`ml-2 rounded-full px-2.5 py-1 text-xs font-bold ${importMonthClosed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {isMonthClosureLoading ? '確認中...' : importMonthClosed ? '締め済み' : '未締め'}
                    </span>
                  </p>
                  {importMonthClosedAt && (
                    <p className="mt-1 text-xs text-zinc-500">
                      締め日時: {importMonthClosedAt.replace('T', ' ').slice(0, 16)}
                      {importMonthClosedByName ? ` / ${importMonthClosedByName}` : ''}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={toggleImportMonthClosure}
                  disabled={!importDepartmentId || !importClosureMonth || isMonthClosureLoading || isMonthClosureUpdating || isImportingCsv}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${importMonthClosed ? 'bg-zinc-600 hover:bg-zinc-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                >
                  {isMonthClosureUpdating ? '更新中...' : importMonthClosed ? '締め解除' : '月次締め'}
                </button>
              </div>

              {importMonthMessage && (
                <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                  {importMonthMessage}
                </div>
              )}

              {recentImportClosedMonths.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-medium text-zinc-500">最近の締め月</p>
                  <div className="flex flex-wrap gap-2">
                    {recentImportClosedMonths.slice(0, 6).map((row) => (
                      <span
                        key={`${row.target_year_month}-${row.closed_at ?? 'open'}`}
                        className="rounded-full bg-white px-2.5 py-1 text-xs text-zinc-600 ring-1 ring-zinc-200"
                      >
                        {row.target_year_month}
                      </span>
                    ))}
                  </div>
                </div>
              )}
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
