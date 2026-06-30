import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import logoImg from '../assets/Mystarz-logo.png';

function getHomePath(canViewDashboard: boolean) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  return isMobile || !canViewDashboard ? '/deals/new' : '/dashboard';
}

export default function MfaVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, refreshMfaStatus } = useAuth();
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadFactors = async () => {
      setIsLoading(true);
      setError('');

      const { data, error } = await supabase.auth.mfa.listFactors();

      if (!isMounted) return;

      if (error) {
        setError('MFA情報を取得できませんでした');
        setIsLoading(false);
        return;
      }

      const verifiedTotp = data.totp?.[0];
      if (!verifiedTotp) {
        navigate('/mfa/setup', { replace: true, state: location.state });
        return;
      }

      setFactorId(verifiedTotp.id);
      setIsLoading(false);
    };

    loadFactors();

    return () => {
      isMounted = false;
    };
  }, [location.state, navigate]);

  const handleVerify = async (event: FormEvent) => {
    event.preventDefault();

    const verificationCode = code.trim();
    if (!factorId) {
      setError('MFA情報を取得できませんでした');
      return;
    }
    if (!/^\d{6}$/.test(verificationCode)) {
      setError('6桁のコードを入力してください');
      return;
    }

    setError('');
    setIsVerifying(true);

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: verificationCode,
      });

      if (error) {
        setError('確認コードが正しくありません');
        return;
      }

      await refreshMfaStatus();
      const redirectPath = typeof location.state?.from === 'string' ? location.state.from : '';
      navigate(redirectPath || getHomePath(Boolean(user?.can_view_dashboard)), { replace: true });
    } catch (error) {
      console.error('mfa verify error:', error);
      setError('確認コードを検証できませんでした');
    } finally {
      setIsVerifying(false);
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">MFA確認</h1>
          <p className="mt-2 text-sm text-zinc-500">Google Authenticatorの6桁コードを入力してください。</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            読み込み中
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-5">
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
              確認
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
