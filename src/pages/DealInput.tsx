import { supabase } from '../lib/supabase';
import { useState, FormEvent, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toDateString } from '../lib/dateUtils';
import { authFetch } from '../lib/authFetch';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Plus, Check, ChevronRight, ArrowLeft,
  Loader2, Building2, Send, LayoutDashboard, GitMerge, BellRing, LogOut, ChevronDown
} from 'lucide-react';


interface Clinic {
  id: string;
  name: string;
  kind: 'customer' | 'prospect';
}

interface DealInputLocationState {
  preselectedClinic?: Clinic;
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

type ContactRole = '院長' | '副院長' | '事務長・経営者' | '技工担当' | '衛生士・スタッフ' | '受付' | 'その他';
type DecisionMakerContact = 'yes' | 'no' | 'unknown';
type DealTemperature = 'A' | 'B' | 'C' | 'D' | 'E';
type NextActionType = '見積提出' | 'サンプル持参' | '再訪問' | '電話フォロー' | 'メール・資料送付' | '院長面談設定' | '保留' | 'なし';
type DealPipelineStage = 'targeting' | 'visiting' | 'negotiating' | 'lost';
type ExecutedActionType = '訪問' | '電話' | 'メール・資料送付';

const PROPOSAL_CATEGORIES = [
  'CADCAM冠',
  'emax',
  'FMC',
  'インプラント',
  'インレー・アンレー',
  'ジルコニア',
  'その他の自費クラウン',
  'その他の保険クラウン',
  'デンチャー(自費)',
  'デンチャー(保険)',
  'バイトプレート',
  '前装冠',
] as const;

const CONTACT_ROLES: ContactRole[] = [
  '院長',
  '副院長',
  '事務長・経営者',
  '技工担当',
  '衛生士・スタッフ',
  '受付',
  'その他',
];

const DECISION_MAKER_OPTIONS: { value: DecisionMakerContact; label: string; rule: string }[] = [
  { value: 'yes', label: 'はい', rule: '院長・経営者・事務長など、導入判断できる相手に提案できた場合' },
  { value: 'no', label: 'いいえ', rule: '受付・スタッフ対応のみで、決裁者に届いていない場合' },
  { value: 'unknown', label: '不明', rule: '相手の決裁権限が判断できない場合' },
];

const TEMPERATURE_OPTIONS: { value: DealTemperature; label: string; rule: string }[] = [
  { value: 'A', label: 'A すぐ案件化', rule: '見積・サンプル・受注相談など、具体的な次工程が決まっている' },
  { value: 'B', label: 'B 見込みあり', rule: '課題や関心が明確で、次回提案につながる' },
  { value: 'C', label: 'C 長期フォロー', rule: '情報提供中心。時期は未定だが関係継続の余地がある' },
  { value: 'D', label: 'D 可能性低い', rule: '反応が薄い、タイミング不一致、既存業者への不満が弱い' },
  { value: 'E', label: 'E 失注・拒否', rule: '明確に不要、取引不可、競合継続が確定している' },
];

const NEXT_ACTION_OPTIONS: { value: NextActionType; rule: string }[] = [
  { value: '見積提出', rule: '金額提示が次の宿題の場合' },
  { value: 'サンプル持参', rule: '技工物や資料を見せる約束がある場合' },
  { value: '再訪問', rule: '対面で再度商談する場合' },
  { value: '電話フォロー', rule: '短期確認や日程調整を電話で行う場合' },
  { value: 'メール・資料送付', rule: '資料送付やメール回答が次の動きの場合' },
  { value: '院長面談設定', rule: '決裁者に会うことが次の目的の場合' },
  { value: '保留', rule: '時期待ちで、具体日が未確定の場合' },
  { value: 'なし', rule: '明確に追わない、または失注の場合' },
];

const PIPELINE_STAGE_OPTIONS: { value: DealPipelineStage; label: string; rule: string }[] = [
  { value: 'targeting', label: 'ターゲティング', rule: '候補先の選定や情報整理の段階。まだ本格接触前。' },
  { value: 'visiting', label: '訪問中', rule: '初回訪問や継続接触を進めている段階。' },
  { value: 'negotiating', label: '交渉中', rule: '提案・見積・サンプル・具体相談まで進んでいる段階。' },
  { value: 'lost', label: '失注', rule: '今回は追わない、または失注として整理する段階。' },
];

const EXECUTED_ACTION_OPTIONS: { value: ExecutedActionType; rule: string }[] = [
  { value: '訪問', rule: '対面訪問や面談を実施した場合' },
  { value: '電話', rule: '電話で接触・提案・確認を行った場合' },
  { value: 'メール・資料送付', rule: 'メール連絡や資料送付を主に行った場合' },
];

function pipelineStageToActivityType(stage: DealPipelineStage) {
  if (stage === 'negotiating') return 'negotiating';
  if (stage === 'lost') return 'lost';
  return 'visit';
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

export default function DealInput() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canViewDashboard = user?.can_view_dashboard ?? false;

  const [step, setStep] = useState<'clinic' | 'details' | 'success'>('clinic');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null);
  const [isCreatingClinic, setIsCreatingClinic] = useState(false);
  const [newClinicName, setNewClinicName] = useState('');

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [mergeCandidateCount, setMergeCandidateCount] = useState(0);

