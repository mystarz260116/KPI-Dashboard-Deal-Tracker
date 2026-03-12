import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface MergeCandidate {
  prospect_customer_id: string;
  prospect_name: string;
  customer_code: string;
  customer_name: string;
  match_score: number;
  match_reason: string;
}

export default function CustomerMerge() {
  const [candidates, setCandidates] = useState<MergeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function loadCandidates() {
    const res = await fetch('/api/merge/candidates');
    if (!res.ok) return;
    const data = await res.json();
    setCandidates(data ?? []);
  }

  async function handleMerge(prospectId: string, customerCode: string) {
    await fetch('/api/merge/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_customer_id: prospectId,
        customer_code: customerCode,
      }),
    });

    await loadCandidates();
  }

  async function handleReject(prospectId: string, customerCode: string) {
    await fetch('/api/merge/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prospect_customer_id: prospectId,
        customer_code: customerCode,
      }),
    });

    await loadCandidates();
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadCandidates();
      setLoading(false);
    }

    init();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">取引先マージ</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="rounded-lg border px-3 py-1.5 text-sm"
        >
          ダッシュボードへ戻る
        </button>
      </div>

      {loading && (
        <div className="text-sm text-zinc-500">候補を読み込み中...</div>
      )}

      {!loading && candidates.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          マージ候補はありません。CSV取込後に同期処理を実行してください。
        </div>
      )}

      {!loading && candidates.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50">
              <tr className="text-left">
                <th className="px-4 py-3">仮登録院</th>
                <th className="px-4 py-3">候補取引先</th>
                <th className="px-4 py-3">一致度</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>

            <tbody>
              {candidates.map((c) => (
                <tr key={`${c.prospect_customer_id}-${c.customer_code}`} className="border-t">
                  <td className="px-4 py-3">{c.prospect_name}</td>
                  <td className="px-4 py-3">{c.customer_name}</td>
                  <td className="px-4 py-3">
                    {(c.match_score * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleMerge(c.prospect_customer_id, c.customer_code)}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700"
                      >
                        マージ
                      </button>

                      <button
                        onClick={() => handleReject(c.prospect_customer_id, c.customer_code)}
                        className="rounded-lg bg-zinc-500 px-3 py-1.5 text-white hover:bg-zinc-600"
                      >
                        却下
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}