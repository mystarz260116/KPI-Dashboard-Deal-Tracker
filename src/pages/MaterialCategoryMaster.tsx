import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Loader2,
  PackageSearch,
  Save,
  Search,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../lib/authFetch";

type Region = "all" | "tokyo" | "osaka";
type Alias = {
  department_id: number;
  product_name: string;
  row_count: number;
  units_total: number;
  sales_total: number;
};
type MaterialRow = {
  normalized_product_code: string;
  representative_name: string;
  aliases: Alias[];
  first_sales_date: string;
  last_sales_date: string;
  row_count: number;
  units_total: number;
  sales_total: number;
  return_sales_total: number;
  material_category: string;
  notes: string;
  is_active: boolean;
};
type Edit = { material_category: string; notes: string; is_active: boolean };

const CATEGORIES = [
  "未分類",
  "CADCAM冠",
  "emax",
  "FMC",
  "インプラント",
  "インレー・アンレー",
  "ジルコニア",
  "その他の自費クラウン",
  "その他の保険クラウン",
  "デンチャー(自費)",
  "デンチャー(保険)",
  "バイトプレート",
  "前装冠",
];
const locationName = (id: number) => (id === 1 ? "大阪" : "東京");

export default function MaterialCategoryMaster() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<MaterialRow[]>([]),
    [edits, setEdits] = useState<Record<string, Edit>>({}),
    [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [region, setRegion] = useState<Region>("all"),
    [category, setCategory] = useState("all"),
    [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch("/api/kpi?path=material-category-master", {
        cache: "no-store",
      });
      if (!r.ok) throw new Error();
      const p = await r.json();
      setRows(p.rows ?? []);
      setEdits({});
    } catch {
      setMessage("材料カテゴリマスタの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const effective = useMemo(
    () =>
      rows.map((r) => ({ ...r, ...(edits[r.normalized_product_code] ?? {}) })),
    [rows, edits],
  );
  const filtered = useMemo(
    () =>
      effective
        .map((row) => {
          const aliases =
            region === "all"
              ? row.aliases
              : row.aliases.filter(
                  (a) => a.department_id === (region === "osaka" ? 1 : 2),
                );
          return {
            ...row,
            aliases,
            sales_total: aliases.reduce((n, a) => n + Number(a.sales_total), 0),
            units_total: aliases.reduce((n, a) => n + Number(a.units_total), 0),
          };
        })
        .filter((row) => {
          if (
            !row.aliases.length ||
            (category !== "all" && row.material_category !== category)
          )
            return false;
          const q = search.trim().toLowerCase();
          return (
            !q ||
            `${row.normalized_product_code} ${row.representative_name} ${row.aliases.map((a) => a.product_name).join(" ")}`
              .toLowerCase()
              .includes(q)
          );
        }),
    [effective, region, category, search],
  );
  const totals = useMemo(
    () =>
      filtered.reduce(
        (s, r) => ({
          sales: s.sales + r.sales_total,
          units: s.units + r.units_total,
        }),
        { sales: 0, units: 0 },
      ),
    [filtered],
  );
  const update = (row: MaterialRow, patch: Partial<Edit>) =>
    setEdits((v) => ({
      ...v,
      [row.normalized_product_code]: {
        material_category: row.material_category,
        notes: row.notes,
        is_active: row.is_active,
        ...v[row.normalized_product_code],
        ...patch,
      },
    }));
  const save = async () => {
    const codes = Object.keys(edits);
    if (!codes.length) return;
    setSaving(true);
    try {
      const payload = codes.map((normalized_product_code) => ({
        normalized_product_code,
        ...edits[normalized_product_code],
      }));
      const r = await authFetch("/api/kpi?path=material-category-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      if (!r.ok) throw new Error();
      const result = await r.json();
      await load();
      setMessage(
        `${payload.length}コード（${result.saved_count}名称）を保存しました`,
      );
    } catch {
      setMessage("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-zinc-900">
      <header className="sticky top-0 z-20 border-b bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/masters")}
              className="rounded-xl border p-2 text-zinc-500"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-black">材料売上 カテゴリマスタ</h1>
              <p className="text-xs font-bold text-zinc-400">
                材料コード単位で代表名称を確認し、カテゴリを割り当てます
              </p>
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving || !Object.keys(edits).length}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white disabled:bg-zinc-300"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            変更を保存
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-[1800px] p-6">
        <section className="mb-5 grid gap-4 sm:grid-cols-3">
          {[
            ["表示コード", `${filtered.length}種類`],
            [
              "累計材料売上",
              `¥${Math.round(totals.sales).toLocaleString("ja-JP")}`,
            ],
            [
              "累計数量",
              totals.units.toLocaleString("ja-JP", {
                maximumFractionDigits: 1,
              }),
            ],
          ].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-xs font-black text-zinc-400">{l}</p>
              <p className="mt-1 text-3xl font-black text-indigo-600">{v}</p>
            </div>
          ))}
        </section>
        <section className="mb-5 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="mb-2 text-xs font-black text-zinc-500">売上表示</p>
              <div className="flex rounded-xl bg-zinc-100 p-1">
                {(
                  [
                    ["all", "全社"],
                    ["tokyo", "東京"],
                    ["osaka", "大阪"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setRegion(k)}
                    className={`rounded-lg px-5 py-2 text-sm font-black ${region === k ? "bg-white text-indigo-700 shadow-sm" : "text-zinc-500"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <label className="min-w-52">
              <span className="mb-2 block text-xs font-black text-zinc-500">
                材料カテゴリ
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 font-bold"
              >
                <option value="all">すべて</option>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="min-w-72 flex-1">
              <span className="mb-2 block text-xs font-black text-zinc-500">
                検索
              </span>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="材料コード・代表名称・名称候補"
                  className="w-full rounded-xl border py-2.5 pl-10 pr-3"
                />
              </div>
            </label>
          </div>
          {message && (
            <p className="mt-3 text-sm font-bold text-indigo-600">{message}</p>
          )}
        </section>
        <section className="overflow-hidden rounded-2xl bg-white shadow-sm">
          {loading ? (
            <div className="flex justify-center gap-2 p-16">
              <Loader2 className="animate-spin" />
              読み込み中
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="bg-zinc-100 text-xs text-zinc-500">
                  <tr>
                    {[
                      "材料コード",
                      "代表的な補綴物名",
                      "数量",
                      "売上",
                      "材料カテゴリ",
                      "備考",
                      "対象",
                    ].map((x, i) => (
                      <th
                        key={x}
                        className={`px-4 py-3 ${i === 2 || i === 3 ? "text-right" : "text-left"}`}
                      >
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((row) => (
                    <tr
                      key={row.normalized_product_code}
                      className={
                        edits[row.normalized_product_code]
                          ? "bg-amber-50/50"
                          : ""
                      }
                    >
                      <td className="px-4 py-3 font-mono font-black">
                        {row.normalized_product_code}
                      </td>
                      <td className="max-w-md px-4 py-3">
                        <div className="font-black">
                          {row.representative_name}
                        </div>
                        <button
                          onClick={() =>
                            setExpanded((v) => ({
                              ...v,
                              [row.normalized_product_code]:
                                !v[row.normalized_product_code],
                            }))
                          }
                          className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-indigo-600"
                        >
                          <ChevronDown
                            className={`h-3.5 w-3.5 ${expanded[row.normalized_product_code] ? "rotate-180" : ""}`}
                          />
                          {row.aliases.length}件の名称・拠点明細
                        </button>
                        {expanded[row.normalized_product_code] && (
                          <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg bg-zinc-50 p-2 text-xs">
                            {row.aliases.map((a, i) => (
                              <div
                                key={`${a.department_id}-${a.product_name}-${i}`}
                                className="flex justify-between gap-4"
                              >
                                <span>
                                  <b>{locationName(a.department_id)}</b>　
                                  {a.product_name}
                                </span>
                                <span className="shrink-0 text-zinc-500">
                                  {a.row_count.toLocaleString()}明細
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.units_total.toLocaleString("ja-JP", {
                          maximumFractionDigits: 1,
                        })}
                      </td>
                      <td className="px-4 py-3 text-right font-black">
                        ¥{Math.round(row.sales_total).toLocaleString("ja-JP")}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={row.material_category}
                          onChange={(e) =>
                            update(row, { material_category: e.target.value })
                          }
                          className="w-full min-w-48 rounded-lg border px-3 py-2 font-bold"
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={row.notes}
                          onChange={(e) =>
                            update(row, { notes: e.target.value })
                          }
                          placeholder="分類メモ"
                          className="w-full min-w-48 rounded-lg border px-3 py-2"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() =>
                            update(row, { is_active: !row.is_active })
                          }
                          className={`mx-auto flex h-7 w-7 items-center justify-center rounded-lg border ${row.is_active ? "border-indigo-600 bg-indigo-600 text-white" : "text-zinc-300"}`}
                        >
                          {row.is_active && <Check className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-16 text-center text-zinc-400"
                      >
                        <PackageSearch className="mx-auto mb-3" />
                        該当する材料コードがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
