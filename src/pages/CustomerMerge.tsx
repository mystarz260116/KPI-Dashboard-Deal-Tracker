import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../lib/authFetch';
import { motion } from 'motion/react';
import { GitMerge, LayoutDashboard, CheckCircle, XCircle, LogOut } from 'lucide-react';

interface MergeCandidate {
  prospect_customer_id: string;
  prospect_name: string;
  customer_code: string;
  customer_name: string;
  match_score: number;
  match_reason: string;
}

export default function CustomerMerge() {
  const { user, logout, isLoading: isAuthLoading } = useAuth();
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [merging, setMerging] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const navigate = useNavigate();

  async function loadPendingCount() {
    const res = await authFetch(`/api/merge/candidates/count?ts=${Date.now()}`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      let message = '受注確認候補件数の取得に失敗しました';
      try {
        const payload = await res.json();
        if (typeof payload?.error === 'string' && payload.error) {
          message = payload.error;
        }
      } catch {
        const text = await res.text().catch(() => '');
        if (text) {
          message = text;
        }
      }
      throw new Error(message);
    }

    const data = await res.json();
    const count = typeof data?.pending_count === 'number' ? data.pending_count : 0;
    setPendingCount(count);
    return count;
  }

  async function loadCandidates() {
    try {
      setError('');
      const count = await loadPendingCount();

      const fetchCandidates = async () => authFetch(`/api/merge/candidates?ts=${Date.now()}`, {
        cache: 'no-store',
      });

      let res = await fetchCandidates();
      if (!res.ok) {
        let message = '受注確認候補の取得に失敗しました';
        try {
          const payload = await res.json();
          if (typeof payload?.error === 'string' && payload.error) {
            message = payload.error;
          }
        } catch {
          const text = await res.text().catch(() => '');
          if (text) {
            message = text;
          }
        }
        throw new Error(message);
      }
      let data = await res.json();

      // 件数APIでは候補ありなのに一覧が空なら、一度だけ再取得して揺れを吸収する
      if (count > 0 && Array.isArray(data) && data.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        res = await fetchCandidates();
        if (!res.ok) {
          throw new Error('受注確認候補一覧の再取得に失敗しました');
        }
        data = await res.json();
      }

      if (count > 0 && Array.isArray(data) && data.length === 0) {
        throw new Error(`受注確認候補は ${count} 件ありますが、一覧の取得結果が空でした`);
      }

      setCandidates(data ?? []);
    } catch (fetchError) {
      console.error('failed to load merge candidates', fetchError);
      setCandidates([]);
      setPendingCount(0);
      setError(fetchError instanceof Error ? fetchError.message : '受注確認候補の取得に失敗しました');
    }
  }

  async function handleMerge(prospectId: string, customerCode: string) {
    setMerging(prospectId);
    try {
      await authFetch('/api/merge/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_customer_id: prospectId,
          customer_code: customerCode,
        }),
      });
    } catch {}
    await loadCandidates();
    setMerging(null);
  }

  async function handleReject(prospectId: string, customerCode: string) {
    setRejecting(prospectId);
    try {
      await authFetch('/api/merge/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_customer_id: prospectId,
          customer_code: customerCode,
        }),
      });
    } catch {}
    await loadCandidates();
    setRejecting(null);
  }

  useEffect(() => {
    async function init() {
      if (isAuthLoading) {
        return;
      }

      if (!user?.id) {
        setCandidates([]);
        setLoading(false);
        setError('ログイン情報の確認中に候補を取得できませんでした。ページを再読み込みしてください。');
        return;
      }

      setLoading(true);
      await loadCandidates();
      setLoading(false);
    }
    init();
  }, [isAuthLoading, user?.id]);

  function getScoreColor(score: number) {
    if (score >= 0.9) return 'text-emerald-600 bg-emerald-50';
    if (score >= 0.8) return 'text-amber-600 bg-amber-50';
    return 'text-red-500 bg-red-50';
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-zinc-200">
      <header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <GitMerge className="h-5 w-5 text-indigo-600" />
          <h1 className="truncate text-base font-bold text-zinc-800 sm:text-lg">受注確認</h1>
          {pendingCount > 0 && (
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
              {pendingCount}
            </span>
          )}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button
            onClick={() => navigate('/deals/new')}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:flex-none sm:justify-start sm:py-1.5"
          >
            <LayoutDashboard className="h-4 w-4" />
            入力画面へ戻る
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="ログアウト"
            title="ログアウト"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          </div>
        )}

        {!loading && candidates.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-16 text-center shadow-sm sm:py-20"
          >
            <CheckCircle className="mb-4 h-12 w-12 text-emerald-500" />
            <p className="text-lg font-semibold text-zinc-700">
              {error ? '受注確認候補を取得できませんでした' : '受注確認候補はありません'}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {error || 'CSV取込後に同期処理を実行してください'}
            </p>
            {!error && pendingCount > 0 && (
              <p className="mt-2 text-sm font-medium text-amber-600">
                候補件数は {pendingCount} 件あります。再読み込みしてください。
              </p>
            )}
            {error && (
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void loadCandidates().finally(() => setLoading(false));
                }}
                className="mt-5 rounded-lg border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
              >
                再読み込み
              </button>
            )}
          </motion.div>
        )}

        {!loading && candidates.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-zinc-200 bg-white shadow-sm"
          >
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <th className="px-6 py-4">仮登録院</th>
                    <th className="px-6 py-4">候補取引先</th>
                    <th className="px-6 py-4">一致度</th>
                    <th className="px-6 py-4">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <motion.tr
                      key={`${c.prospect_customer_id}-${c.customer_code}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-t border-zinc-100 hover:bg-zinc-50"
                    >
                      <td className="px-6 py-4 font-medium text-zinc-800">{c.prospect_name}</td>
                      <td className="px-6 py-4 text-zinc-600">{c.customer_name}</td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getScoreColor(c.match_score)}`}>
                          {(c.match_score * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleMerge(c.prospect_customer_id, c.customer_code)}
                            disabled={merging === c.prospect_customer_id || rejecting === c.prospect_customer_id}
                            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {merging === c.prospect_customer_id ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <GitMerge className="h-3.5 w-3.5" />
                            )}
                            受注確認
                          </button>

                          <button
                            onClick={() => handleReject(c.prospect_customer_id, c.customer_code)}
                            disabled={rejecting === c.prospect_customer_id || merging === c.prospect_customer_id}
                            className="flex items-center gap-1.5 rounded-lg bg-zinc-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
                          >
                            {rejecting === c.prospect_customer_id ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5" />
                            )}
                            却下
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden">
              {candidates.map((c) => (
                <motion.div
                  key={`${c.prospect_customer_id}-${c.customer_code}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-t border-zinc-100 p-4 first:border-t-0"
                >
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">仮登録院</p>
                      <p className="mt-1 text-sm font-medium text-zinc-800">{c.prospect_name}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">候補取引先</p>
                      <p className="mt-1 text-sm text-zinc-600">{c.customer_name}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">一致度</p>
                      <div className="mt-1">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getScoreColor(c.match_score)}`}>
                          {(c.match_score * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => handleMerge(c.prospect_customer_id, c.customer_code)}
                        disabled={merging === c.prospect_customer_id || rejecting === c.prospect_customer_id}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {merging === c.prospect_customer_id ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <GitMerge className="h-3.5 w-3.5" />
                            )}
                            受注確認
                          </button>

                      <button
                        onClick={() => handleReject(c.prospect_customer_id, c.customer_code)}
                        disabled={rejecting === c.prospect_customer_id || merging === c.prospect_customer_id}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-500 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
                      >
                        {rejecting === c.prospect_customer_id ? (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        却下
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
