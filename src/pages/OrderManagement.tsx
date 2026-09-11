import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Filter,
  FlaskConical,
  Plus,
  Search,
  X,
  ClipboardCheck,
} from "lucide-react";

type OrderStatus = "受付済" | "製作中" | "確認待ち" | "納品準備";

interface PrototypeOrder {
  id: string;
  orderedAt: string;
  dueAt: string;
  clinic: string;
  dentist: string;
  patient: string;
  tooth: string;
  product: string;
  material: string;
  shade: string;
  technician: string;
  status: OrderStatus;
}

const SAMPLE_ORDERS: PrototypeOrder[] = [
  { id: "OR-260910-018", orderedAt: "2026-09-10", dueAt: "2026-09-16 15:00", clinic: "みなと歯科医院", dentist: "山田 太郎", patient: "K.S", tooth: "右上6", product: "ジルコニアクラウン", material: "フルジルコニア", shade: "A2", technician: "佐藤", status: "製作中" },
  { id: "OR-260910-017", orderedAt: "2026-09-10", dueAt: "2026-09-14 11:00", clinic: "さくらデンタルクリニック", dentist: "鈴木 花子", patient: "M.T", tooth: "左下4-6", product: "ブリッジ", material: "ジルコニア", shade: "A3", technician: "田中", status: "確認待ち" },
  { id: "OR-260909-012", orderedAt: "2026-09-09", dueAt: "2026-09-12 17:00", clinic: "青葉歯科", dentist: "高橋 健", patient: "H.N", tooth: "上下顎", product: "総義歯", material: "レジン", shade: "A3.5", technician: "伊藤", status: "納品準備" },
  { id: "OR-260909-008", orderedAt: "2026-09-09", dueAt: "2026-09-18 12:00", clinic: "みなと歯科医院", dentist: "山田 太郎", patient: "A.O", tooth: "左上1", product: "e.max インレー", material: "二ケイ酸リチウム", shade: "B1", technician: "未割当", status: "受付済" },
];

const fieldClass = "mt-1.5 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";
const labelClass = "text-sm font-semibold text-zinc-700";

function StatusBadge({ status }: { status: OrderStatus }) {
  const style = status === "納品準備" ? "bg-emerald-50 text-emerald-700" : status === "確認待ち" ? "bg-amber-50 text-amber-700" : status === "製作中" ? "bg-blue-50 text-blue-700" : "bg-zinc-100 text-zinc-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{status}</span>;
}

