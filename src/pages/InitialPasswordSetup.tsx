import { FormEvent, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { authFetch } from '../lib/authFetch';
import logoImg from '../assets/Mystarz-logo.png';
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from '../lib/passwordPolicy';

export default function InitialPasswordSetup() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!isValidPassword(password)) {
      setError(PASSWORD_POLICY_MESSAGE);
      return;
    }
    if (password !== confirmation) {
      setError('確認用パスワードが一致しません');
      return;
    }

    setIsSaving(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;

      const response = await authFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete-initial-change' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || '設定状態を更新できませんでした');

      window.location.assign('/mfa/setup');
    } catch (cause) {
      console.error('initial password setup error:', cause);
      setError(cause instanceof Error ? cause.message : 'パスワードを設定できませんでした');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <img src={logoImg} alt="Mystarz ロゴ" className="mb-8 h-16 w-auto object-contain" />
      <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600"><KeyRound /></div>
          <h1 className="text-2xl font-bold text-zinc-900">パスワード設定</h1>
          <p className="mt-2 text-sm text-zinc-500">初期パスワードから、ご自身で使用するパスワードへ変更してください。</p>
        </div>
        <div className="space-y-4">
          <label className="block text-sm font-medium text-zinc-700">新しいパスワード<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /><span className="mt-1 block text-xs font-normal text-zinc-500">8文字以上・英大文字・英小文字・記号を各1文字以上</span></label>
          <label className="block text-sm font-medium text-zinc-700">新しいパスワード（確認）<input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
        </div>
        {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <button disabled={isSaving} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{isSaving && <Loader2 className="h-4 w-4 animate-spin" />}パスワードを設定</button>
      </form>
    </div>
  );
}
