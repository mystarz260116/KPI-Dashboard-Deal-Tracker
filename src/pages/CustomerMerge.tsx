import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '../lib/authFetch';
import { motion } from 'motion/react';
import { GitMerge, LayoutDashboard, CheckCircle, XCircle, LogOut, TrendingUp } from 'lucide-react';

interface MergeCandidate {
  source: 'merge_candidate' | 'detected_new_order';
  prospect_customer_id?: string;
  prospect_name?: string;
  customer_code: string;
  customer_name: string;
  match_score?: number;
  match_reason?: string;
  detected_month?: string;
  data_kind?: 'delivery' | 'order';
  department_id?: number | null;
  user_id?: string;
  amount?: number;
  ordered_at?: string;
}

type ImportDataKind = 'delivery' | 'order';
const candidateListInFlight = new Map<string, Promise<MergeCandidate[]>>();

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function CustomerMerge() {
  const { user, logout, isLoading: isAuthLoading } = useAuth();
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [merging, setMerging] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [targetMonth, setTargetMonth] = useState(getCurrentMonth);
  const [dataKind, setDataKind] = useState<ImportDataKind>('delivery');
  const latestRequestKeyRef = useRef('');
  const navigate = useNavigate();

  function logTiming(label: string, startedAt: number, detail?: Record<string, unknown>) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    console.info(`[perf] customer-merge ${label} ${elapsedMs}ms`, detail ?? {});
  }

  function buildCandidateQuery() {
    const params = new URLSearchParams({
      month: targetMonth,
      data_kind: dataKind,
      ts: String(Date.now()),
    });

    return params.toString();
  }

  async function loadCandidates() {
    const startedAt = performance.now();
    const requestKey = `${targetMonth}:${dataKind}`;
    latestRequestKeyRef.current = requestKey;
    console.info('[perf] customer-merge load-candidates start', { month: targetMonth, dataKind, requestKey });
    try {
      setError('');
      setMessage('');

      const existingRequest = candidateListInFlight.get(requestKey);
      if (existingRequest) {
        console.info('[perf] customer-merge candidate-list reused in-flight', { requestKey });
      }

      const requestPromise = existingRequest ?? (async () => {
        const listStartedAt = performance.now();
        const res = await authFetch(`/api/merge/candidates?${buildCandidateQuery()}`, {
          cache: 'no-store',
        });
        logTiming('candidate-list response', listStartedAt, { status: res.status, requestKey });
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
        const parseStartedAt = performance.now();
        const data = await res.json();
        logTiming('candidate-list parsed', parseStartedAt, { rows: Array.isArray(data) ? data.length : null, requestKey });
        return Array.isArray(data) ? data : [];
      })();

      if (!existingRequest) {
        candidateListInFlight.set(requestKey, requestPromise);
      }

      const data = await requestPromise.finally(() => {
        candidateListInFlight.delete(requestKey);
      });

      if (latestRequestKeyRef.current !== requestKey) {
        console.info('[perf] customer-merge stale response ignored', { requestKey, latest: latestRequestKeyRef.current });
        return;
      }

      setCandidates(data);
      setPendingCount(data.length);
      logTiming('load-candidates complete', startedAt, { rows: data.length, requestKey });
    } catch (fetchError) {
      console.error('failed to load merge candidates', fetchError);
      setCandidates([]);
      setPendingCount(0);
      setError(fetchError instanceof Error ? fetchError.message : '受注確認候補の取得に失敗しました');
      logTiming('load-candidates failed', startedAt);
    }
  }

  async function handleMerge(prospectId: string, customerCode: string) {
    const startedAt = performance.now();
    console.info('[perf] customer-merge merge start', { prospectId, customerCode });
    setMerging(prospectId);
    try {
      const requestStartedAt = performance.now();
      const response = await authFetch('/api/merge/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_customer_id: prospectId,
          customer_code: customerCode,
        }),
      });
      logTiming('merge response', requestStartedAt, { status: response.status });
      if (!response.ok) throw new Error('受注確認に失敗しました');
      setMessage('受注確認しました。');
      setCandidates((current) => current.filter((candidate) => (
        !(candidate.source === 'merge_candidate'
          && candidate.prospect_customer_id === prospectId
          && candidate.customer_code === customerCode)
      )));
      setPendingCount((current) => Math.max(0, current - 1));
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : '受注確認に失敗しました');
    }
    setMerging(null);
    logTiming('merge complete', startedAt);
  }

  async function handleReject(prospectId: string, customerCode: string) {
    const startedAt = performance.now();
    console.info('[perf] customer-merge reject start', { prospectId, customerCode });
    setRejecting(prospectId);
    try {
      const requestStartedAt = performance.now();
      const response = await authFetch('/api/merge/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_customer_id: prospectId,
          customer_code: customerCode,
        }),
      });
      logTiming('reject response', requestStartedAt, { status: response.status });
      if (!response.ok) throw new Error('候補の却下に失敗しました');
      setMessage('候補を却下しました。');
      setCandidates((current) => current.filter((candidate) => (
        !(candidate.source === 'merge_candidate'
          && candidate.prospect_customer_id === prospectId
          && candidate.customer_code === customerCode)
      )));
      setPendingCount((current) => Math.max(0, current - 1));
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : '候補の却下に失敗しました');
    }
    setRejecting(null);
    logTiming('reject complete', startedAt);
  }

  async function handleDetectedOrder(candidate: MergeCandidate, action: 'approve' | 'reject') {
    const startedAt = performance.now();
    console.info('[perf] customer-merge detected-order start', {
      action,
      customerCode: candidate.customer_code,
      amount: candidate.amount,
      month: candidate.detected_month ?? targetMonth,
    });
    const actionKey = `${action}:${candidate.customer_code}`;
    if (action === 'approve') {
      setMerging(actionKey);
    } else {
      setRejecting(actionKey);
    }

    try {
      const requestStartedAt = performance.now();
      const response = await authFetch('/api/kpi?path=detected-new-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          data_kind: candidate.data_kind ?? dataKind,
          detected_month: candidate.detected_month ?? targetMonth,
          customer_code: candidate.customer_code,
          customer_name: candidate.customer_name,
          department_id: candidate.department_id,
          user_id: candidate.user_id,
          amount: candidate.amount,
          ordered_at: candidate.ordered_at,
        }),
      });
      logTiming('detected-order response', requestStartedAt, { action, status: response.status });

      const parseStartedAt = performance.now();
      const payload = await response.json().catch(() => null);
      logTiming('detected-order parsed', parseStartedAt, {
        action,
        ok: payload?.ok ?? null,
        dealId: payload?.deal_id ?? null,
      });
      if (!response.ok) {
        throw new Error(payload?.error ?? '候補の更新に失敗しました');
      }

      setMessage(action === 'approve'
        ? '受注確認として進捗ボードに追加しました。'
        : '候補を却下しました。');
      setCandidates((current) => current.filter((row) => (
        !(row.source === 'detected_new_order' && row.customer_code === candidate.customer_code)
      )));
      setPendingCount((current) => Math.max(0, current - 1));
    } catch (detectedError) {
      setError(detectedError instanceof Error ? detectedError.message : '候補の更新に失敗しました');
      logTiming('detected-order failed', startedAt, { action });
    } finally {
      setMerging(null);
      setRejecting(null);
      logTiming('detected-order complete', startedAt, { action });
    }
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
  }, [isAuthLoading, user?.id, targetMonth, dataKind]);

  function getScoreColor(score: number) {
    if (score >= 0.9) return 'text-emerald-600 bg-emerald-50';
    if (score >= 0.8) return 'text-amber-600 bg-amber-50';
    return 'text-red-500 bg-red-50';
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  function candidateKey(candidate: MergeCandidate) {
    return candidate.source === 'detected_new_order'
      ? `detected:${candidate.customer_code}`
      : `merge:${candidate.prospect_customer_id}:${candidate.customer_code}`;
  }

  function isCandidateBusy(candidate: MergeCandidate, action: 'approve' | 'reject') {
    if (candidate.source === 'detected_new_order') {
      return (action === 'approve' ? merging : rejecting) === `${action}:${candidate.customer_code}`;
    }

    return (action === 'approve' ? merging : rejecting) === candidate.prospect_customer_id;
  }

  function approveCandidate(candidate: MergeCandidate) {
    if (candidate.source === 'detected_new_order') {
      void handleDetectedOrder(candidate, 'approve');
      return;
    }

    if (candidate.prospect_customer_id) {
      void handleMerge(candidate.prospect_customer_id, candidate.customer_code);
    }
  }

  function rejectCandidate(candidate: MergeCandidate) {
    if (candidate.source === 'detected_new_order') {
      void handleDetectedOrder(candidate, 'reject');
      return;
    }

    if (candidate.prospect_customer_id) {
      void handleReject(candidate.prospect_customer_id, candidate.customer_code);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-200">
      <header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <GitMerge className="h-5 w-5 text-indigo-600" />
          <h1 className="truncate text-base font-bold text-zinc-800 sm:text-lg">受注確認候補</h1>
          {pendingCount > 0 && (
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
              {pendingCount}
            </span>
          )}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button
            onClick={() => navigate(user?.can_view_dashboard ? '/dashboard' : '/deals/new')}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:flex-none sm:justify-start sm:py-1.5"
          >
            <LayoutDashboard className="h-4 w-4" />
            {user?.can_view_dashboard ? 'ダッシュボード' : '入力画面'}
          </button>
          <button
            onClick={() => navigate('/deals/progress')}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 sm:flex-none sm:justify-start sm:py-1.5"
          >
            <TrendingUp className="h-4 w-4" />
            進捗管理
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

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 xl:px-10">
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-base font-black text-zinc-900">確認対象</p>
              <p className="mt-2 text-sm font-medium text-zinc-500">
                仮登録院の名寄せ候補と、売上明細から検知した商談未登録の新規受注候補を表示します。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="month"
                value={targetMonth}
                onChange={(event) => setTargetMonth(event.target.value)}
                className="h-11 rounded-lg border border-zinc-200 px-4 text-base font-black text-zinc-700 outline-none focus:border-indigo-300"
              />
              <div className="flex rounded-lg bg-zinc-100 p-1">
                {(['delivery', 'order'] as ImportDataKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setDataKind(kind)}
                    className={`h-9 min-w-[64px] rounded-md px-4 text-base font-black transition ${
                      dataKind === kind
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-800'
                    }`}
                  >
                    {kind === 'delivery' ? '納品' : '受注'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <span>{message}</span>
            <button
              type="button"
              onClick={() => navigate('/deals/progress')}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-emerald-700"
            >
              進捗管理を見る
            </button>
          </div>
        )}

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
            className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
          >
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-[1120px] w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[150px]" />
                  <col className="w-[310px]" />
                  <col className="w-[320px]" />
                  <col className="w-[150px]" />
                  <col className="w-[250px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-black text-zinc-500">
                    <th className="px-6 py-4">種別</th>
                    <th className="px-6 py-4">候補</th>
                    <th className="px-6 py-4">取引先</th>
                    <th className="px-6 py-4 text-right">金額 / 一致度</th>
                    <th className="px-6 py-4">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <motion.tr
                      key={candidateKey(c)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-t border-zinc-100 text-zinc-800 hover:bg-zinc-50"
                    >
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          c.source === 'detected_new_order'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-indigo-50 text-indigo-700'
                        }`}
                        >
                          {c.source === 'detected_new_order' ? '受注明細' : '名寄せ'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="line-clamp-2 text-base font-bold leading-relaxed text-zinc-900">
                          {c.source === 'detected_new_order' ? c.customer_name : c.prospect_name}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="line-clamp-2 text-base font-semibold leading-relaxed text-zinc-700">
                          {c.customer_name}
                        </div>
                        <div className="mt-1 font-mono text-xs font-bold text-zinc-400">{c.customer_code}</div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {c.source === 'detected_new_order' ? (
                          <span className="text-base font-black text-zinc-950">¥{Number(c.amount ?? 0).toLocaleString()}</span>
                        ) : (
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getScoreColor(c.match_score ?? 0)}`}>
                            {((c.match_score ?? 0) * 100).toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => approveCandidate(c)}
                            disabled={isCandidateBusy(c, 'approve') || isCandidateBusy(c, 'reject')}
                            className="inline-flex h-10 min-w-[124px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold leading-none text-white transition hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {isCandidateBusy(c, 'approve') ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <GitMerge className="h-3.5 w-3.5" />
                            )}
                            {c.source === 'detected_new_order' ? '受注確認に追加' : '受注確認'}
                          </button>

                          <button
                            onClick={() => rejectCandidate(c)}
                            disabled={isCandidateBusy(c, 'reject') || isCandidateBusy(c, 'approve')}
                            className="inline-flex h-10 min-w-[78px] items-center justify-center gap-2 rounded-lg bg-zinc-500 px-4 text-sm font-bold leading-none text-white transition hover:bg-zinc-600 disabled:opacity-50"
                          >
                            {isCandidateBusy(c, 'reject') ? (
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
                  key={candidateKey(c)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-t border-zinc-100 p-4 first:border-t-0"
                >
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">種別</p>
                      <p className="mt-1">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          c.source === 'detected_new_order'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-indigo-50 text-indigo-700'
                        }`}
                        >
                          {c.source === 'detected_new_order' ? '受注明細' : '名寄せ'}
                        </span>
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">候補</p>
                      <p className="mt-1 text-sm font-medium text-zinc-800">
                        {c.source === 'detected_new_order' ? c.customer_name : c.prospect_name}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">取引先</p>
                      <p className="mt-1 text-sm text-zinc-600">{c.customer_name}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">金額 / 一致度</p>
                      <div className="mt-1">
                        {c.source === 'detected_new_order' ? (
                          <span className="font-black text-zinc-900">¥{Number(c.amount ?? 0).toLocaleString()}</span>
                        ) : (
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getScoreColor(c.match_score ?? 0)}`}>
                            {((c.match_score ?? 0) * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => approveCandidate(c)}
                        disabled={isCandidateBusy(c, 'approve') || isCandidateBusy(c, 'reject')}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {isCandidateBusy(c, 'approve') ? (
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <GitMerge className="h-3.5 w-3.5" />
                            )}
                            {c.source === 'detected_new_order' ? '追加' : '受注確認'}
                          </button>

                      <button
                        onClick={() => rejectCandidate(c)}
                        disabled={isCandidateBusy(c, 'reject') || isCandidateBusy(c, 'approve')}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-500 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-600 disabled:opacity-50"
                      >
                        {isCandidateBusy(c, 'reject') ? (
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
