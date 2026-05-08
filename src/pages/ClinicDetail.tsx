import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';
import { authFetch } from '../lib/authFetch';
import {
  ArrowLeft, Building2, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Link2, LogOut, MapPin, Phone, Trash2,
} from 'lucide-react';

type ClinicKind = 'customer' | 'prospect';

interface ClinicSummary {
  kind: ClinicKind;
  id: string;
  name: string;
  status?: string;
  mergedCustomerCode?: string | null;
  createdAt?: string | null;
}

interface ClinicDeal {
  id: string;
  dealDate: string;
  notes?: string;
  nextAction?: string;
  nextActionDate?: string;
  nextActionType?: string;
  contactRole?: string;
  decisionMakerContact?: 'yes' | 'no' | 'unknown';
  dealTemperature?: 'A' | 'B' | 'C' | 'D' | 'E';
  proposalCategory?: string;
  proposalCategories?: string[];
  productName?: string;
}

interface AssignedStaff {
  key: string;
  label: string;
  source: 'sales' | 'deal';
}

interface SalesDetail {
  delivery_date: string | null;
  product_name: string;
  detail_category: string | null;
  patient_name: string | null;
  quantity: number;
  amount: number;
}

const TEMPERATURE_LABELS: Record<NonNullable<ClinicDeal['dealTemperature']>, string> = {
  A: 'A すぐ案件化',
  B: 'B 見込みあり',
  C: 'C 長期フォロー',
  D: 'D 可能性低い',
  E: 'E 失注・拒否',
};

const DECISION_MAKER_LABELS: Record<NonNullable<ClinicDeal['decisionMakerContact']>, string> = {
  yes: '決裁者接触あり',
  no: '決裁者接触なし',
  unknown: '決裁者不明',
};

function isClinicKind(value: string | undefined): value is ClinicKind {
  return value === 'customer' || value === 'prospect';
}

