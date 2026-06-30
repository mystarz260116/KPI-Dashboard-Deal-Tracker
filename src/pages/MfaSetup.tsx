import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Copy, Eye, EyeOff, KeyRound, Loader2, LogOut, Monitor, ShieldCheck, Smartphone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import logoImg from '../assets/Mystarz-logo.png';

type Enrollment = {
  id: string;
  totp: {
    qr_code: string;
    secret: string;
    uri: string;
  };
};

function getHomePath(canViewDashboard: boolean) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  return isMobile || !canViewDashboard ? '/deals/new' : '/dashboard';
}

export default function MfaSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, refreshMfaStatus } = useAuth();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [isCheckingFactors, setIsCheckingFactors] = useState(true);
  const [isSecretVisible, setIsSecretVisible] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isReissuing, setIsReissuing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  useEffect(() => {
    let isMounted = true;

    const loadPendingFactor = async () => {
      setIsCheckingFactors(true);

      const { data, error } = await supabase.auth.mfa.listFactors();

      if (!isMounted) return;

      if (error) {
        console.error('mfa setup factors fetch error:', error);
        setIsCheckingFactors(false);
        return;
      }

      const unverifiedTotp = data.all
        .filter((factor) => factor.factor_type === 'totp' && factor.status === 'unverified')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      if (unverifiedTotp) {
        setPendingFactorId(unverifiedTotp.id);
        setIsSecretVisible(false);
        setCopyMessage('Google Authenticatorに追加済みの場合は、6桁コードを入力して設定を完了してください。');
      }

      setIsCheckingFactors(false);
    };

    loadPendingFactor();

    return () => {
      isMounted = false;
    };
  }, []);

  const copyText = async (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);

    try {
      return document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
  };

  const handleEnroll = async () => {
    setError('');
    setIsEnrolling(true);

    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Google Authenticator ${new Date().toISOString()}`,
        issuer: 'KPI Dashboard',
      });

      if (error || !data || data.type !== 'totp') {
        setError(error?.message ? `MFA設定を開始できませんでした: ${error.message}` : 'MFA設定を開始できませんでした');
        return;
      }

      setEnrollment({
        id: data.id,
        totp: data.totp,
      });
      setPendingFactorId(data.id);
      setCopyMessage('');
      setIsSecretVisible(false);
    } catch (error) {
      console.error('mfa enroll error:', error);
      setError('MFA設定を開始できませんでした');
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleReissue = async () => {
    if (!pendingFactorId) return;

    setError('');
    setCopyMessage('');
    setIsReissuing(true);

    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId: pendingFactorId,
      });

      if (unenrollError) {
        setError(`キーを再発行できませんでした: ${unenrollError.message}`);
        return;
      }

      setPendingFactorId('');
      setEnrollment(null);
      setCode('');

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Google Authenticator ${new Date().toISOString()}`,
        issuer: 'KPI Dashboard',
      });

      if (error || !data || data.type !== 'totp') {
        setError(error?.message ? `キーを再発行できませんでした: ${error.message}` : 'キーを再発行できませんでした');
        return;
      }

      setEnrollment({
        id: data.id,
        totp: data.totp,
      });
      setPendingFactorId(data.id);
      setIsSecretVisible(false);
    } catch (error) {
      console.error('mfa reissue error:', error);
      setError('キーを再発行できませんでした');
    } finally {
      setIsReissuing(false);
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();

    const factorId = enrollment?.id || pendingFactorId;

    if (!factorId) {
      setError('MFA設定を開始してください');
      return;
    }

    const verificationCode = code.trim();
    if (!/^\d{6}$/.test(verificationCode)) {
      setError('6桁のコードを入力してください');
      return;
    }

    setError('');
    setIsVerifying(true);

    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });

      if (challengeError || !challengeData) {
        setError('確認コードを検証できませんでした');
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verificationCode,
      });

      if (verifyError) {
        setError('確認コードが正しくありません');
        return;
      }

      await refreshMfaStatus();
      setPendingFactorId('');
      const redirectPath = typeof location.state?.from === 'string' ? location.state.from : '';
      navigate(redirectPath || getHomePath(Boolean(user?.can_view_dashboard)), { replace: true });
    } catch (error) {
      console.error('mfa setup verify error:', error);
      setError('確認コードを検証できませんでした');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopySecret = async () => {
    if (!enrollment) return;

    try {
      const didCopy = await copyText(enrollment.totp.secret);
      setIsSecretVisible(true);
      setCopyMessage(didCopy ? 'コピーしました' : '自動コピーできませんでした。表示されたキーを長押ししてコピーしてください。');
    } catch (error) {
      console.error('mfa secret copy error:', error);
      setIsSecretVisible(true);
      setCopyMessage('自動コピーできませんでした。表示されたキーを長押ししてコピーしてください。');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <img src={logoImg} alt="Mystarz ロゴ" className="mb-8 h-16 w-auto object-contain" />

      <div className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">MFA設定</h1>
          <p className="mt-2 text-sm text-zinc-500">Google Authenticatorを使って、このアカウント専用の認証コードを登録します。</p>
        </div>

        {isCheckingFactors ? (
          <div className="flex items-center justify-center rounded-lg border border-zinc-200 p-6 text-sm text-zinc-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            MFA設定状況を確認中
          </div>
        ) : !enrollment && !pendingFactorId ? (
          <button
            type="button"
            onClick={handleEnroll}
            disabled={isEnrolling}
            className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {isEnrolling ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <KeyRound className="mr-2 h-5 w-5" />}
            Google Authenticatorの設定を開始
          </button>
        ) : (
          <form onSubmit={handleVerify} className="space-y-5">
            {enrollment ? (
              <div className="grid gap-4 lg:grid-cols-2">
              <section className={`rounded-lg border p-4 ${isMobile ? 'border-indigo-200 bg-indigo-50' : 'border-zinc-200 bg-zinc-50'}`}>
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-indigo-600" />
                  <h2 className="text-sm font-semibold text-zinc-900">スマホだけで設定</h2>
                </div>
                <p className="mt-2 text-xs leading-5 text-zinc-600">
                  この画面をスマホで開いている場合は、キーをコピーしてGoogle Authenticatorに手入力します。
                </p>
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    キーをコピー
                  </button>
                </div>
                <ol className="mt-3 space-y-1 text-xs leading-5 text-zinc-600">
                  <li>1. キーをコピー</li>
                  <li>2. Google Authenticatorを開く</li>
                  <li>3. 右下の「+」から「セットアップキーを入力」を選択</li>
                  <li>4. アカウント名に「KPI Dashboard」、キーにコピーした値を貼り付け</li>
                </ol>
                <div className="mt-3 rounded-md bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-700">セットアップキー</span>
                    <button
                      type="button"
                      onClick={() => setIsSecretVisible((value) => !value)}
                      className="inline-flex items-center text-xs font-semibold text-indigo-600 hover:text-indigo-500"
                    >
                      {isSecretVisible ? <EyeOff className="mr-1 h-3.5 w-3.5" /> : <Eye className="mr-1 h-3.5 w-3.5" />}
                      {isSecretVisible ? '隠す' : '表示'}
                    </button>
                  </div>
                  {isSecretVisible ? (
                    <textarea
                      readOnly
                      value={enrollment.totp.secret}
                      className="block min-h-16 w-full resize-none rounded-md border border-zinc-200 bg-zinc-50 p-2 text-center text-xs text-zinc-700"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  ) : (
                    <p className="break-all rounded-md bg-zinc-50 p-2 text-center text-xs text-zinc-500">
                      •••• •••• •••• ••••
                    </p>
                  )}
                </div>
                {copyMessage && <p className="mt-2 text-center text-xs text-zinc-500">{copyMessage}</p>}
              </section>

              <section className={`rounded-lg border p-4 ${!isMobile ? 'border-indigo-200 bg-indigo-50' : 'border-zinc-200 bg-zinc-50'}`}>
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-indigo-600" />
                  <h2 className="text-sm font-semibold text-zinc-900">PCで設定</h2>
                </div>
                <p className="mt-2 text-xs leading-5 text-zinc-600">
                  PCに表示されたQRコードを、スマホのGoogle Authenticatorで読み取ります。
                </p>
                <div className="mt-4 rounded-lg bg-white p-3">
                  <img src={enrollment.totp.qr_code} alt="MFA QRコード" className="mx-auto h-52 w-52" />
                </div>
              </section>
              </div>
            ) : (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-indigo-600" />
                  <h2 className="text-sm font-semibold text-zinc-900">設定を続行できます</h2>
                </div>
                <p className="mt-2 text-xs leading-5 text-zinc-600">
                  Google AuthenticatorにKPI Dashboardを追加済みの場合は、アプリに表示されている6桁コードを入力してください。
                </p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  キーをコピーする前に画面が再読み込みされた場合は、新しいキーを再発行してください。
                </p>
                <button
                  type="button"
                  onClick={handleReissue}
                  disabled={isReissuing}
                  className="mt-4 flex w-full items-center justify-center rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-50"
                >
                  {isReissuing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  キーを再発行する
                </button>
                <p className="mt-2 text-xs leading-5 text-zinc-500">再発行すると、前に表示されたキーやQRコードは使わず、新しいキーで登録します。</p>
              </div>
            )}

            <div className="rounded-lg border border-zinc-200 p-4">
              <label className="block text-sm font-medium text-zinc-700">6桁コード</label>
              <p className="mt-1 text-xs text-zinc-500">登録後、Google Authenticatorに表示される6桁コードを入力してください。</p>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-4 py-2 text-center text-lg tracking-[0.35em] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                maxLength={6}
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              disabled={isVerifying}
              className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isVerifying && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              設定を完了
            </button>
          </form>
        )}

        {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        <button
          type="button"
          onClick={logout}
          className="mt-6 flex w-full items-center justify-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
        >
          <LogOut className="mr-2 h-4 w-4" />
          ログアウト
        </button>
      </div>
    </div>
  );
}
