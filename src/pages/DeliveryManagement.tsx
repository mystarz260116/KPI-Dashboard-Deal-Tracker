import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Filter,
  PackageCheck,
  Search,
  Truck,
} from "lucide-react";

type DeliveryStatus = "納品待ち" | "本日納品" | "納品済み";

interface DeliveryItem {
  id: string;
  orderId: string;
  deliveryDate: string;
  deliveryTime: string;
  clinic: string;
  patient: string;
  tooth: string;
  product: string;
  quantity: number;
  technician: string;
  method: string;
  initialStatus: DeliveryStatus;
}

const SAMPLE_DELIVERIES: DeliveryItem[] = [
  { id: "DL-260911-006", orderId: "OR-260905-021", deliveryDate: "2026-09-11", deliveryTime: "10:00", clinic: "みなと歯科医院", patient: "K.S", tooth: "右上6", product: "ジルコニアクラウン", quantity: 1, technician: "佐藤", method: "午前集配", initialStatus: "本日納品" },
  { id: "DL-260911-007", orderId: "OR-260906-014", deliveryDate: "2026-09-11", deliveryTime: "14:00", clinic: "さくらデンタルクリニック", patient: "M.T", tooth: "左下4-6", product: "ブリッジ", quantity: 1, technician: "田中", method: "午後集配", initialStatus: "本日納品" },
  { id: "DL-260912-003", orderId: "OR-260909-012", deliveryDate: "2026-09-12", deliveryTime: "17:00", clinic: "青葉歯科", patient: "H.N", tooth: "上下顎", product: "総義歯", quantity: 2, technician: "伊藤", method: "宅配便", initialStatus: "納品待ち" },
  { id: "DL-260910-009", orderId: "OR-260904-008", deliveryDate: "2026-09-10", deliveryTime: "15:30", clinic: "みなと歯科医院", patient: "A.O", tooth: "左上1", product: "e.max インレー", quantity: 1, technician: "佐藤", method: "午後集配", initialStatus: "納品済み" },
];

const selectClass = "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100";

function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  const style = status === "納品済み" ? "bg-emerald-50 text-emerald-700" : status === "本日納品" ? "bg-blue-50 text-blue-700" : "bg-zinc-100 text-zinc-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{status}</span>;
}

