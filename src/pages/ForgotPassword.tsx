import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import logoImg from '../assets/Mystarz-logo.png';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        setError('パスワード再設定メールを送信できませんでした');
        return;
      }

      setMessage('パスワード再設定用のメールを送信しました。メール内のリンクから新しいパスワードを設定してください。');
    } catch (error) {
      console.error('password reset email error:', error);
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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">パスワード再設定</h1>
          <p className="mt-2 text-zinc-500">登録済みのメールアドレスを入力してください</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              メールアドレス <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-4 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="example@mail.com"
            />
          </div>

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
          {message && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Mail className="mr-2 h-5 w-5" />}
            再設定メールを送信
          </button>
        </form>

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
