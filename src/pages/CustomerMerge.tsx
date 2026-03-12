import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { GitMerge, LayoutDashboard, CheckCircle } from 'lucide-react';

interface MergeCandidate {
  prospect_customer_id: string;
  prospect_name: string;
  customer_code: string;
  customer_name: string;
  match_score: number;
  match_reason: string;
}

const DUMMY_CANDIDATES: MergeCandidate[] = [
  { prospect_customer_id: '1', prospect_name: '山田歯科医院', customer_code: 'C001', customer_name: '山田歯科', match_score: 0.86, match_reason: '名称類似' },
  { prospect_customer_id: '2', prospect_name: 'テスト歯科医院', customer_code: 'C002', customer_name: 'テスト歯科医院 v2', match_score: 0.75, match_reason: '名称類似' },
  { prospect_customer_id: '3', prospect_name: 'さくらデンタルクリニック', customer_code: 'C003', customer_name: 'さくら歯科', match_score: 0.92, match_reason: '名称類似' },
];

export default function CustomerMerge() {
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<string | null>(null);
  const navigate = useNavigate();

  async function loadCandidates() {
    try {
      const res = await fetch('/api/merge/candidates');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCandidates(data ?? []);
    } catch {
      setCandidates(DUMMY_CANDIDATES);
    }
  }

  async function handleMerge(prospectId: string, customerCode: string) {
    setMerging(prospectId);
    try {
      await fetch('/api/merge/confirm', {
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

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadCandidates();
      setLoading(false);
    }
    init();
  }, []);

  function getScoreColor(score: number) {
    if (score >= 0.9) return 'text-emerald-600 bg-emerald-50';
    if (score >= 0.7) return 'text-amber-600 bg-amber-50';
    return 'text-red-500 bg-red-50';
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <GitMerge className="h-5 w-5 text-indigo-600" />
          <h1 className="text-lg font-bold text-zinc-800">取引先マージ</h1>
          {candidates.length > 0 && (
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
              {candidates.length}
            </span>
          )}
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <LayoutDashboard className="h-4 w-4" />
          ダッシュボードへ戻る
        </button>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          </div>
        )}

        {!loading && candidates.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-white py-20 text-center shadow-sm"
          >
            <CheckCircle className="mb-4 h-12 w-12 text-emerald-500" />
            <p className="text-lg font-semibold text-zinc-700">マージ候補はありません</p>
            <p className="mt-1 text-sm text-zinc-400">CSV取込後に同期処理を実行してください</p>
          </motion.div>
        )}

        {!loading && candidates.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
          >
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
                      <button
                        onClick={() => handleMerge(c.prospect_customer_id, c.customer_code)}
                        disabled={merging === c.prospect_customer_id}
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {merging === c.prospect_customer_id ? (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <GitMerge className="h-3.5 w-3.5" />
                        )}
                        マージ
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </main>
    </div>
  );
}
