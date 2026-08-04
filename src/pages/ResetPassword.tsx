import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import logoImg from '../assets/Mystarz-logo.png';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../lib/passwordPolicy';

const getPasswordUpdateErrorMessage = (message: string) => {
  if (message.includes('New password should be different from the old password')) {
    return '現在のパスワードとは異なる新しいパスワードを入力してください。';
  }

  return 'パスワードを更新できませんでした。再設定メールを送り直して、新しいメール内のリンクから開いてください。';
};

export default function ResetPassword() {
  const navigate = useNavigate();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const getPostResetPath = () => {
    if (!user) return '/login';

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    return isMobile || !user.can_view_dashboard ? '/deals/new' : '/dashboard';
  };

  useEffect(() => {
    let isMounted = true;

    const markReady = async (
      session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']
    ) => {
      if (!isMounted) return;

      if (!session) {
        setUserEmail('');
        setIsReady(false);
        setIsCheckingSession(false);
        return;
      }

      const { data, error } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (error || !data.user) {
        setUserEmail('');
        setIsReady(false);
        setIsCheckingSession(false);
        return;
      }

      setUserEmail(data.user.email ?? '');
      setIsReady(true);
      setIsCheckingSession(false);
    };

    const initializeRecoverySession = async () => {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const queryParams = new URLSearchParams(window.location.search);
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const hashType = hashParams.get('type');
        const code = queryParams.get('code');

        if (hashType === 'recovery' && accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            throw error;
          }

          window.history.replaceState(null, document.title, window.location.pathname);
          await markReady(data.session);
          return;
        }

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            throw error;
          }

          window.history.replaceState(null, document.title, window.location.pathname);
          await markReady(data.session);
          return;
        }

        await markReady(null);
      } catch (error) {
        console.error('password recovery session error:', error);
        if (!isMounted) return;

        setUserEmail('');
        setIsReady(false);
        setIsCheckingSession(false);
      }
    };

    initializeRecoverySession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        void markReady(session);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!isValidPassword(password)) {
      setError(PASSWORD_POLICY_MESSAGE);
      return;
    }

    if (password !== passwordConfirm) {
      setError('確認用パスワードが一致しません');
      return;
    }

    setIsLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError('パスワード再設定リンクの有効期限が切れています。再設定メールを送り直してください。');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        console.error('password update error:', error);
        if (error.message.includes('AAL2')) {
          setError('MFAを一時停止中のため更新できませんでした。再設定メールを送り直してください。');
          return;
        }

        setError(getPasswordUpdateErrorMessage(error.message));
        return;
      }

      setMessage('パスワードを更新しました。');
      setPassword('');
      setPasswordConfirm('');
    } catch (error) {
      console.error('password update error:', error);
      setError('サーバーに接続できませんでした');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-purple-600 via-pink-500 to-rose-400 p-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <img src={logoImg} alt="Mystarz ロゴ" className="h-16 w-auto object-contain" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl"
      >
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">新しいパスワード</h1>
          <p className="mt-2 text-zinc-500">今後ログインに使用するパスワードを設定してください</p>
        </div>

        {isCheckingSession ? (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            確認中
          </div>
        ) : message ? (
          <div className="space-y-6">
            <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">
              <CheckCircle2 className="mb-2 h-5 w-5" />
              {message}
            </div>
            <button
              type="button"
              onClick={() => navigate(getPostResetPath())}
              disabled={isAuthLoading}
              className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700"
            >
              {isAuthLoading ? '確認中' : 'アプリを開く'}
            </button>
          </div>
        ) : isReady ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <input
              type="email"
              name="username"
              autoComplete="username"
              value={userEmail}
              readOnly
              hidden
            />
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                新しいパスワード <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-4 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="8文字以上"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700">
                新しいパスワード（確認） <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-4 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="もう一度入力"
              />
            </div>

            {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <KeyRound className="mr-2 h-5 w-5" />}
              パスワードを更新
            </button>
          </form>
        ) : (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
            パスワード再設定リンクを確認できませんでした。再設定メールのリンクから開き直してください。
          </div>
        )}

        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="inline-flex items-center text-sm font-medium text-zinc-600 hover:text-indigo-600"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            ログインに戻る
          </Link>
        </div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 text-xs text-white/70"
      >
        mystarz　All rights Reserved. Copyright ©mystarz 2026
      </motion.p>
    </div>
  );
}
