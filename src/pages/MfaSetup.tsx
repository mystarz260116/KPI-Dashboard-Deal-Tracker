import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Copy, ExternalLink, KeyRound, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import logoImg from '../assets/Mystarz-logo.png';

type Enrollment = {
  id: string;
  totp: {
    qr_code: string;
    secret: string;
  };
};

function getHomePath(canViewDashboard: boolean) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  return isMobile || !canViewDashboard ? '/deals/new' : '/dashboard';
}

function buildTotpUri(secret: string, email: string) {
  const issuer = 'KPI Dashboard';
  const account = email || 'user';
  const label = `${issuer}:${account}`;

  return `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}`;
}

export default function MfaSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, refreshMfaStatus } = useAuth();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

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
        setError('MFA設定を開始できませんでした');
        return;
      }

      setEnrollment({
        id: data.id,
        totp: data.totp,
      });
    } catch (error) {
      console.error('mfa enroll error:', error);
      setError('MFA設定を開始できませんでした');
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();

    if (!enrollment) {
      setError('QRコードを発行してください');
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
        factorId: enrollment.id,
      });

      if (challengeError || !challengeData) {
        setError('確認コードを検証できませんでした');
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollment.id,
        challengeId: challengeData.id,
        code: verificationCode,
      });

      if (verifyError) {
        setError('確認コードが正しくありません');
        return;
      }

      await refreshMfaStatus();
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
      await navigator.clipboard.writeText(enrollment.totp.secret);
      setCopyMessage('コピーしました');
    } catch (error) {
      console.error('mfa secret copy error:', error);
      setCopyMessage('コピーできませんでした');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <img src={logoImg} alt="Mystarz ロゴ" className="mb-8 h-16 w-auto object-contain" />

      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">MFA設定</h1>
          <p className="mt-2 text-sm text-zinc-500">iPhoneはキーをコピー、PCはQRコードでGoogle Authenticatorに登録してください。</p>
        </div>

        {!enrollment ? (
          <button
            type="button"
            onClick={handleEnroll}
            disabled={isEnrolling}
            className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {isEnrolling ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <KeyRound className="mr-2 h-5 w-5" />}
            MFA設定を開始
          </button>
        ) : (
          <form onSubmit={handleVerify} className="space-y-5">
            <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
              <div className="rounded-lg bg-white p-3">
                <h2 className="text-sm font-semibold text-zinc-900">iPhoneだけで設定する場合</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  キーをコピーして、Google Authenticatorの「セットアップキーを入力」に貼り付けてください。
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <a
                    href={buildTotpUri(enrollment.totp.secret, user?.email ?? '')}
                    className="flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    認証アプリで開く
                  </a>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    キーをコピー
                  </button>
                </div>
                <p className="mt-3 break-all rounded-md bg-zinc-50 p-2 text-center text-xs text-zinc-500">{enrollment.totp.secret}</p>
                {copyMessage && <p className="mt-2 text-center text-xs text-zinc-500">{copyMessage}</p>}
              </div>

              <div className="rounded-lg bg-white p-3">
                <h2 className="text-sm font-semibold text-zinc-900">PCで設定する場合</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  iPhoneのGoogle AuthenticatorでQRコードを読み取ってください。
                </p>
                <img src={enrollment.totp.qr_code} alt="MFA QRコード" className="mx-auto mt-3 h-48 w-48" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700">6桁コード</label>
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