export default function ClinicDetail() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const params = useParams();

  const [clinic, setClinic] = useState<ClinicSummary | null>(null);
  const [deals, setDeals] = useState<ClinicDeal[]>([]);
  const [assignedStaffs, setAssignedStaffs] = useState<AssignedStaff[]>([]);
  const [salesMonth, setSalesMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [salesMonthTotal, setSalesMonthTotal] = useState(0);
  const [salesDetails, setSalesDetails] = useState<SalesDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      if (!isClinicKind(params.kind) || !params.clinicId) {
        setError('医院ページのURLが不正です');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError('');

      try {
        const clinicId = decodeURIComponent(params.clinicId);
        const clinicApiPromise = authFetch(`/api/clinic?kind=${params.kind}&id=${encodeURIComponent(clinicId)}&month=${salesMonth}`);

        const dealsQuery = supabase
          .from('deals')
          .select('id, deal_date, notes, next_action, next_action_date, next_action_type, contact_role, decision_maker_contact, deal_temperature, proposal_category, proposal_categories, product_name, created_at')
          .eq('user_id', user.id)
          .order('deal_date', { ascending: false })
          .order('created_at', { ascending: false });

        const dealsPromise = params.kind === 'customer'
          ? dealsQuery.eq('customer_code', clinicId)
          : dealsQuery.eq('prospect_customer_id', clinicId);

        const [clinicApiResponse, dealsResult] = await Promise.all([clinicApiPromise, dealsPromise]);

        if (!clinicApiResponse.ok) {
          const payload = await clinicApiResponse.json().catch(() => null);
          console.error('clinic detail fetch error:', payload);
          setError('医院情報の取得に失敗しました');
          setClinic(null);
          setDeals([]);
          setAssignedStaffs([]);
          setSalesMonthTotal(0);
          setSalesDetails([]);
          setIsLoading(false);
          return;
        }

        const clinicPayload = await clinicApiResponse.json();
        const clinicData = clinicPayload?.clinic;
        setClinic(clinicData ?? null);
        setAssignedStaffs(Array.isArray(clinicPayload?.assigned_staffs) ? clinicPayload.assigned_staffs : []);
        setSalesMonthTotal(Number(clinicPayload?.sales_month_total ?? 0));
        setSalesDetails(Array.isArray(clinicPayload?.sales_details) ? clinicPayload.sales_details : []);

        if (dealsResult.error) {
          console.error('clinic deals fetch error:', dealsResult.error);
          setError('商談履歴の取得に失敗しました');
          setDeals([]);
          setAssignedStaffs([]);
          setSalesMonthTotal(0);
          setSalesDetails([]);
          setIsLoading(false);
          return;
        }

        setDeals((dealsResult.data ?? []).map((deal: any) => ({
          id: deal.id,
          dealDate: deal.deal_date,
          notes: deal.notes ?? undefined,
          nextAction: deal.next_action ?? undefined,
          nextActionDate: deal.next_action_date ?? undefined,
          nextActionType: deal.next_action_type ?? undefined,
          contactRole: deal.contact_role ?? undefined,
          decisionMakerContact: deal.decision_maker_contact ?? undefined,
          dealTemperature: deal.deal_temperature ?? undefined,
          proposalCategory: deal.proposal_category ?? undefined,
          proposalCategories: Array.isArray(deal.proposal_categories) ? deal.proposal_categories : undefined,
          productName: deal.product_name ?? undefined,
        })));
      } catch (loadError) {
        console.error('clinic detail unexpected error:', loadError);
        setError('医院ページの読み込みに失敗しました');
        setClinic(null);
        setDeals([]);
        setAssignedStaffs([]);
        setSalesMonthTotal(0);
        setSalesDetails([]);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [params.kind, params.clinicId, salesMonth, user?.id]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleDeleteDeal = async (deal: ClinicDeal) => {
    const shouldDelete = window.confirm(`「${clinic?.name ?? 'この医院'}」の商談履歴を削除しますか？`);
    if (!shouldDelete) {
      return;
    }

    setDeletingDealId(deal.id);
    setError('');

    try {
      const { error: deleteError } = await supabase
        .from('deals')
        .delete()
        .eq('id', deal.id);

      if (deleteError) {
        console.error('clinic detail deal delete error:', deleteError);
        setError('商談履歴の削除に失敗しました');
        return;
      }

      setDeals((current) => current.filter((currentDeal) => currentDeal.id !== deal.id));
    } catch (deleteUnexpectedError) {
      console.error('clinic detail deal delete unexpected error:', deleteUnexpectedError);
      setError('商談履歴の削除に失敗しました');
    } finally {
      setDeletingDealId(null);
    }
  };

  const latestDeal = deals[0] ?? null;
  const proposalCategories = Array.from(new Set(
    deals.flatMap((deal) => (
      deal.proposalCategories?.length
        ? deal.proposalCategories
        : deal.proposalCategory
          ? [deal.proposalCategory]
          : []
    ))
  ));

  const formatMonthLabel = (value: string) => {
    const [year, month] = value.split('-');
    return `${year}年${Number(month)}月`;
  };

  const shiftMonth = (value: string, diff: number) => {
    const [year, month] = value.split('-').map(Number);
    const date = new Date(year, month - 1 + diff, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-zinc-200 p-4 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            戻る
          </button>
          <h1 className="text-lg font-bold text-zinc-900">医院ページ</h1>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-white hover:text-zinc-700"
            aria-label="ログアウト"
            title="ログアウト"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        {clinic && (
          <div className="mb-6 flex justify-end">
            <button
              type="button"
              onClick={() => navigate('/deals/new', {
                state: {
                  preselectedClinic: {
                    id: clinic.id,
                    name: clinic.name,
                    kind: clinic.kind,
                  },
                },
              })}
              className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700"
            >
              この医院で商談入力
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="rounded-2xl bg-white p-10 text-center text-sm text-zinc-500 shadow-sm">
            医院情報を読み込み中です...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-600 shadow-sm">
            {error}
          </div>
        ) : clinic ? (
          <div className="space-y-6">
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl bg-white p-6 shadow-sm"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-purple-50 p-3 text-purple-600">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-bold text-zinc-900">{clinic.name}</h2>
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
                        {clinic.kind === 'customer' ? '既存取引先' : '見込み顧客'}
                      </span>
                      {clinic.status && (
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                          ステータス: {clinic.status}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500">
                      {clinic.kind === 'customer' ? `顧客コード: ${clinic.id}` : `見込み顧客ID: ${clinic.id}`}
                    </p>
                    {clinic.kind === 'prospect' && clinic.mergedCustomerCode && (
                      <p className="mt-1 text-sm text-zinc-500">
                        マージ済み顧客コード: {clinic.mergedCustomerCode}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid min-w-[220px] gap-3 text-sm sm:text-right">
                  <div className="rounded-xl bg-zinc-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">商談件数</p>
                    <p className="mt-1 text-2xl font-bold text-zinc-900">{deals.length}</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">最終接触日</p>
                    <p className="mt-1 font-semibold text-zinc-800">{latestDeal?.dealDate ?? '未登録'}</p>
                  </div>
                </div>
              </div>
            </motion.section>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="rounded-2xl bg-white p-6 shadow-sm"
              >
                <h3 className="mb-4 text-lg font-bold text-zinc-900">基本情報</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-zinc-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-700">
                      <MapPin className="h-4 w-4 text-zinc-400" />
                      住所
                    </div>
                    <p className="text-sm text-zinc-500">未登録</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-700">
                      <Phone className="h-4 w-4 text-zinc-400" />
                      連絡先
                    </div>
                    <p className="text-sm text-zinc-500">未登録</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-700">
                      <ClipboardList className="h-4 w-4 text-zinc-400" />
                      最近の次回アクション
                    </div>
                    <p className="text-sm text-zinc-700">{latestDeal?.nextAction ?? '未設定'}</p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-700">
                      <CalendarDays className="h-4 w-4 text-zinc-400" />
                      次回予定日
                    </div>
                    <p className="text-sm text-zinc-700">{latestDeal?.nextActionDate ?? '未設定'}</p>
                  </div>
                </div>
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="rounded-2xl bg-white p-6 shadow-sm"
              >
                <h3 className="mb-4 text-lg font-bold text-zinc-900">提案サマリー</h3>
                <div className="space-y-4">
                  <div className="rounded-xl bg-zinc-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">関与している担当者</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {assignedStaffs.length > 0 ? assignedStaffs.map((staff) => (
                        <span
                          key={staff.key}
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                            staff.source === 'sales'
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'bg-emerald-50 text-emerald-700'
                          }`}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          {staff.label}
                          <span className="text-[10px] opacity-70">
                            {staff.source === 'sales' ? '売上あり' : '商談履歴あり'}
                          </span>
                        </span>
                      )) : (
                        <p className="text-sm text-zinc-500">売上データまたは商談履歴のある担当者はまだいません</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">提案カテゴリ</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {proposalCategories.length > 0 ? proposalCategories.map((category) => (
                        <span key={category} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {category}
                        </span>
                      )) : (
                        <p className="text-sm text-zinc-500">まだ登録がありません</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">最新温度感</p>
                    <p className="mt-2 text-sm font-semibold text-zinc-800">
                      {latestDeal?.dealTemperature ? TEMPERATURE_LABELS[latestDeal.dealTemperature] : '未登録'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-zinc-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">最新接触相手</p>
                    <p className="mt-2 text-sm text-zinc-700">{latestDeal?.contactRole ?? '未登録'}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {latestDeal?.decisionMakerContact ? DECISION_MAKER_LABELS[latestDeal.decisionMakerContact] : '決裁者接触未登録'}
                    </p>
                  </div>
                </div>
              </motion.section>
            </div>

            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="rounded-2xl bg-white p-6 shadow-sm"
            >
              <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">売上明細</h3>
                  <p className="mt-1 text-sm text-zinc-500">クレジットカード明細のように、月ごとの売上行を確認できます。</p>
                </div>
                <div className="flex items-center gap-2 self-start rounded-xl bg-zinc-50 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setSalesMonth((current) => shiftMonth(current, -1))}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-white hover:text-zinc-800"
                    aria-label="前月"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-[110px] text-center text-sm font-semibold text-zinc-800">
                    {formatMonthLabel(salesMonth)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSalesMonth((current) => shiftMonth(current, 1))}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-white hover:text-zinc-800"
                    aria-label="翌月"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mb-4 rounded-xl bg-zinc-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{formatMonthLabel(salesMonth)} の売上合計</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">¥{salesMonthTotal.toLocaleString()}</p>
              </div>

              {salesDetails.length === 0 ? (
                <div className="rounded-xl bg-zinc-50 p-6 text-sm text-zinc-500">
                  この月の売上明細はありません。
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-zinc-200">
                  <div className="max-h-[420px] overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-zinc-50 text-left text-zinc-500">
                        <tr className="border-b border-zinc-200">
                          <th className="px-4 py-3 font-medium">納品日</th>
                          <th className="px-4 py-3 font-medium">商品</th>
                          <th className="px-4 py-3 font-medium">区分</th>
                          <th className="px-4 py-3 font-medium">患者名</th>
                          <th className="px-4 py-3 text-right font-medium">数量</th>
                          <th className="px-4 py-3 text-right font-medium">金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesDetails.map((row, index) => (
                          <tr key={`${row.delivery_date ?? 'nodate'}-${row.product_name}-${index}`} className="border-b border-zinc-100">
                            <td className="px-4 py-3 text-zinc-600">{row.delivery_date ?? '-'}</td>
                            <td className="px-4 py-3 font-medium text-zinc-900">{row.product_name}</td>
                            <td className="px-4 py-3 text-zinc-600">{row.detail_category ?? '-'}</td>
                            <td className="px-4 py-3 text-zinc-600">{row.patient_name ?? '-'}</td>
                            <td className="px-4 py-3 text-right text-zinc-600">{row.quantity.toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-semibold text-zinc-900">¥{row.amount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-2xl bg-white p-6 shadow-sm"
            >
              <h3 className="mb-4 text-lg font-bold text-zinc-900">商談履歴</h3>
              {deals.length === 0 ? (
                <div className="rounded-xl bg-zinc-50 p-6 text-sm text-zinc-500">
                  この医院に紐づく商談はまだありません。
                </div>
              ) : (
                <div className="space-y-3">
                  {deals.map((deal) => {
                    const categories = deal.proposalCategories?.length
                      ? deal.proposalCategories
                      : deal.proposalCategory
                        ? [deal.proposalCategory]
                        : [];

                    return (
                      <div key={deal.id} className="rounded-xl border border-zinc-200 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-bold text-zinc-900">{deal.dealDate}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {deal.dealTemperature && (
                                <span className="rounded-full bg-purple-50 px-2 py-1 text-xs font-semibold text-purple-700">
                                  {TEMPERATURE_LABELS[deal.dealTemperature]}
                                </span>
                              )}
                              {categories.map((category) => (
                                <span key={category} className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                                  {category}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="text-xs text-zinc-500">
                              {deal.nextActionDate ? `次回予定: ${deal.nextActionDate}` : '次回予定なし'}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteDeal(deal)}
                              disabled={deletingDealId === deal.id}
                              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                              aria-label="商談履歴を削除"
                              title="商談履歴を削除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {deal.productName && (
                          <p className="mt-3 text-sm text-zinc-700">具体商品: {deal.productName}</p>
                        )}
                        {deal.notes && (
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">{deal.notes}</p>
                        )}
                        {deal.nextAction && (
                          <div className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                            次アクション: {deal.nextAction}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
