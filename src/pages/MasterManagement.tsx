import {
  ArrowLeft,
  Building2,
  ChevronRight,
  PackageSearch,
  Settings2,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const masters = [
  {
    title: "ユーザーマスタ",
    description:
      "ユーザー追加、メール、所属、営業区分、権限、パスワード、状態を管理",
    path: "/user-master",
    icon: Users,
    color: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  {
    title: "部署マスタ",
    description: "全システム共通の部署、営業部署区分、表示順を管理",
    path: "/department-master",
    icon: Building2,
    color: "border-purple-200 bg-purple-50 text-purple-700",
  },
  {
    title: "材料カテゴリマスタ",
    description: "材料コードごとの代表名称と売上カテゴリを管理",
    path: "/material-category-master",
    icon: PackageSearch,
    color: "border-teal-200 bg-teal-50 text-teal-700",
  },
];

export default function MasterManagement() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-zinc-100 to-indigo-50/60">
      <header className="border-b border-white/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4 sm:px-8">
          <button
            onClick={() => navigate("/dashboard")}
            className="rounded-xl border bg-white p-2 text-zinc-500"
            aria-label="ダッシュボードへ戻る"
          >
            <ArrowLeft />
          </button>
          <span className="rounded-xl bg-zinc-900 p-3 text-white">
            <Settings2 />
          </span>
          <div>
            <h1 className="text-xl font-black">マスタ管理</h1>
            <p className="text-xs text-zinc-500">
              管理するマスタを選択してください
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-8">
        <div className="grid gap-4 md:grid-cols-2">
          {masters.map((master) => {
            const Icon = master.icon;
            return (
              <button
                key={master.path}
                onClick={() => navigate(master.path)}
                className="group flex items-center gap-4 rounded-2xl border border-white bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <span className={`rounded-2xl border p-4 ${master.color}`}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-black text-zinc-900">
                    {master.title}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-zinc-500">
                    {master.description}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 text-zinc-300 transition group-hover:translate-x-1 group-hover:text-indigo-500" />
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
