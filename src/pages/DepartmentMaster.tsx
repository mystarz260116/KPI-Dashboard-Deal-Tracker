import { useEffect, useState } from "react";
import { ArrowLeft, Building2, Loader2, Plus, Save, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../lib/authFetch";

type Department = {
  id: number;
  name: string;
  is_sales_department: boolean;
  is_active: boolean;
  sort_order: number;
};

export default function DepartmentMaster() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Department[]>([]);
  const [initial, setInitial] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const load = async () => {
    setLoading(true);
    const response = await authFetch("/api/departments");
    const payload = await response.json();
    const next = Array.isArray(payload) ? payload : [];
    setRows(next);
    setInitial(JSON.stringify(next));
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const saveAll = async () => {
    setSaving(true);
    const old = new Map(
      (JSON.parse(initial) as Department[]).map((row) => [
        row.id,
        JSON.stringify(row),
      ]),
    );
    const changed = rows.filter(
      (row) => old.get(row.id) !== JSON.stringify(row),
    );
    const responses = await Promise.all(
      changed.map((row) =>
        authFetch("/api/departments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
        }),
      ),
    );
    setMessage(
      responses.every((response) => response.ok)
        ? `${changed.length}件を保存しました`
        : "一部を保存できませんでした",
    );
    if (responses.every((response) => response.ok))
      setInitial(JSON.stringify(rows));
    setSaving(false);
  };
  const add = async () => {
    if (!name.trim()) return;
    setMessage("");
    const response = await authFetch("/api/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, is_sales_department: false }),
    });
    const payload = await response.json();
    if (response.ok) {
      setName("");
      await load();
      setMessage("部署を追加しました");
    } else {
      setMessage(payload?.error ?? "部署を追加できませんでした");
    }
  };
  const dirty = Boolean(initial) && initial !== JSON.stringify(rows);
  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/masters")}
              className="rounded-lg border p-2"
            >
              <ArrowLeft />
            </button>
            <Building2 className="text-indigo-600" />
            <div>
              <h1 className="text-xl font-black">部署マスタ</h1>
              <p className="text-xs text-zinc-500">全システム共通の所属部署</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/user-master")}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"
            >
              <Users className="h-4 w-4" />
              ユーザーマスタ
            </button>
            <button
              disabled={!dirty || saving}
              onClick={() => void saveAll()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:bg-zinc-300"
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
      <main className="mx-auto max-w-5xl p-4 sm:p-8">
        {message && (
          <p className="mb-4 rounded-lg bg-white p-3 text-sm">{message}</p>
        )}
        <div className="mb-5 flex gap-2 rounded-xl bg-white p-4 shadow-sm">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="新しい部署名"
            className="flex-1 rounded-lg border px-3 py-2"
          />
          <button
            onClick={() => void add()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white"
          >
            <Plus className="h-4 w-4" />
            部署を追加
          </button>
        </div>
        {loading ? (
          <Loader2 className="mx-auto mt-20 animate-spin" />
        ) : (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="grid grid-cols-[1fr_140px_100px_90px] gap-3 border-b bg-zinc-50 px-4 py-3 text-xs font-bold text-zinc-500">
              <span>部署名</span>
              <span>区分</span>
              <span>状態</span>
              <span>表示順</span>
            </div>
            {rows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_140px_100px_90px] items-center gap-3 border-b p-4"
              >
                <input
                  value={row.name}
                  onChange={(e) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.id === row.id
                          ? { ...item, name: e.target.value }
                          : item,
                      ),
                    )
                  }
                  className="rounded-lg border px-3 py-2 font-bold"
                />
                <label className="text-sm">
                  <input
                    type="checkbox"
                    checked={row.is_sales_department}
                    onChange={(e) =>
                      setRows((current) =>
                        current.map((item) =>
                          item.id === row.id
                            ? { ...item, is_sales_department: e.target.checked }
                            : item,
                        ),
                      )
                    }
                  />{" "}
                  営業部署
                </label>
                <label className="text-sm">
                  <input
                    type="checkbox"
                    checked={row.is_active}
                    onChange={(e) =>
                      setRows((current) =>
                        current.map((item) =>
                          item.id === row.id
                            ? { ...item, is_active: e.target.checked }
                            : item,
                        ),
                      )
                    }
                  />{" "}
                  有効
                </label>
                <input
                  type="number"
                  value={row.sort_order}
                  onChange={(e) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.id === row.id
                          ? { ...item, sort_order: Number(e.target.value) }
                          : item,
                      ),
                    )
                  }
                  className="rounded-lg border px-2 py-2"
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