  const [date, setDate] = useState(() => toDateString(new Date()));
  const [executedActionType, setExecutedActionType] = useState<ExecutedActionType>('訪問');
  const [contactRole, setContactRole] = useState<ContactRole>('院長');
  const [decisionMakerContact, setDecisionMakerContact] = useState<DecisionMakerContact>('unknown');
  const [pipelineStage, setPipelineStage] = useState<DealPipelineStage>('visiting');
  const [proposalCategories, setProposalCategories] = useState<string[]>(['CADCAM冠']);
  const [specificProduct, setSpecificProduct] = useState('');
  const [dealTemperature, setDealTemperature] = useState<DealTemperature>('C');
  const [notes, setNotes] = useState('');
  const [nextActionType, setNextActionType] = useState<NextActionType>('再訪問');
  const [nextActionDate, setNextActionDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [commentNotifications, setCommentNotifications] = useState<DealCommentNotification[]>([]);
  const [unreadCommentNotificationCount, setUnreadCommentNotificationCount] = useState(0);
  const [isLoadingCommentNotifications, setIsLoadingCommentNotifications] = useState(false);
  const [commentNotificationError, setCommentNotificationError] = useState('');
  const [isCommentNotificationsOpen, setIsCommentNotificationsOpen] = useState(false);

  const filteredClinics = clinics;
  const locationState = location.state as DealInputLocationState | null;

  const fetchMergeCandidateCount = async () => {
  try {
    const res = await authFetch(`/api/merge/candidates/count?ts=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      setMergeCandidateCount(0);
      return;
    }

    const data = await res.json();
    const count = typeof data?.pending_count === 'number' ? data.pending_count : 0;
    setMergeCandidateCount(count);
  } catch (err) {
    console.error('merge candidate count fetch error:', err);
    setMergeCandidateCount(0);
  }
};

  const fetchCommentNotifications = async () => {
    if (!user?.id || canViewDashboard) {
      setCommentNotifications([]);
      setUnreadCommentNotificationCount(0);
      return;
    }

    setIsLoadingCommentNotifications(true);
    setCommentNotificationError('');

    try {
      const response = await authFetch('/api/deals?path=notifications&limit=5', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('comment notifications fetch failed');
      }

      const payload = await response.json();
      setCommentNotifications(Array.isArray(payload?.notifications) ? payload.notifications : []);
      setUnreadCommentNotificationCount(Number(payload?.unread_count ?? 0));
    } catch (notificationError) {
      console.error('comment notifications fetch error:', notificationError);
      setCommentNotificationError('コメント通知の取得に失敗しました');
      setCommentNotifications([]);
      setUnreadCommentNotificationCount(0);
    } finally {
      setIsLoadingCommentNotifications(false);
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

  useEffect(() => {
    const preselectedClinic = locationState?.preselectedClinic;
    if (!preselectedClinic) {
      return;
    }

    setSelectedClinic(preselectedClinic);
    setIsCreatingClinic(false);
    setNewClinicName('');
    setSearchQuery('');
    setStep('details');
    setError('');
  }, [locationState]);

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

    if (nextActionType !== 'なし' && nextActionType !== '保留' && !nextActionDate) {
      setError('次回アクション日を入力してください');
      setIsSubmitting(false);
      return;
    }

    if (proposalCategories.length === 0) {
      setError('提案カテゴリを1つ以上選択してください');
      setIsSubmitting(false);
      return;
    }

    const payload = {
      user_id: user.id,
      customer_code: selectedClinic.kind === 'customer' ? selectedClinic.id : null,
      prospect_customer_id: selectedClinic.kind === 'prospect' ? selectedClinic.id : null,
      deal_date: date,
      activity_type: pipelineStageToActivityType(pipelineStage),
      pipeline_stage: pipelineStage,
      executed_action_type: executedActionType,
      contact_role: contactRole,
      decision_maker_contact: decisionMakerContact,
      proposal_category: proposalCategories[0] ?? null,
      proposal_categories: proposalCategories,
      product_name: specificProduct || null,
      deal_temperature: dealTemperature,
      next_action_type: nextActionType,
      next_action_date: nextActionDate || null,
      unit_count: null,
      amount: null,
      notes: notes || null,
      next_action: nextActionType === 'なし'
        ? null
        : nextActionDate
          ? `${nextActionType}（${nextActionDate}）`
          : nextActionType,
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
    setDate(toDateString(new Date()));
    setExecutedActionType('訪問');
    setContactRole('院長');
    setDecisionMakerContact('unknown');
    setPipelineStage('visiting');
    setProposalCategories(['CADCAM冠']);
    setSpecificProduct('');
    setDealTemperature('C');
    setNotes('');
    setNextActionType('再訪問');
    setNextActionDate('');
    setError('');
  };

  useEffect(() => {
  fetchMergeCandidateCount();
  }, []);

  useEffect(() => {
    fetchCommentNotifications();
  }, [canViewDashboard, user?.id]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleProposalCategory = (category: string) => {
    setProposalCategories(current =>
      current.includes(category)
        ? current.filter(item => item !== category)
        : [...current, category]
    );
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
      console.error('comment notification read error:', notificationError);
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
      console.error('comment notifications read all error:', notificationError);
    }
  };

  const openCommentNotification = async (notification: DealCommentNotification) => {
    if (!notification.read_at) {
      await markCommentNotificationRead(notification.id);
    }

    navigate(`/clinics/${notification.clinic_kind}/${encodeURIComponent(notification.clinic_id)}`);
  };

  useEffect(() => {
    if (pipelineStage === 'lost') {
      setNextActionType('なし');
      setNextActionDate('');
    }
  }, [pipelineStage]);

  const shortcutButtons = [
    { label: '案件の進捗管理', path: '/deals/progress' },
    { label: 'CRM検索', path: '/crm' },
    { label: '商談履歴', path: '/deals/history' },
  ];

  return (
    <div className="min-h-screen bg-zinc-200 p-4 sm:p-8">
      <div className="mx-auto max-w-xl">

        {/* ヘッダー */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step === 'details' ? (
              <button
                onClick={() => setStep('clinic')}
                className="flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                医院選択に戻る
              </button>
            ) : canViewDashboard ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center text-sm font-medium text-zinc-500 hover:text-zinc-900"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                ダッシュボード
              </button>
            ) : (
              <div className="flex items-center text-sm font-medium text-zinc-500">
                商談入力
              </div>
            )}

            <button
              type="button"
              onClick={() => navigate('/customer-merge')}
              className="inline-flex items-center justify-center rounded-lg bg-linear-to-r from-purple-500 to-pink-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:opacity-90"
            >
              <GitMerge className="mr-1.5 h-4 w-4" />
              受注確認
              {mergeCandidateCount > 0 && (
                <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] leading-none text-white">
                  {mergeCandidateCount}
                </span>
              )}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-2 w-24 gap-1">
              <div className={`h-full flex-1 rounded-full ${step === 'clinic'  ? 'bg-purple-500' : 'bg-purple-200'}`} />
              <div className={`h-full flex-1 rounded-full ${step === 'details' ? 'bg-purple-500' : 'bg-purple-200'}`} />
              <div className={`h-full flex-1 rounded-full ${step === 'success' ? 'bg-purple-500' : 'bg-purple-200'}`} />
            </div>
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
        </div>

        {!canViewDashboard && (
          <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-bold text-zinc-900">メニュー</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {shortcutButtons.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-white hover:border-purple-300 hover:text-purple-700"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!canViewDashboard && (
          <div className="mb-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setIsCommentNotificationsOpen((current) => !current)}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-zinc-50"
            >
              <div className="flex items-center gap-2">
                <div className="relative rounded-full bg-purple-50 p-2 text-purple-600">
                  <BellRing className="h-5 w-5" />
                  {unreadCommentNotificationCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-pink-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                      {unreadCommentNotificationCount}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900">コメント通知</p>
                  <p className="text-xs text-zinc-500">自分の商談や参加中のコメントを確認できます</p>
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
                        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-purple-500" />
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
                      <div className="space-y-2">
                        {commentNotifications.map((notification) => (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() => openCommentNotification(notification)}
                            className={`w-full rounded-xl border px-4 py-3 text-left transition hover:border-purple-300 hover:bg-purple-50/40 ${
                              notification.read_at
                                ? 'border-zinc-100 bg-zinc-50'
                                : 'border-purple-200 bg-purple-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold text-zinc-900">
                                  {notification.clinic_name}
                                </p>
                                <p className="mt-1 text-xs font-semibold text-purple-600">
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
          </div>
        )}

        {mergeCandidateCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl border border-amber-200 bg-linear-to-r from-amber-50 to-orange-50 p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-amber-100 p-2 text-amber-600">
                  <BellRing className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900">受注確認が必要です</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    未確認の受注確認候補が
                    <span className="mx-1 font-bold text-amber-600">{mergeCandidateCount}件</span>
                    あります。
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/customer-merge')}
              className="inline-flex items-center justify-center rounded-xl bg-linear-to-r from-purple-500 to-pink-500 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:opacity-90"
            >
              <GitMerge className="mr-2 h-4 w-4" />
              受注確認へ
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
                      className="flex-1 rounded-lg bg-linear-to-r from-purple-500 to-pink-500 py-2 text-sm font-semibold text-white hover:opacity-90">
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
                    <div className="flex items-center gap-3">
                      <p className="font-bold text-zinc-900">{selectedClinic.name}</p>
                      <button
                        type="button"
                        onClick={() => navigate(`/clinics/${selectedClinic.kind}/${encodeURIComponent(selectedClinic.id)}`)}
                        className="text-xs font-semibold text-purple-600 hover:text-purple-700"
                      >
                        医院ページを見る
                      </button>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">

                  {/* 今回実行したアクション */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      今回実行したアクション <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-2">
                      {EXECUTED_ACTION_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setExecutedActionType(option.value)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            executedActionType === option.value
                              ? 'border-purple-400 bg-purple-50 text-purple-700'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                          }`}
                        >
                          <span className="block text-sm font-bold">{option.value}</span>
                          <span className="mt-1 block text-xs leading-relaxed">{option.rule}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 訪問日 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      訪問日 <span className="text-red-500">*</span>
                    </label>
                    <input type="date" required value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  {/* 営業担当 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      営業担当 <span className="text-red-500">*</span>
                    </label>
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-semibold text-zinc-700">
                      {user?.name ?? user?.email ?? 'ログインユーザー'}
                    </div>
                  </div>

                  {/* 接触相手 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      接触相手 <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={contactRole}
                      onChange={e => setContactRole(e.target.value as ContactRole)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    >
                      {CONTACT_ROLES.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      入力ルール：主に説明・提案した相手。複数いる場合は決裁に近い人を優先します。
                    </p>
                  </div>

                  {/* 決裁者接触 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      決裁者接触 <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-2">
                      {DECISION_MAKER_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setDecisionMakerContact(option.value)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            decisionMakerContact === option.value
                              ? 'border-purple-400 bg-purple-50 text-purple-700'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                          }`}
                        >
                          <span className="block text-sm font-bold">{option.label}</span>
                          <span className="mt-1 block text-xs leading-relaxed">{option.rule}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 提案カテゴリ */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      提案カテゴリ <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {PROPOSAL_CATEGORIES.map(category => {
                        const selected = proposalCategories.includes(category);
                        return (
                          <button
                            key={category}
                            type="button"
                            onClick={() => toggleProposalCategory(category)}
                            className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                              selected
                                ? 'border-purple-400 bg-purple-50 text-purple-700'
                                : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                            }`}
                          >
                            {category}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      複数選択可。今回の商談で提案した品目をすべて選んでください。
                    </p>
                  </div>

                  {/* 具体商品 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">具体商品</label>
                    <input
                      type="text"
                      value={specificProduct}
                      onChange={e => setSpecificProduct(e.target.value)}
                      placeholder="任意：商品名・型番・補足など"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  {/* 商談温度 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      商談温度 <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-2">
                      {TEMPERATURE_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setDealTemperature(option.value)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            dealTemperature === option.value
                              ? 'border-purple-400 bg-purple-50 text-purple-700'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                          }`}
                        >
                          <span className="block text-sm font-bold">{option.label}</span>
                          <span className="mt-1 block text-xs leading-relaxed">{option.rule}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 進捗 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      進捗 <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-2">
                      {PIPELINE_STAGE_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setPipelineStage(option.value)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            pipelineStage === option.value
                              ? 'border-purple-400 bg-purple-50 text-purple-700'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                          }`}
                        >
                          <span className="block text-sm font-bold">{option.label}</span>
                          <span className="mt-1 block text-xs leading-relaxed">{option.rule}</span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      受注はここでは選べません。受注確認が完了した時点で自動的に受注へ移動します。
                    </p>
                  </div>

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
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      次回アクション <span className="text-red-500">*</span>
                    </label>
                    <select
                      required
                      value={nextActionType}
                      onChange={e => setNextActionType(e.target.value as NextActionType)}
                      disabled={pipelineStage === 'lost'}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    >
                      {(pipelineStage === 'lost'
                        ? NEXT_ACTION_OPTIONS.filter(action => action.value === 'なし')
                        : NEXT_ACTION_OPTIONS
                      ).map(action => (
                        <option key={action.value} value={action.value}>{action.value}</option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      入力ルール：次に営業側が実行する一手を選びます。未定なら「保留」、追わないなら「なし」。
                    </p>
                    <div className="mt-2 rounded-xl bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-500">
                      {NEXT_ACTION_OPTIONS.find(action => action.value === nextActionType)?.rule}
                    </div>
                  </div>

                  {/* 次回アクション日 */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      次回アクション日
                      {nextActionType !== 'なし' && nextActionType !== '保留' && (
                        <span className="text-red-500"> *</span>
                      )}
                    </label>
                    <input
                      type="date"
                      required={nextActionType !== 'なし' && nextActionType !== '保留'}
                      value={nextActionDate}
                      onChange={e => setNextActionDate(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 focus:border-purple-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  {error && (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
                  )}

                  <button type="submit" disabled={isSubmitting}
                    className="flex w-full items-center justify-center rounded-xl bg-linear-to-r from-purple-500 to-pink-500 py-4 font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-50">
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
                  className="flex w-full items-center justify-center rounded-xl bg-linear-to-r from-purple-500 to-pink-500 py-4 font-bold text-white shadow-md transition hover:opacity-90">
                  続けて入力する
                </button>
                {canViewDashboard ? (
                  <button onClick={() => navigate('/dashboard')}
                    className="flex w-full items-center justify-center rounded-xl bg-white border border-zinc-200 py-4 font-bold text-zinc-600 transition hover:bg-zinc-50">
                    <LayoutDashboard className="mr-2 h-5 w-5" />ダッシュボードへ
                  </button>
                ) : (
                  <div className="grid gap-3">
                    {shortcutButtons.map((item) => (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => navigate(item.path)}
                        className="flex w-full items-center justify-center rounded-xl bg-white border border-zinc-200 py-4 font-bold text-zinc-600 transition hover:bg-zinc-50"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