function OrderForm({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("試作画面のため、入力内容は保存されません。");
  };

  return (
    <form onSubmit={submit} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-5 sm:px-7">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700"><FlaskConical className="h-3.5 w-3.5" />プロトタイプ</div>
          <h2 className="text-xl font-black text-zinc-900">受注入力</h2>
          <p className="mt-1 text-sm text-zinc-500">歯科技工指示書の基本情報を入力します。現在は保存されません。</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100" aria-label="閉じる"><X className="h-5 w-5" /></button>
      </div>

      <div className="space-y-7 p-5 sm:p-7">
        <section>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-zinc-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">1</span>受付・医院情報</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className={labelClass}>受注日<span className="text-red-500"> *</span><input required type="date" defaultValue="2026-09-10" className={fieldClass} /></label>
            <label className={labelClass}>医院名<span className="text-red-500"> *</span><input required placeholder="例：みなと歯科医院" className={fieldClass} /></label>
            <label className={labelClass}>担当歯科医師<input placeholder="例：山田 太郎" className={fieldClass} /></label>
            <label className={labelClass}>医院側ケース番号<input placeholder="例：C-1042" className={fieldClass} /></label>
          </div>
        </section>

        <section>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-zinc-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">2</span>患者・技工物情報</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className={labelClass}>患者名／患者ID<span className="text-red-500"> *</span><input required placeholder="例：K.S / P-00124" className={fieldClass} /></label>
            <label className={labelClass}>歯式<span className="text-red-500"> *</span><input required placeholder="例：右上6、11-13" className={fieldClass} /></label>
            <label className={labelClass}>技工物<span className="text-red-500"> *</span><select required defaultValue="" className={fieldClass}><option value="" disabled>選択してください</option><option>クラウン</option><option>ブリッジ</option><option>インレー／アンレー</option><option>インプラント上部構造</option><option>部分床義歯</option><option>総義歯</option><option>マウスピース</option><option>その他</option></select></label>
            <label className={labelClass}>数量<input type="number" min="1" defaultValue="1" className={fieldClass} /></label>
            <label className={labelClass}>材料<select defaultValue="" className={fieldClass}><option value="">選択してください</option><option>フルジルコニア</option><option>レイヤリングジルコニア</option><option>二ケイ酸リチウム</option><option>CAD/CAM レジン</option><option>メタル</option><option>義歯床用レジン</option></select></label>
            <label className={labelClass}>シェード<input placeholder="例：A2 /  cervical A3" className={fieldClass} /></label>
            <label className={labelClass}>印象・データ種別<select className={fieldClass}><option>口腔内スキャン</option><option>シリコン印象</option><option>アルジネート印象</option><option>模型</option><option>その他</option></select></label>
            <label className={labelClass}>製作担当者<input placeholder="例：佐藤" className={fieldClass} /></label>
          </div>
        </section>

        <section>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-zinc-900"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">3</span>納期・指示</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <label className={labelClass}>納品希望日<span className="text-red-500"> *</span><input required type="date" className={fieldClass} /></label>
            <label className={labelClass}>希望時刻<input type="time" className={fieldClass} /></label>
            <label className={labelClass}>受け渡し方法<select className={fieldClass}><option>集配</option><option>宅配便</option><option>医院持込</option><option>その他</option></select></label>
          </div>
          <label className={`${labelClass} mt-4 block`}>設計・製作指示<textarea rows={4} placeholder="マージン、咬合、コンタクト、形態、ステインなどの指示を入力" className="mt-1.5 w-full rounded-xl border border-zinc-200 p-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label>
          <label className={`${labelClass} mt-4 block`}>添付物・備考<textarea rows={2} placeholder="対合歯模型、バイト、写真、返却物など" className="mt-1.5 w-full rounded-xl border border-zinc-200 p-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" /></label>
        </section>

        {message && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{message}</div>}
        <div className="flex flex-col-reverse gap-3 border-t border-zinc-100 pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="h-11 rounded-xl border border-zinc-200 px-5 text-sm font-bold text-zinc-700 hover:bg-zinc-50">キャンセル</button>
          <button type="submit" className="h-11 rounded-xl bg-indigo-600 px-6 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">入力内容を確認（試作）</button>
        </div>
      </div>
    </form>
  );
}