export default function DeliveryManagement() {
  const navigate = useNavigate();
  const [checkedIds, setCheckedIds] = useState(() => new Set(SAMPLE_DELIVERIES.filter((item) => item.initialStatus === "納品済み").map((item) => item.id)));
  const [keyword, setKeyword] = useState("");
  const [clinic, setClinic] = useState("すべて");
  const [status, setStatus] = useState("すべて");
  const [deliveryDate, setDeliveryDate] = useState("");

  const rows = useMemo(() => SAMPLE_DELIVERIES.map((item) => ({
    ...item,
    status: checkedIds.has(item.id) ? "納品済み" as const : item.initialStatus === "納品済み" ? "納品待ち" as const : item.initialStatus,
  })).filter((item) => {
    const haystack = Object.values(item).join(" ").toLowerCase();
    return (!keyword || haystack.includes(keyword.toLowerCase())) &&
      (clinic === "すべて" || item.clinic === clinic) &&
      (status === "すべて" || item.status === status) &&
      (!deliveryDate || item.deliveryDate === deliveryDate);
  }), [checkedIds, keyword, clinic, status, deliveryDate]);

  const deliveredCount = checkedIds.size;
  const toggleDelivery = (id: string) => setCheckedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearFilters = () => { setKeyword(""); setClinic("すべて"); setStatus("すべて"); setDeliveryDate(""); };

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/dashboard")} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100" aria-label="ダッシュボードへ戻る"><ArrowLeft className="h-5 w-5" /></button>
            <div><h1 className="text-xl font-black text-zinc-900">納品確認</h1><p className="text-xs text-zinc-500">納品予定と受け渡し状況を確認</p></div>
          </div>
          <div className="flex rounded-xl bg-zinc-100 p-1">
            <button onClick={() => navigate("/orders")} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold text-zinc-600 hover:bg-white"><ClipboardList className="h-4 w-4" />受注管理</button>
            <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-bold text-emerald-700 shadow-sm"><ClipboardCheck className="h-4 w-4" />納品確認</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="flex items-center gap-2 text-xs font-bold text-zinc-500"><Truck className="h-4 w-4" />本日の納品予定</p><p className="mt-2 text-2xl font-black text-blue-600">2<span className="ml-1 text-sm text-zinc-500">件</span></p></div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="flex items-center gap-2 text-xs font-bold text-zinc-500"><PackageCheck className="h-4 w-4" />納品済み</p><p className="mt-2 text-2xl font-black text-emerald-600">{deliveredCount}<span className="ml-1 text-sm text-zinc-500">件</span></p></div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"><p className="flex items-center gap-2 text-xs font-bold text-zinc-500"><ClipboardCheck className="h-4 w-4" />確認進捗</p><div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(deliveredCount / SAMPLE_DELIVERIES.length) * 100}%` }} /></div><span className="text-sm font-black text-zinc-800">{deliveredCount}/{SAMPLE_DELIVERIES.length}</span></div></div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-base font-black text-zinc-900"><ClipboardCheck className="h-5 w-5 text-emerald-600" />納品一覧</h2><p className="mt-1 text-xs text-zinc-500">チェックを付けると納品済みになります（試作・保存なし）</p></div><button onClick={clearFilters} className="text-xs font-bold text-zinc-500 hover:text-emerald-600">フィルタをクリア</button></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-zinc-400" /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="患者・医院・受注番号" className="h-11 w-full rounded-xl border border-zinc-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-400" /></label>
              <select aria-label="医院で絞り込み" value={clinic} onChange={(event) => setClinic(event.target.value)} className={selectClass}><option>すべて</option>{[...new Set(SAMPLE_DELIVERIES.map((item) => item.clinic))].map((value) => <option key={value}>{value}</option>)}</select>
              <select aria-label="納品状況で絞り込み" value={status} onChange={(event) => setStatus(event.target.value)} className={selectClass}><option>すべて</option><option>本日納品</option><option>納品待ち</option><option>納品済み</option></select>
              <label className="relative"><CalendarDays className="absolute left-3 top-3.5 h-4 w-4 text-zinc-400" /><input aria-label="納品日で絞り込み" type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} className="h-11 w-full rounded-xl border border-zinc-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-400" /></label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-bold text-zinc-500"><tr><th className="w-20 px-5 py-3 text-center">納品</th><th className="px-4 py-3">納品予定</th><th className="px-4 py-3">医院</th><th className="px-4 py-3">患者 / 歯式</th><th className="px-4 py-3">技工物</th><th className="px-4 py-3">受注番号</th><th className="px-4 py-3">担当</th><th className="px-4 py-3">受け渡し</th><th className="px-5 py-3">状況</th></tr></thead>
              <tbody className="divide-y divide-zinc-100">{rows.map((item) => {
                const isChecked = checkedIds.has(item.id);
                return <tr key={item.id} className={`transition ${isChecked ? "bg-emerald-50/50" : "hover:bg-zinc-50"}`}>
                  <td className="px-5 py-4 text-center"><button onClick={() => toggleDelivery(item.id)} aria-label={`${item.clinic} ${item.patient}を${isChecked ? "未納品" : "納品済み"}にする`} aria-pressed={isChecked} className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border-2 transition ${isChecked ? "border-emerald-500 bg-emerald-500 text-white" : "border-zinc-300 bg-white text-transparent hover:border-emerald-400"}`}><Check className="h-5 w-5" /></button></td>
                  <td className="px-4 py-4"><p className="font-black text-zinc-900">{item.deliveryDate}</p><p className="mt-1 text-xs text-zinc-500">{item.deliveryTime}</p></td>
                  <td className="px-4 py-4 font-bold text-zinc-900">{item.clinic}</td>
                  <td className="px-4 py-4"><p className="font-bold text-zinc-800">{item.patient}</p><p className="mt-1 text-xs text-zinc-500">{item.tooth}</p></td>
                  <td className="px-4 py-4"><p className="font-bold text-zinc-900">{item.product}</p><p className="mt-1 text-xs text-zinc-500">{item.quantity}点</p></td>
                  <td className="px-4 py-4 font-medium text-indigo-700">{item.orderId}</td><td className="px-4 py-4 text-zinc-700">{item.technician}</td><td className="px-4 py-4 text-zinc-700">{item.method}</td><td className="px-5 py-4"><DeliveryBadge status={item.status} /></td>
                </tr>;
              })}</tbody>
            </table>
            {rows.length === 0 && <div className="px-6 py-14 text-center"><Filter className="mx-auto h-8 w-8 text-zinc-300" /><p className="mt-3 font-bold text-zinc-700">条件に一致する納品予定がありません</p><button onClick={clearFilters} className="mt-2 text-sm font-bold text-emerald-600">フィルタをクリア</button></div>}
          </div>
        </section>

        <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><p><span className="font-bold">試作中：</span>現在のチェック状態は保存されません。次の段階で、確認日時・確認者とともにデータベースへ保存できます。</p></div>
      </main>
    </div>
  );
}
