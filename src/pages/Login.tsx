import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { motion } from 'motion/react';
import { LogIn, Loader2 } from 'lucide-react';
import logoImg from '../assets/Mystarz-logo.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // ============================================
    // 🚨 朱さんへ：差し替えが必要な箇所です
    // --------------------------------------------
    // 現在はデモ用のダミーログインです。
    // 本番稼働時は Supabase Auth の
    // signInWithPassword に差し替えをお願いします🙏
    // ============================================
    setTimeout(() => {
      login({ id: 'demo', name: 'デモユーザー', department: '①東京営業部' });
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      navigate(isMobile ? '/deals/new' : '/dashboard');
      setIsLoading(false);
    }, 800);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-4">

      {/* ロゴ */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-500 px-10 py-6"

      >
        <img
          src={logoImg}
          alt="Mystarz ロゴ"
          className="h-16 w-auto object-contain"
        />
      </motion.div>

      {/* ログインフォーム */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl"
      >
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">KPI App</h1>
          <p className="mt-2 text-zinc-500">アカウントにログインしてください</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              メールアドレス <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-4 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="example@mail.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              パスワード <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-4 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <LogIn className="mr-2 h-5 w-5" />
            )}
            ログイン
          </button>
        </form>
        <div className="mt-6 text-center">
          <Link to="/signup" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
            アカウントをお持ちでない方はこちら（新規登録）
          </Link>
        </div>
      </motion.div>

      {/* フッター */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 text-xs text-zinc-400"
      >
        mystarz　All rights Reserved. Copyright ©mystarz 2026
      </motion.p>

    </div>
  );
}
