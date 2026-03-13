import { supabase } from '../lib/supabase';
import { useState, FormEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Plus, Check, ChevronRight, ArrowLeft,
  Loader2, Building2, Send, LayoutDashboard, GitMerge, BellRing
} from 'lucide-react';


interface Clinic {
  id: string;
  name: string;
  kind: 'customer' | 'prospect';
}

type ActivityType = 'visit' | 'proposal' | 'negotiating' | 'won' | 'lost';

export default function DealInput() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'clinic' | 'details' | 'success'>('clinic');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [isCreatingClinic, setIsCreatingClinic] = useState(false);
  const [newClinicName, setNewClinicName] = useState('');

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [mergeCandidateCount, setMergeCandidateCount] = useState(0);

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [activityType, setActivityType] = useState<ActivityType>('visit');
  const [productName, setProductName] = useState('');
  const [unitCount, setUnitCount] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const filteredClinics = clinics;

  const fetchMergeCandidateCount = async () => {
  try {
    const res = await fetch('/api/merge/candidates/count');
    if (!res.ok) {
      setMergeCandidateCount(0);
      return;
    }

    const data = await res.json();
    const count = typeof data?.count === 'number' ? data.count : 0;
    setMergeCandidateCount(count);
  } catch (err) {
    console.error('merge candidate count fetch error:', err);
    setMergeCandidateCount(0);
  }
};

    useEffect(() => {
    const fetchClinics = async () => {
      const keyword = searchQuery.trim();

      if (keyword.length === 0) {
        setClinics([]);
        setError('');
        return;
      }

      if (!user?.id) {
        setClinics([]);
        setError('');
        return;
      }

      const [{ data: customerData, error: customerError }, { data: prospectData, error: prospectError }] = await Promise.all([
        supabase
          .from('customers')
          .select('code, name')
          .or(`name.ilike.%${keyword}%,code.ilike.%${keyword}%`)
          .order('name', { ascending: true })
          .limit(20),
        supabase
          .from('prospect_customers')
          .select('id, name, status')
          .eq('created_by', user.id)
          .in('status', ['new', 'matched'])
          .ilike('name', `%${keyword}%`)
          .order('name', { ascending: true })
          .limit(20),
      ]);

      console.log('clinic search keyword:', keyword);
      console.log('customer search data:', customerData);
      console.log('customer search error:', customerError);
      console.log('prospect search data:', prospectData);
      console.log('prospect search error:', prospectError);

      if (customerError || prospectError) {
        console.error('clinic search error:', customerError ?? prospectError);
        setError('医院検索に失敗しました');
        setClinics([]);
        return;
      }

      setError('');

      const customerResults: Clinic[] = (customerData ?? []).map((c: any) => ({
        id: c.code,
        name: c.name,
        kind: 'customer',
      }));

      const prospectResults: Clinic[] = (prospectData ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        kind: 'prospect',
      }));

      const mergedResults = [...prospectResults, ...customerResults];
      setClinics(mergedResults);
    };

    fetchClinics();
  }, [searchQuery, user?.id]);

  const handleCreateClinic = async () => {
    const clinicName = newClinicName.trim();
    if (!clinicName || !user?.id) return;

    setError('');

    try {
      const { data, error: insertError } = await supabase
        .from('prospect_customers')
        .insert({
          name: clinicName,
          created_by: user.id,
          status: 'new',
        })
        .select('id, name')
        .single();

      if (insertError || !data) {
        console.error('prospect clinic insert error:', insertError);
        setError('新規医院の登録に失敗しました');
        return;
      }

      const newClinic: Clinic = {
        id: data.id,
        name: data.name,
        kind: 'prospect',
      };

      setSelectedClinic(newClinic);
      setIsCreatingClinic(false);
      setNewClinicName('');
      setStep('details');
    } catch (err) {
      console.error('prospect clinic create error:', err);
      setError('新規医院の登録に失敗しました');
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedClinic || !user?.id) return;

    setIsSubmitting(true);
    setError('');

    const payload = {
      user_id: user.id,
      customer_code: selectedClinic.kind === 'customer' ? selectedClinic.id : null,
      prospect_customer_id: selectedClinic.kind === 'prospect' ? selectedClinic.id : null,
      deal_date: date,
      activity_type: activityType,
      product_name: productName || null,
      unit_count: unitCount ? Number(unitCount) : null,
      amount: amount ? Number(amount) : null,
      notes: notes || null,
      next_action: nextAction || null,
    };

    try {
      const { error: insertError } = await supabase
        .from('deals')
        .insert(payload);

      if (insertError) {
        console.error('deal insert error:', insertError);
        setError('商談の登録に失敗しました');
        return;
      }

      await fetchMergeCandidateCount();
      setStep('success');
    } catch (err) {
      console.error('deal submit error:', err);
      setError('商談の登録に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep('clinic');
    setSelectedClinic(null);
    setSearchQuery('');
    setDate(new Date().toISOString().split('T')[0]);
    setActivityType('visit');
    setProductName('');
    setUnitCount('');
    setAmount('');
    setNotes('');
    setNextAction('');
    setError('');
  };

  const isWon = activityType === 'won';

  useEffect(() => {
  fetchMergeCandidateCount();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-200 p-4 sm:p-8">
      <div className="mx-auto max-w-xl">

        {/* ヘッダー */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => step === 'details' ? setStep('clinic') : navigate('/dashboard')}
              className="flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              {step === 'details' ? '医院選択に戻る' : 'ダッシュボード'}
            </button>

            <button
              type="button"
              onClick={() => navigate('/customer-merge')}
              className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:opacity-90"
            >
              <GitMerge className="mr-1.5 h-4 w-4" />
              マージ
              {mergeCandidateCount > 0 && (
                <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] leading-none text-white">
                  {mergeCandidateCount}
                </span>
              )}
            </button>
          </div>
          <div className="flex h-2 w-24 gap-1">
            <div className={`h-full flex-1 rounded-full ${step === 'clinic'  ? 'bg-purple-500' : 'bg-purple-200'}`} />
            <div className={`h-full flex-1 rounded-full ${step === 'details' ? 'bg-purple-500' : 'bg-purple-200'}`} />
            <div className={`h-full flex-1 rounded-full ${step === 'success' ? 'bg-purple-500' : 'bg-purple-200'}`} />
          </div>
        </div>

        {mergeCandidateCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-100 p-2 text-amber-600">
                  <BellRing className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900">取引先マージの確認が必要です</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    未確認のマージ候補が
                    <span className="mx-1 font-bold text-amber-600">{mergeCandidateCount}件</span>
                    あります。
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/customer-merge')}
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:opacity-90"
              >
                <GitMerge className="mr-2 h-4 w-4" />
                マージを確認
              </button>
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">

          {/* ステップ1：医院選択 */}
          {step === 'clinic' && (
            <motion.div key="clinic"
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              className="space-y-6">
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
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-10 pr-4 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                  />
                </div>

                <div className="mt-4 space-y-2">
                  {error && (
                    <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                      {error}
                    </div>
                  )}
                  {filteredClinics.map(clinic => (
                    <button key={clinic.id}
                      onClick={() => { setSelectedClinic(clinic); setStep('details'); }}
                      className="flex w-full items-center justify-between rounded-xl border border-zinc-100 p-4 text-left transition hover:bg-zinc-50"
                    >
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-zinc-400" />
                        <div>
                          <span className="font-medium text-zinc-900">{clinic.name}</span>
                          {clinic.kind === 'prospect' && (
                            <p className="mt-1 text-xs font-medium text-purple-500">新規登録院</p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-300" />
                    </button>
                  ))}

                  {searchQuery.trim().length > 0 && filteredClinics.length === 0 && !isCreatingClinic && !error && (
                    <div className="py-8 text-center">
                      <p className="text-sm text-zinc-500">候補が見つかりませんでした</p>
                      <button
                        onClick={() => { setNewClinicName(searchQuery); setIsCreatingClinic(true); }}
                        className="mt-4 inline-flex items-center rounded-lg bg-purple-50 px-4 py-2 text-sm font-semibold text-purple-600 hover:bg-purple-100"
                      >
                        <Plus className="mr-1 h-4 w-4" />新規作成する
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isCreatingClinic && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl bg-white p-6 shadow-sm border border-zinc-200">
                  <h3 className="mb-4 font-bold text-zinc-900">新規医院登録</h3>
                  <input
                    type="text"
                    placeholder="正式な医院名を入力"
                    value={newClinicName}
                    onChange={e => setNewClinicName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-4 py-2 focus:border-purple-500 focus:outline-none"
                  />
                  <div className="mt-4 flex gap-2">
                    <button onClick={handleCreateClinic}
                      className="flex-1 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 py-2 text-sm font-semibold text-white hover:opacity-90">
                      登録して選択
                    </button>
                    <button onClick={() => setIsCreatingClinic(false)}
                      className="flex-1 rounded-lg bg-zinc-100 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-200">
                      キャンセル
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ステップ2：詳細入力 */}
          {step === 'details' && selectedClinic && (
            <motion.div key="details"
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="space-y-6">
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-zinc-200">

                {/* 選択中の医院 */}
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
                    <input type="date" required value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  {/* 活動種別 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      活動種別 <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'visit',       label: '訪問' },
                        { value: 'proposal',    label: '提案中' },
                        { value: 'negotiating', label: '交渉中' },
                        { value: 'won',         label: '受注' },
                        { value: 'lost',        label: '失注' },
                      ] as const).map(s => (
                        <button key={s.value} type="button"
                          onClick={() => setActivityType(s.value)}
                          className={`rounded-xl py-3 text-sm font-semibold transition ${
                            activityType === s.value
                              ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md'
                              : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                          }`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 受注の場合のみ表示 */}
                  {isWon && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                      className="space-y-6 rounded-xl border border-purple-100 bg-purple-50 p-4">
                      <p className="text-xs font-semibold text-purple-500">受注情報（任意）</p>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-zinc-700">商品名</label>
                        <input type="text" value={productName}
                          onChange={e => setProductName(e.target.value)}
                          placeholder="商品名を入力"
                          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-zinc-700">受注本数</label>
                        <input type="number" min={0} value={unitCount}
                          onChange={e => setUnitCount(e.target.value)}
                          placeholder="0"
                          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-lg font-bold focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-zinc-700">受注金額（円）</label>
                        <input type="number" value={amount}
                          onChange={e => setAmount(e.target.value)}
                          placeholder="500000"
                          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-lg font-bold focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* 内容・メモ */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">内容・メモ</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="商談の内容を記入"
                      rows={3}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  {/* 次アクション */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">次アクション</label>
                    <input type="text" value={nextAction}
                      onChange={e => setNextAction(e.target.value)}
                      placeholder="例：来週サンプル持参"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
                  )}

                  <button type="submit" disabled={isSubmitting}
                    className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 py-4 font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-50">
                    {isSubmitting
                      ? <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      : <Send className="mr-2 h-5 w-5" />}
                    商談を登録する
                  </button>
                </form>
              </div>
            </motion.div>
          )}

          {/* ステップ3：完了 */}
          {step === 'success' && (
            <motion.div key="success"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                <Check className="h-10 w-10" />
              </div>
              <h2 className="mb-2 text-2xl font-bold text-zinc-900">登録完了！</h2>
              <p className="mb-8 text-zinc-500">商談が正常に登録されました。</p>
              <div className="space-y-3">
                <button onClick={handleReset}
                  className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 py-4 font-bold text-white shadow-md transition hover:opacity-90">
                  続けて入力する
                </button>
                <button onClick={() => navigate('/dashboard')}
                  className="flex w-full items-center justify-center rounded-xl bg-white border border-zinc-200 py-4 font-bold text-zinc-600 transition hover:bg-zinc-50">
                  <LayoutDashboard className="mr-2 h-5 w-5" />ダッシュボードへ
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
