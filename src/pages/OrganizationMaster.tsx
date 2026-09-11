import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
  Power,
  PowerOff,
  Save,
  Search,
  Shield,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../lib/authFetch";

type Department = {
  id: number;
  name: string;
  is_sales_department: boolean;
  is_active: boolean;
  sort_order: number;
};
type Staff = {
  department_id: number;
  code: string;
  name: string | null;
  raw_label: string | null;
};
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  department_id: number | null;
  department: string;
  is_salesperson: boolean;
  external_staff_code: string;
  can_view_dashboard: boolean;
  can_manage_users: boolean;
  is_suspended: boolean;
};

export default function OrganizationMaster() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [staffs, setStaffs] = useState<Staff[]>([]);
  const [initial, setInitial] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingPasswordFor, setSendingPasswordFor] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    error?: boolean;
    text: string;
  } | null>(null);
  const [modal, setModal] = useState<"user" | null>(null);
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    department_id: "",
    is_salesperson: false,
  });
  const snapshot = (d = departments, u = users) => JSON.stringify({ d, u });

  const load = async () => {
    setLoading(true);
    setNotice(null);
    try {
      const [dr, ur] = await Promise.all([
        authFetch("/api/departments"),
        authFetch("/api/users?action=master"),
      ]);
      const [dp, up] = await Promise.all([dr.json(), ur.json()]);
      if (!dr.ok || !ur.ok)
        throw new Error("組織マスタ用のDBマイグレーションが未適用です");
      const d = Array.isArray(dp) ? dp : [];
      const u = Array.isArray(up?.users) ? up.users : [];
      setDepartments(d);
      setUsers(u);
      setStaffs(Array.isArray(up?.external_staffs) ? up.external_staffs : []);
      setInitial(snapshot(d, u));
    } catch (e) {
      setNotice({
        error: true,
        text: e instanceof Error ? e.message : "取得に失敗しました",
      });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const dirty = Boolean(initial) && snapshot() !== initial;
  const shownUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? users.filter((u) =>
          `${u.name} ${u.email} ${u.department}`.toLowerCase().includes(q),
        )
      : users;
  }, [query, users]);
  const unmapped = users.filter(
    (u) => u.is_salesperson && !u.external_staff_code,
  ).length;

  const saveAll = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const old = JSON.parse(initial) as { d: Department[]; u: User[] };
      const oldD = new Map(old.d.map((x) => [x.id, JSON.stringify(x)]));
      const oldU = new Map(old.u.map((x) => [x.id, JSON.stringify(x)]));
      const dc = departments.filter(
        (x) => oldD.get(x.id) !== JSON.stringify(x),
      );
      const uc = users.filter((x) => oldU.get(x.id) !== JSON.stringify(x));
      const responses = await Promise.all([
        ...dc.map((x) =>
          authFetch("/api/departments", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(x),
          }),
        ),
        ...uc.map((x) =>
          authFetch("/api/users", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "master",
              operation: "update",
              user_id: x.id,
              ...x,
            }),
          }),
        ),
      ]);
      if (responses.some((r) => !r.ok))
        throw new Error("一部の設定を保存できませんでした");
      setInitial(snapshot());
      setNotice({ text: `${dc.length + uc.length}件の変更を保存しました` });
    } catch (e) {
      setNotice({
        error: true,
        text: e instanceof Error ? e.message : "保存に失敗しました",
      });
    } finally {
      setSaving(false);
    }
  };

  const submitUser = async () => {
    setSaving(true);
    setNotice(null);
    const response = await authFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "master",
        ...userForm,
        department_id: Number(userForm.department_id),
        role: "user",
        can_view_dashboard: true,
        can_manage_users: false,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setSaving(false);
      return setNotice({
        error: true,
        text: payload.error ?? "ユーザーを追加できませんでした",
      });
    }
    setModal(null);
    setUserForm({
      name: "",
      email: "",
      department_id: "",
      is_salesperson: false,
    });
    await load();
    setSaving(false);
    setNotice({
      text: `${payload.email} にログイン招待メールを送信しました`,
    });
  };
  const sendPasswordResetEmail = async (target: User) => {
    if (
      !window.confirm(
        `${target.name}（${target.email}）へパスワード再設定メールを送信しますか？`,
      )
    )
      return;
    setSendingPasswordFor(target.id);
    setNotice(null);
    const response = await authFetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "master",
        operation: "send-password-reset-email",
        user_id: target.id,
      }),
    });
    const payload = await response.json();
    if (response.ok) {
      setNotice({
        text: `${payload.email} にパスワード再設定メールを送信しました`,
      });
    } else
      setNotice({
        error: true,
        text: payload?.error ?? "再設定メールを送信できませんでした",
      });
    setSendingPasswordFor(null);
  };
  const toggleSuspended = async (target: User) => {
    const response = await authFetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "master",
        operation: "set-suspended",
        user_id: target.id,
        suspended: !target.is_suspended,
      }),
    });
    if (response.ok)
      setUsers((rows) =>
        rows.map((row) =>
          row.id === target.id
            ? { ...row, is_suspended: !row.is_suspended }
            : row,
        ),
      );
  };
  const deleteUser = async (target: User) => {
    if (!window.confirm(`${target.name}を完全に削除しますか？`)) return;
    const response = await authFetch("/api/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "master", user_id: target.id }),
    });
    if (response.ok) {
      setUsers((rows) => rows.filter((row) => row.id !== target.id));
      setNotice({ text: "ユーザーを削除しました" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-zinc-100 to-indigo-50/60">
      <header className="sticky top-0 z-20 border-b border-white/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/masters")}
              className="rounded-xl border p-2 text-zinc-500"
            >
              <ArrowLeft />
            </button>
            <span className="rounded-xl bg-indigo-600 p-3 text-white">
              <Users />
            </span>
            <div>
              <h1 className="text-xl font-black">ユーザーマスタ</h1>
              <p className="text-xs text-zinc-500">
                所属・営業区分・権限・いればくん担当者・アカウント状態
              </p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={() => navigate("/department-master")}
              className="inline-flex items-center gap-1 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-bold text-purple-700"
            >
              <Building2 className="h-4 w-4" />
              部署マスタ
            </button>
            <button
              onClick={() => setModal("user")}
              className="inline-flex items-center gap-1 rounded-xl border bg-white px-3 py-2 text-sm font-bold"
            >
              <Plus className="h-4 w-4" />
              ユーザー
            </button>
            <button
              onClick={() => void saveAll()}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-indigo-200 disabled:bg-zinc-300 disabled:shadow-none"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              一括保存
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] p-4 sm:p-8">
        {notice && (
          <div
            className={`mb-5 flex items-center gap-2 rounded-xl border p-4 text-sm font-bold ${notice.error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
          >
            <CheckCircle2 className="h-5 w-5" />
            {notice.text}
          </div>
        )}
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {[
            ["営業部員", `${users.filter((u) => u.is_salesperson).length}名`],
            ["未紐付け", `${unmapped}名`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-white bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-bold text-zinc-400">{label}</p>
              <p
                className={`mt-1 text-2xl font-black ${label === "未紐付け" && unmapped ? "text-amber-600" : "text-zinc-900"}`}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
        {loading ? (
          <Loader2 className="mx-auto mt-24 animate-spin text-indigo-600" />
        ) : (
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b bg-zinc-50 px-5 py-4">
              <div>
                <h2 className="font-black">ユーザー一覧</h2>
                <p className="text-xs text-zinc-500">
                  メール・所属・営業・いればくん・権限・パスワード・状態を同じ行で管理
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
                <Search className="h-4 w-4 text-zinc-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="氏名・メール・部署"
                  className="w-44 text-sm outline-none"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1750px] text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">ユーザー</th>
                    <th className="px-3 py-3">メールアドレス</th>
                    <th className="px-3 py-3">パスワード</th>
                    <th className="px-3 py-3">所属部署</th>
                    <th className="px-3 py-3">営業</th>
                    <th className="px-3 py-3">いればくん担当者</th>
                    <th className="px-3 py-3">ロール</th>
                    <th className="px-3 py-3">アクセス権</th>
                    <th className="px-3 py-3">状態</th>
                    <th className="px-4 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {shownUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-indigo-50/30">
                      <td className="px-4 py-3">
                        <p className="font-bold">{u.name}</p>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="email"
                          value={u.email}
                          onChange={(e) =>
                            setUsers((rows) =>
                              rows.map((x) =>
                                x.id === u.id
                                  ? { ...x, email: e.target.value }
                                  : x,
                              ),
                            )
                          }
                          className="w-64 rounded-lg border px-3 py-2"
                          aria-label={`${u.name}のメールアドレス`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => void sendPasswordResetEmail(u)}
                          disabled={sendingPasswordFor !== null}
                          className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 disabled:opacity-50"
                        >
                          {sendingPasswordFor === u.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <KeyRound className="h-4 w-4" />
                          )}
                          再設定メール
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={u.department_id ?? ""}
                          onChange={(e) => {
                            const departmentId = Number(e.target.value);
                            const department = departments.find(
                              (d) => d.id === departmentId,
                            );
                            setUsers((rows) =>
                              rows.map((x) =>
                                x.id === u.id
                                  ? {
                                      ...x,
                                      department_id: departmentId,
                                      department: department?.name ?? "",
                                      external_staff_code: "",
                                    }
                                  : x,
                              ),
                            );
                          }}
                          className="w-full rounded-lg border px-2 py-2 font-bold"
                        >
                          <option value="">選択</option>
                          {departments
                            .filter((d) => d.is_active)
                            .map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <label className="whitespace-nowrap font-bold">
                          <input
                            type="checkbox"
                            checked={u.is_salesperson}
                            onChange={(e) =>
                              setUsers((rows) =>
                                rows.map((x) =>
                                  x.id === u.id
                                    ? {
                                        ...x,
                                        is_salesperson: e.target.checked,
                                        external_staff_code: e.target.checked
                                          ? x.external_staff_code
                                          : "",
                                      }
                                    : x,
                                ),
                              )
                            }
                          />{" "}
                          営業部員
                        </label>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          disabled={!u.is_salesperson}
                          value={u.external_staff_code}
                          onChange={(e) =>
                            setUsers((rows) =>
                              rows.map((x) =>
                                x.id === u.id
                                  ? {
                                      ...x,
                                      external_staff_code: e.target.value,
                                    }
                                  : x,
                              ),
                            )
                          }
                          className={`w-full rounded-lg border px-2 py-2 disabled:bg-zinc-100 ${u.is_salesperson && !u.external_staff_code ? "border-amber-300 bg-amber-50" : ""}`}
                        >
                          <option value="">
                            {u.is_salesperson ? "担当者を選択" : "対象外"}
                          </option>
                          {staffs
                            .filter((s) => s.department_id === u.department_id)
                            .map((s) => (
                              <option
                                key={`${s.department_id}:${s.code}`}
                                value={s.code}
                              >
                                {s.code}｜{s.name || s.raw_label || "名称なし"}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={u.role}
                          onChange={(e) =>
                            setUsers((rows) =>
                              rows.map((x) =>
                                x.id === u.id
                                  ? { ...x, role: e.target.value }
                                  : x,
                              ),
                            )
                          }
                          className="rounded-lg border px-2 py-2"
                        >
                          <option value="user">一般</option>
                          <option value="admin">管理者</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1 whitespace-nowrap text-xs">
                          <label>
                            <input
                              type="checkbox"
                              checked={u.can_view_dashboard}
                              onChange={(e) =>
                                setUsers((rows) =>
                                  rows.map((x) =>
                                    x.id === u.id
                                      ? {
                                          ...x,
                                          can_view_dashboard: e.target.checked,
                                        }
                                      : x,
                                  ),
                                )
                              }
                            />{" "}
                            ダッシュボード
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={u.can_manage_users}
                              onChange={(e) =>
                                setUsers((rows) =>
                                  rows.map((x) =>
                                    x.id === u.id
                                      ? {
                                          ...x,
                                          can_manage_users: e.target.checked,
                                        }
                                      : x,
                                  ),
                                )
                              }
                            />{" "}
                            ユーザー管理
                          </label>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold ${u.is_suspended ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
                        >
                          {u.is_suspended ? "停止中" : "有効"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => void toggleSuspended(u)}
                            className="rounded-lg border p-2"
                            title={u.is_suspended ? "再開" : "停止"}
                          >
                            {u.is_suspended ? (
                              <Power className="h-4 w-4 text-emerald-600" />
                            ) : (
                              <PowerOff className="h-4 w-4 text-amber-600" />
                            )}
                          </button>
                          <button
                            onClick={() => void deleteUser(u)}
                            className="rounded-lg border border-rose-200 p-2"
                            title="削除"
                          >
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
      {dirty && (
        <div className="fixed bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-2xl bg-zinc-900 px-5 py-3 text-white shadow-2xl">
          <span className="text-sm font-bold">未保存の変更があります</span>
          <button
            onClick={() => void saveAll()}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-black"
          >
            一括保存
          </button>
        </div>
      )}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-black">ユーザーを追加</h2>
              <button onClick={() => setModal(null)}>
                <X />
              </button>
            </div>
            {modal === "user" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2 text-sm font-bold">
                  氏名
                  <input
                    value={userForm.name}
                    onChange={(e) =>
                      setUserForm({ ...userForm, name: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
                <label className="sm:col-span-2 text-sm font-bold">
                  メール
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) =>
                      setUserForm({ ...userForm, email: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </label>
                <label className="text-sm font-bold">
                  所属部署
                  <select
                    value={userForm.department_id}
                    onChange={(e) =>
                      setUserForm({
                        ...userForm,
                        department_id: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  >
                    <option value="">選択</option>
                    {departments
                      .filter((d) => d.is_active)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-800">
                  追加後、このメールアドレスへログイン用の招待リンクを自動送信します。
                </div>
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={userForm.is_salesperson}
                    onChange={(e) =>
                      setUserForm({
                        ...userForm,
                        is_salesperson: e.target.checked,
                      })
                    }
                  />
                  営業部員
                </label>
                <button
                  onClick={() => void submitUser()}
                  disabled={
                    !userForm.name ||
                    !userForm.email ||
                    !userForm.department_id ||
                    saving
                  }
                  className="sm:col-span-2 rounded-xl bg-indigo-600 py-3 font-black text-white disabled:bg-zinc-300"
                >
                  {saving ? "追加・メール送信中…" : "ユーザーを追加"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
