\# KPI管理アプリ - 株式会社マイ・スターズ



\## 📋 プロジェクト概要

株式会社マイ・スターズの営業KPI管理アプリです。

営業担当者の日々の活動記録・KPI可視化・商談管理を一元化することを目的としています。



\## 🔗 デモURL

https://kpi-dashboard-deal-tracker.vercel.app/login



> ※現在は Supabase Auth と Vercel API を前提に動作します。



\## 📁 ファイル構成

- `src/`: Vite + React フロントエンド
- `src/contexts/AuthContext.tsx`: Supabase Auth による認証状態管理
- `src/pages/`: ログイン、ダッシュボード、商談入力、履歴、マージ画面
- `api/`: Vercel Serverless Functions
- `src/lib/supabase.ts`: フロントエンド用 Supabase クライアント
- `src/lib/supabaseAdmin.ts`: API 用 Supabase クライアント


## 🔧 開発環境のセットアップ

npm install

npm run dev



\## ✅ 現在実装済みの機能

\- ログイン画面（会社ロゴ・グラデーションデザイン）

\- KPIダッシュボード

&nbsp; - 予算達成率・売上合計・開拓転換率・受注単価

&nbsp; - 営業別訪問数ランキング・新規受注数ランキング

&nbsp; - 新規受注先一覧

&nbsp; - 期間フィルター（日次・週次・月次）

&nbsp; - 表示粒度フィルター（全体・部署・個人）

\- 商談入力フォーム

&nbsp; - 医院検索・新規医院登録

&nbsp; - 活動種別選択（訪問・提案中・交渉中・受注・失注）

&nbsp; - 受注情報入力（受注時のみ表示）

\- CSV出力（デモ用ダミーデータ）


## 🧭 実装方針

- 本番・プレビュー環境では `api/` 配下の Vercel Serverless Functions を正とします。
- フロントエンドは `fetch('/api/...')` と Supabase Auth を利用します。
- サーバーサイドの DB 操作は `src/lib/supabaseAdmin.ts` 経由で行います。



\## 🛠 技術スタック

\- React / TypeScript / Vite

\- Tailwind CSS

\- Recharts

\- Framer Motion

\- Vercel
