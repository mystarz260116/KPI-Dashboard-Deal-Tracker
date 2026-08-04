import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, Loader2, Pencil, Plus, Power, PowerOff, RefreshCw, Search, Shield, Trash2, UserRoundCog, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../lib/authFetch';
import { useAuth } from '../contexts/AuthContext';

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department_id: number | null;
  department: string;
  can_view_dashboard: boolean;
  can_manage_users: boolean;
  is_suspended: boolean;
  created_at: string | null;
};

type Department = { id: number; name: string };

const initialForm = {
  name: '', email: '', password: '', department_id: '', role: 'user',
  can_view_dashboard: false, can_manage_users: false,
};

function generateInitialPassword() {
  const required = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%'];
  const allCharacters = required.join('');
  const pick = (characters: string) => characters[crypto.getRandomValues(new Uint32Array(1))[0] % characters.length];
  const characters = [...required.map(pick), ...Array.from({ length: 10 }, () => pick(allCharacters))];
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.getRandomValues(new Uint32Array(1))[0] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join('');
}

export default function UserMaster() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', email: '', department_id: '', role: 'user',
    can_view_dashboard: false, can_manage_users: false,
  });

  const openCreateModal = () => {
    setForm({ ...initialForm, password: generateInitialPassword() });
    setPasswordCopied(false);
    setShowCreate(true);
  };

  const copyInitialPassword = async () => {
    try {
      await navigator.clipboard.writeText(form.password);
      setPasswordCopied(true);
    } catch {
      setError('初期パスワードをコピーできませんでした');
    }
  };

  const regenerateInitialPassword = () => {
    setForm((current) => ({ ...current, password: generateInitialPassword() }));
    setPasswordCopied(false);
  };

  const openEditModal = (target: ManagedUser) => {
    setEditTarget(target);
    setEditForm({
      name: target.name,
      email: target.email,
      department_id: String(target.department_id ?? ''),
      role: target.role,
      can_view_dashboard: target.can_view_dashboard,
      can_manage_users: target.can_manage_users,
    });
  };

  const updateUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!editTarget) return;
    setBusyId(editTarget.id); setError(''); setMessage('');
    try {
      const response = await authFetch('/api/users', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'master', operation: 'update', user_id: editTarget.id,
          ...editForm, department_id: Number(editForm.department_id),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || '更新できませんでした');
      setMessage('ユーザー情報を更新しました');
      setEditTarget(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ユーザー情報を更新できませんでした');
    } finally { setBusyId(''); }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersResponse, departmentsResponse] = await Promise.all([
        authFetch('/api/users?action=master'), authFetch('/api/departments'),
      ]);
      if (!usersResponse.ok || !departmentsResponse.ok) throw new Error('load failed');
      setUsers(await usersResponse.json());
      setDepartments(await departmentsResponse.json());
    } catch {
      setError('ユーザー情報を取得できませんでした');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((entry) => [entry.name, entry.email, entry.department, entry.role]
      .some((value) => value.toLowerCase().includes(normalized)));
  }, [query, users]);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setBusyId('create'); setError(''); setMessage('');
    try {
      const response = await authFetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'master', ...form, department_id: Number(form.department_id) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || '追加できませんでした');
      setMessage(`アカウントを追加しました。メール: ${form.email}`);
      setForm(initialForm); setShowCreate(false); await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'アカウントを追加できませんでした');
    } finally { setBusyId(''); }
  };

  const toggleSuspended = async (target: ManagedUser) => {
    const nextSuspended = !target.is_suspended;
    if (!window.confirm(`${target.name} のアカウントを${nextSuspended ? '停止' : '再開'}しますか？`)) return;
    setBusyId(target.id); setError(''); setMessage('');
    const response = await authFetch('/api/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'master', operation: 'set-suspended', user_id: target.id, suspended: nextSuspended }),
    });
    const payload = await response.json();
    if (!response.ok) setError(payload?.error || '更新できませんでした');
    else { setMessage(`アカウントを${nextSuspended ? '停止' : '再開'}しました`); await load(); }
    setBusyId('');
  };

  const deleteUser = async (target: ManagedUser) => {
    if (!window.confirm(`${target.name} のアカウントを完全に削除します。この操作は取り消せません。続行しますか？`)) return;
    setBusyId(target.id); setError(''); setMessage('');
    const response = await authFetch('/api/users', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'master', user_id: target.id }),
    });
    const payload = await response.json();
    if (!response.ok) setError(payload?.error || '削除できませんでした');
    else { setMessage('アカウントを削除しました'); await load(); }
    setBusyId('');
  };

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white px-4 py-4 shadow-sm sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(user?.can_view_dashboard ? '/dashboard' : '/deals/new')} className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100" aria-label="戻る"><ArrowLeft /></button>
            <div><h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900"><UserRoundCog className="text-indigo-600" />ユーザーマスタ</h1><p className="text-sm text-zinc-500">アカウントの追加・停止・削除</p></div>
          </div>
          <button onClick={openCreateModal} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700"><Plus className="h-4 w-4" />追加</button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-8">
        {(error || message) && <div className={`mb-4 rounded-lg p-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{error || message}</div>}
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 shadow-sm"><Search className="h-4 w-4 text-zinc-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="氏名・メール・部署・権限で検索" className="w-full outline-none" /></div>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          {loading ? <div className="flex justify-center p-12"><Loader2 className="animate-spin text-indigo-600" /></div> : (
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-600"><tr><th className="px-4 py-3">ユーザー</th><th className="px-4 py-3">部署</th><th className="px-4 py-3">ロール</th><th className="px-4 py-3">アクセス権</th><th className="px-4 py-3">状態</th><th className="px-4 py-3 text-right">操作</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">{filteredUsers.map((entry) => (
                <tr key={entry.id} className="hover:bg-zinc-50"><td className="px-4 py-3"><div className="font-semibold text-zinc-900">{entry.name}</div><div className="text-zinc-500">{entry.email}</div></td><td className="px-4 py-3">{entry.department || '—'}</td><td className="px-4 py-3">{entry.role}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{entry.can_view_dashboard && <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">ダッシュボード</span>}{entry.can_manage_users && <span className="flex items-center gap-1 rounded bg-purple-50 px-2 py-1 text-xs text-purple-700"><Shield className="h-3 w-3" />ユーザー管理</span>}{!entry.can_view_dashboard && !entry.can_manage_users && '—'}</div></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${entry.is_suspended ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{entry.is_suspended ? '停止中' : '有効'}</span></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><button disabled={busyId === entry.id} onClick={() => openEditModal(entry)} className="rounded-lg border border-indigo-200 p-2 hover:bg-indigo-50 disabled:opacity-30" title="編集"><Pencil className="h-4 w-4 text-indigo-600" /></button><button disabled={busyId === entry.id || entry.id === user?.id} onClick={() => void toggleSuspended(entry)} className="rounded-lg border border-zinc-200 p-2 hover:bg-zinc-100 disabled:opacity-30" title={entry.is_suspended ? '再開' : '停止'}>{entry.is_suspended ? <Power className="h-4 w-4 text-emerald-600" /> : <PowerOff className="h-4 w-4 text-amber-600" />}</button><button disabled={busyId === entry.id || entry.id === user?.id} onClick={() => void deleteUser(entry)} className="rounded-lg border border-red-200 p-2 hover:bg-red-50 disabled:opacity-30" title="削除"><Trash2 className="h-4 w-4 text-red-600" /></button></div></td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </main>

      {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={createUser} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">アカウント追加</h2><button type="button" onClick={() => setShowCreate(false)}><X /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2 text-sm">氏名<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="sm:col-span-2 text-sm">メールアドレス<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><div className="sm:col-span-2"><div className="mb-1 flex items-center justify-between"><span className="text-sm">初期パスワード</span><span className={`text-xs ${passwordCopied ? 'text-emerald-600' : 'text-zinc-400'}`}>{passwordCopied ? 'コピーしました' : '自動生成'}</span></div><div className="flex gap-2"><input required readOnly minLength={8} type="text" value={form.password} className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm font-semibold tracking-wide text-zinc-700" /><button type="button" onClick={() => void copyInitialPassword()} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-indigo-200 px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50" title="コピー"><Copy className="h-4 w-4" /><span className="hidden sm:inline">コピー</span></button><button type="button" onClick={regenerateInitialPassword} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50" title="再生成"><RefreshCw className="h-4 w-4" /></button></div><p className="mt-1.5 text-xs text-zinc-500">このパスワードを利用者へ安全な方法で渡してください。</p></div><label className="text-sm">部署<select required value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">選択</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="text-sm">ロール<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="user">一般ユーザー</option><option value="admin">管理者</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.can_view_dashboard} onChange={(e) => setForm({ ...form, can_view_dashboard: e.target.checked })} />ダッシュボード閲覧</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.can_manage_users} onChange={(e) => setForm({ ...form, can_manage_users: e.target.checked })} />ユーザー管理</label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border px-4 py-2">キャンセル</button><button disabled={busyId === 'create'} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{busyId === 'create' && <Loader2 className="h-4 w-4 animate-spin" />}追加</button></div></form></div>}
      {editTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={updateUser} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold">ユーザー情報編集</h2><p className="text-sm text-zinc-500">{editTarget.name}</p></div><button type="button" onClick={() => setEditTarget(null)}><X /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2 text-sm">氏名<input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="sm:col-span-2 text-sm">メールアドレス<input required type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="text-sm">部署<select required value={editForm.department_id} onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="">選択</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="text-sm">ロール<select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="user">一般ユーザー</option><option value="admin">管理者</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.can_view_dashboard} onChange={(e) => setEditForm({ ...editForm, can_view_dashboard: e.target.checked })} />ダッシュボード閲覧</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.can_manage_users} disabled={editTarget.id === user?.id} onChange={(e) => setEditForm({ ...editForm, can_manage_users: e.target.checked })} />ユーザー管理</label></div>{editTarget.id === user?.id && <p className="mt-3 text-xs text-amber-700">自分自身のユーザー管理権限は解除できません。</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setEditTarget(null)} className="rounded-lg border px-4 py-2">キャンセル</button><button disabled={busyId === editTarget.id} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{busyId === editTarget.id && <Loader2 className="h-4 w-4 animate-spin" />}保存</button></div></form></div>}
    </div>
  );
}
