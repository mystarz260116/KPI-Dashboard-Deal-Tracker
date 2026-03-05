import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DealStatus } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Plus,
  Check,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Building2,
  Send,
  LayoutDashboard
} from 'lucide-react';

interface Clinic {
  id: string;
  name: string;
}

// ============================================
// 🚨 朱さんへ：差し替えが必要な箇所です
// --------------------------------------------
// 現在はデモ用のダミー医院リストです。
// 本番稼働時は /api/clinics から取得する
// 形に差し替えをお願いします🙏
// ============================================
const DUMMY_CLINICS: Clinic[] = [
  { id: '1', name: '山田歯科医院' },
  { id: '2', name: '田中デンタルクリニック' },
  { id: '3', name: 'さくら歯科' },
  { id: '4', name: '東京歯科クリニック' },
  { id: '5', name: '大阪デンタルオフィス' },
  { id: '6', name: 'ほほえみ歯科' },
  { id: '7', name: 'スマイル歯科医院' },
  { id: '8', name: '北浜デンタルクリニック' },
  { id: '9', name: '高槻歯科医院' },
  { id: '10', name: 'みなみ歯科クリニック' },
];

export default function DealInput() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'clinic' | 'details' | 'success'>('clinic');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [isCreatingClinic, setIsCreatingClinic] = useState(false);
  const [newClinicName, setNewClinicName] = useState('');

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [productName, setProductName] = useState('');
  const [unitCount, setUnitCount] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<DealStatus>('proposal');
  const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [isNewClient, setIsNewClient] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 検索フィルター（ダミーデータから絞り込み）
  const filteredClinics = searchQuery.length > 1
    ? DUMMY_CLINICS.filter(c => c.name.includes(searchQuery))
    : [];

  const handleCreateClinic = () => {
    if (!newClinicName) return;
    // ============================================
    // 🚨 朱さんへ：差し替えが必要な箇所です
    // --------------------------------------------
    // 本番稼働時は /api/clinics にPOSTして
    // 新規医院を登録する形に差し替えをお願いします🙏
    // ============================================
    const newClinic: Clinic = {
      id: String(Date.now()),
      name: newClinicName,
    };
    setSelectedClinic(newClinic);
    setIsCreatingClinic(false);
    setNewClinicName('');
    setStep('details');
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedClinic) return;

    setIsSubmitting(true);
    setError('');

    // ============================================
    // 🚨 朱さんへ：差し替えが必要な箇所です
    // --------------------------------------------
    // 本番稼働時は /api/deals にPOSTして
    // 商談データを登録する形に差し替えをお願いします🙏
    //
    // 差し替え後のコード例↓
    // const res = await fetch('/api/deals', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({
    //     userId: user?.id,
    //     clinicId: selectedClinic.id,
    //     date, productName,
    //     unitCount: parseInt(unitCount),
    //     amount: parseInt(amount),
    //     status, notes, nextAction, isNewClient,
    //   }),
    // });
    // ============================================

    // デモ用：0.8秒待って成功画面へ
    setTimeout(() => {
      setIsSubmitting(false);
      setStep('success');
    }, 800);
  };

  const handleReset = () => {
    setStep('clinic');
    setSelectedClinic(null);
    setSearchQuery('');
    setDate(new Date().toISOString().split('T')[0]);
    setProductName('');
    setUnitCount('');
    setAmount('');
    setStatus('proposal');
    setNotes('');
    setNextAction('');
    setIsNewClient(false);
    setError('');
  };

  return (
    <div className="min-h-screen bg-zinc-200 p-4 sm:p-8">
      <div className="mx-auto max-w-xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <button
            onClick={() => step === 'details' ? setStep('clinic') : navigate('/dashboard')}
            className="flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            {step === 'details' ? '医院選択に戻る' : 'ダッシュボード'}
          </button>
          <div className="flex h-2 w-24 gap-1">
            <div className={`h-full flex-1 rounded-full ${step === 'clinic' ? 'bg-purple-500' : 'bg-purple-200'}`} />
            <div className={`h-full flex-1 rounded-full ${step === 'details' ? 'bg-purple-500' : 'bg-purple-200'}`} />
            <div className={`h-full flex-1 rounded-full ${step === 'success' ? 'bg-purple-500' : 'bg-purple-200'}`} />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* ステップ1：医院選択 */}
          {step === 'clinic' && (
            <motion.div
              key="clinic"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-zinc-200">
                <h2 className="mb-4 text-xl font-bold text-zinc-900">
                  取引先（医院）を選択 <span className="text-red-500">*</span>
                </h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="医院名で検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-10 pr-4 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                </div>

                <div className="mt-4 space-y-2">
                  {filteredClinics.map((clinic) => (
                    <button
                      key={clinic.id}
                      onClick={() => {
                        setSelectedClinic(clinic);
                        setStep('details');
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-zinc-100 p-4 text-left transition hover:bg-zinc-50"
                    >
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-zinc-400" />
                        <span className="font-medium text-zinc-900">{clinic.name}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-300" />
                    </button>
                  ))}

                  {searchQuery.length > 1 && filteredClinics.length === 0 && !isCreatingClinic && (
                    <div className="py-8 text-center">
                      <p className="text-sm text-zinc-500">候補が見つかりませんでした</p>
                      <button
                        onClick={() => {
                          setNewClinicName(searchQuery);
                          setIsCreatingClinic(true);
                        }}
                        className="mt-4 inline-flex items-center rounded-lg bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-600 hover:bg-purple-100"
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        新規作成する
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isCreatingClinic && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl bg-white p-6 shadow-sm border border-zinc-200"
                >
                  <h3 className="mb-4 font-bold text-zinc-900">新規医院登録</h3>
                  <input
                    type="text"
                    placeholder="正式な医院名を入力"
                    value={newClinicName}
                    onChange={(e) => setNewClinicName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-4 py-2 focus:border-purple-500 focus:outline-none"
                  />
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={handleCreateClinic}
                      className="flex-1 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 py-2 text-sm font-semibold text-white hover:opacity-90"
                    >
                      登録して選択
                    </button>
                    <button
                      onClick={() => setIsCreatingClinic(false)}
                      className="flex-1 rounded-lg bg-zinc-100 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-200"
                    >
                      キャンセル
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ステップ2：詳細入力 */}
          {step === 'details' && selectedClinic && (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-zinc-200">
                <div className="mb-6 flex items-center gap-3 border-b border-zinc-100 pb-4">
                  <div className="rounded-full bg-purple-50 p-2">
                    <Building2 className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">選択中の医院</p>
                    <p className="font-bold text-zinc-900">{selectedClinic.name}</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* 日付 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      日付 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  {/* 製品名 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      製品名 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="製品名を入力"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  {/* 受注本数 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      受注本数 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={unitCount}
                      onChange={(e) => setUnitCount(e.target.value)}
                      placeholder="0"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-lg font-bold focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  {/* 受注金額 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      受注金額（円） <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="500000"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-lg font-bold focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  {/* ステータス */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      ステータス <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'proposal',    label: '提案中' },
                        { value: 'negotiating', label: '交渉中' },
                        { value: 'won',         label: '受注'   },
                        { value: 'lost',        label: '失注'   },
                      ] as const).map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setStatus(s.value)}
                          className={`rounded-xl py-3 text-sm font-semibold transition ${
                            status === s.value
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                              : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 内容・メモ */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      内容・メモ
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="商談の内容を記入"
                      rows={3}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  {/* 次アクション */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      次アクション
                    </label>
                    <input
                      type="text"
                      value={nextAction}
                      onChange={(e) => setNextAction(e.target.value)}
                      placeholder="例：来週サンプル持参"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  {/* 新規クライアント */}
                  <div className="flex items-center gap-3 rounded-xl border border-zinc-100 p-4">
                    <input
                      type="checkbox"
                      id="newClient"
                      checked={isNewClient}
                      onChange={(e) => setIsNewClient(e.target.checked)}
                      className="h-5 w-5 rounded border-zinc-300 text-purple-600 focus:ring-purple-500"
                    />
                    <label htmlFor="newClient" className="text-sm font-medium text-zinc-700">
                      新規クライアント（既存でない）
                    </label>
                  </div>

                  {error && (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 py-4 font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-5 w-5" />
                    )}
                    商談を登録する
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {/* ステップ3：送信完了 */}
          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                <Check className="h-10 w-10" />
              </div>
              <h2 className="mb-2 text-2xl font-bold text-zinc-900">登録完了！</h2>
              <p className="mb-8 text-zinc-500">商談が正常に登録されました。</p>

              <div className="space-y-3">
                <button
                  onClick={handleReset}
                  className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 py-4 font-bold text-white shadow-md transition hover:opacity-90"
                >
                  続けて入力する
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="flex w-full items-center justify-center rounded-xl bg-white border border-zinc-200 py-4 font-bold text-zinc-600 transition hover:bg-zinc-50"
                >
                  <LayoutDashboard className="mr-2 h-5 w-5" />
                  ダッシュボードへ
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
