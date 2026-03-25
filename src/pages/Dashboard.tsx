import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { KPIData, Granularity, Period } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  PlusCircle, Filter, Calendar, Users,
  TrendingUp, Target, LogOut, Download
} from 'lucide-react';
import { motion } from 'motion/react';
import logoImg from '../assets/M.png';

interface User {
  id: string;
  name: string;
  department: string;
}

const COLORS = ['#6366f1', '#10b981'];

interface SectionTitleProps { title: string; color: string; }
function SectionTitle({ title, color }: SectionTitleProps) {
  return (
    <h2 className="mb-4 text-lg font-bold text-zinc-800 pb-2 border-b-2" style={{ borderColor: color }}>
      {title}
    </h2>
  );
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingMergeCount, setPendingMergeCount] = useState(0);
  const [isMergeCountLoading, setIsMergeCountLoading] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [importResultMessage, setImportResultMessage] = useState('');

  const departmentOptions = Array.from(
    new Set(users.map(u => u.department).filter(Boolean))
  );
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
    const fetchPendingMergeCount = async () => {
      setIsMergeCountLoading(true);

      try {
        const res = await fetch('/api/merge/candidates/count');
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

    fetchPendingMergeCount();
  }, []);
  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      setError('');

      try {
        const usersRes = await fetch('/api/users');
        if (!usersRes.ok) {
          throw new Error('users fetch failed');
        }

        const usersData: User[] = await usersRes.json();
        setUsers(usersData);

        const params = new URLSearchParams({
          period: appliedPeriod,
          granularity: appliedGranularity,
          from: appliedFromDate,
          to: appliedToDate,
        });

        if (appliedDept) params.set('department', appliedDept);
        if (appliedUser) params.set('userId', appliedUser);

        const kpiRes = await fetch(`/api/kpi?${params.toString()}`);
        if (!kpiRes.ok) {
          throw new Error('kpi fetch failed');
        }

        const kpiData = await kpiRes.json();
        setData(kpiData);
      } catch (err) {
        console.error('dashboard fetch error:', err);
        setError('ダッシュボードの取得に失敗しました');
        setUsers([]);
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

  const parseCsvText = (text: string) => {
    const normalized = text.replace(/^\uFEFF/, '');
    const lines = normalized
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      return [];
    }

    const headers = parseCsvLine(lines[0]);

    return lines
      .slice(1)
      .map(line => {
        const cells = parseCsvLine(line);
        return headers.reduce<Record<string, string>>((row, header, index) => {
          row[header] = cells[index] ?? '';
          return row;
        }, {});
      })
      // 空行・無効行を除外（得意先コードが空の行は除外）
      .filter(row => String(row['得意先コード'] ?? '').trim() !== '');
  };

  const uploadSalesCsv = async () => {
    if (!selectedCsvFile) {
      setImportResultMessage('CSVファイルを選択してください。');
      return;
    }

    setIsImportingCsv(true);
    setImportResultMessage('');

    try {
      const csvText = await selectedCsvFile.text();
      const rows = parseCsvText(csvText);

      console.log('CSV rows length:', rows.length);
      console.log('CSV first rows:', rows.slice(0, 5));

      if (rows.length === 0) {
        throw new Error('CSVに取込対象の行がありません。');
      }

      const importBatchId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let uploadedCount = 0;

      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);

        const uploadRes = await fetch('/api/import/sales/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ rows: chunk, import_batch_id: importBatchId }),
        });

        const uploadContentType = uploadRes.headers.get('content-type') ?? '';
        const uploadResult = uploadContentType.includes('application/json')
          ? await uploadRes.json()
          : null;

        if (!uploadRes.ok) {
          throw new Error(uploadResult?.error ?? 'CSV取込に失敗しました。');
        }

        uploadedCount += uploadResult?.uploaded_count ?? chunk.length;
      }

      const finalizeRes = await fetch('/api/import/sales/finalize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ import_batch_id: importBatchId }),
      });

      const finalizeContentType = finalizeRes.headers.get('content-type') ?? '';
      const finalizeResult = finalizeContentType.includes('application/json')
        ? await finalizeRes.json()
        : null;

      if (!finalizeRes.ok) {
        throw new Error(finalizeResult?.error ?? '取込後の同期処理に失敗しました。');
      }

      setImportResultMessage(
        `CSV取込と同期処理が完了しました。取込件数: ${uploadedCount}件 / 顧客担当紐付け更新: ${finalizeResult?.customer_external_staff_maps_upserted ?? 0}件 / 候補生成件数: ${finalizeResult?.inserted_count ?? 0}件`
      );
      setSelectedCsvFile(null);
      setPendingMergeCount(finalizeResult?.inserted_count ?? pendingMergeCount);
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
            <button onClick={() => {
              setIsImportModalOpen(true);
              setImportResultMessage('');
            }}
              className="flex items-center gap-1 rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
              <PlusCircle className="h-4 w-4" />CSV取込
            </button>

            <button onClick={() => navigate('/deals/history')}
              className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              <TrendingUp className="h-4 w-4" />商談履歴
            </button>

            <button onClick={() => navigate('/customer-merge')}
              className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100">
              <Target className="h-4 w-4" />取引先マージ
              {!isMergeCountLoading && pendingMergeCount > 0 && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                  {pendingMergeCount}
                </span>
              )}
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
              未対応の取引先マージ候補が <span className="font-bold">{pendingMergeCount}件</span> あります。
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
                  <option key={d} value={d}>{d}</option>
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
            <p className="mt-2 text-sm text-zinc-500">
              期間内新規作成取引先のうち、新規受注に至った割合
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="rounded-xl bg-white p-6 shadow-sm">
            <SectionTitle title="受注単価 / 医院" color="#ec4899" />
            <p className="text-4xl font-bold text-pink-500">¥{(data?.avg_order_value ?? 0).toLocaleString()}</p>
            <p className="mt-2 text-sm text-zinc-500">
              新規取引先売上 ÷ 新規取引先数
            </p>
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