export default function OrderManagement() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [clinic, setClinic] = useState("すべて");
  const [status, setStatus] = useState("すべて");
  const [product, setProduct] = useState("すべて");
  const [dueDate, setDueDate] = useState("");

  const filtered = useMemo(() => SAMPLE_ORDERS.filter((order) => {
    const haystack = Object.values(order).join(" ").toLowerCase();
    return (!keyword || haystack.includes(keyword.toLowerCase())) && (clinic === "すべて" || order.clinic === clinic) && (status === "すべて" || order.status === status) && (product === "すべて" || order.product === product) && (!dueDate || order.dueAt.startsWith(dueDate));
  }), [keyword, clinic, status, product, dueDate]);

  const clearFilters = () => { setKeyword(""); setClinic("すべて"); setStatus("すべて"); setProduct("すべて"); setDueDate(""); };

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3"><button onClick={() => navigate("/dashboard")} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100" aria-label="ダッシュボードへ戻る"><ArrowLeft className="h-5 w-5" /></button><div><h1 className="text-xl font-black text-zinc-900">受注管理</h1><p className="text-xs text-zinc-500">歯科技工の受注情報を受付から納品まで管理</p></div></div>
          <div className="flex items-center gap-2"><button onClick={() => navigate("/deliveries")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-bold text-zinc-700 hover:bg-zinc-50"><ClipboardCheck className="h-4 w-4" />納品確認</button><button onClick={() => setShowForm(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700"><Plus className="h-4 w-4" />受注入力</button></div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        {showForm ? <OrderForm onClose={() => setShowForm(false)} /> : <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-zinc-500">本日の受注</p><p className="mt-2 text-2xl font-black text-zinc-900">2<span className="ml-1 text-sm text-zinc-500">件</span></p></div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-zinc-500">製作中</p><p className="mt-2 text-2xl font-black text-blue-600">1<span className="ml-1 text-sm text-zinc-500">件</span></p></div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-zinc-500">確認待ち</p><p className="mt-2 text-2xl font-black text-amber-600">1<span className="ml-1 text-sm text-zinc-500">件</span></p></div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold text-zinc-500">納品準備</p><p className="mt-2 text-2xl font-black text-emerald-600">1<span className="ml-1 text-sm text-zinc-500">件</span></p></div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-100 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-base font-black text-zinc-900"><ClipboardList className="h-5 w-5 text-indigo-600" />受注一覧</h2><p className="mt-1 text-xs text-zinc-500">表示中 {filtered.length}件 / 試作用サンプル {SAMPLE_ORDERS.length}件</p></div><button onClick={clearFilters} className="text-xs font-bold text-zinc-500 hover:text-indigo-600">フィルタをクリア</button></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <label className="relative xl:col-span-1"><Search className="absolute left-3 top-3.5 h-4 w-4 text-zinc-400" /><input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="患者・歯式・受注番号" className="h-11 w-full rounded-xl border border-zinc-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" /></label>
                <select aria-label="医院で絞り込み" value={clinic} onChange={(e) => setClinic(e.target.value)} className={fieldClass.replace("mt-1.5 ", "")}><option>すべて</option>{[...new Set(SAMPLE_ORDERS.map((o) => o.clinic))].map((v) => <option key={v}>{v}</option>)}</select>
                <select aria-label="ステータスで絞り込み" value={status} onChange={(e) => setStatus(e.target.value)} className={fieldClass.replace("mt-1.5 ", "")}><option>すべて</option>{[...new Set(SAMPLE_ORDERS.map((o) => o.status))].map((v) => <option key={v}>{v}</option>)}</select>
                <select aria-label="技工物で絞り込み" value={product} onChange={(e) => setProduct(e.target.value)} className={fieldClass.replace("mt-1.5 ", "")}><option>すべて</option>{[...new Set(SAMPLE_ORDERS.map((o) => o.product))].map((v) => <option key={v}>{v}</option>)}</select>
                <label className="relative"><CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-zinc-400" /><input aria-label="納品希望日で絞り込み" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-11 w-full rounded-xl border border-zinc-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" /></label>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs font-bold text-zinc-500"><tr><th className="px-5 py-3">受注番号 / 受注日</th><th className="px-4 py-3">医院 / 歯科医師</th><th className="px-4 py-3">患者</th><th className="px-4 py-3">歯式</th><th className="px-4 py-3">技工物 / 材料</th><th className="px-4 py-3">シェード</th><th className="px-4 py-3">納品希望</th><th className="px-4 py-3">担当</th><th className="px-5 py-3">進捗</th></tr></thead>
                <tbody className="divide-y divide-zinc-100">{filtered.map((order) => <tr key={order.id} className="hover:bg-indigo-50/30"><td className="px-5 py-4"><p className="font-bold text-indigo-700">{order.id}</p><p className="mt-1 text-xs text-zinc-500">{order.orderedAt}</p></td><td className="px-4 py-4"><p className="font-bold text-zinc-900">{order.clinic}</p><p className="mt-1 text-xs text-zinc-500">{order.dentist} 先生</p></td><td className="px-4 py-4 font-medium text-zinc-700">{order.patient}</td><td className="px-4 py-4 font-bold text-zinc-800">{order.tooth}</td><td className="px-4 py-4"><p className="font-bold text-zinc-900">{order.product}</p><p className="mt-1 text-xs text-zinc-500">{order.material}</p></td><td className="px-4 py-4 text-zinc-700">{order.shade}</td><td className="px-4 py-4 font-medium text-zinc-800">{order.dueAt}</td><td className="px-4 py-4 text-zinc-700">{order.technician}</td><td className="px-5 py-4"><StatusBadge status={order.status} /></td></tr>)}</tbody>
              </table>
              {filtered.length === 0 && <div className="px-6 py-14 text-center"><Filter className="mx-auto h-8 w-8 text-zinc-300" /><p className="mt-3 font-bold text-zinc-700">条件に一致する受注がありません</p><button onClick={clearFilters} className="mt-2 text-sm font-bold text-indigo-600">フィルタをクリア</button></div>}
            </div>
          </section>
        </>}
      </main>
    </div>
  );
}
