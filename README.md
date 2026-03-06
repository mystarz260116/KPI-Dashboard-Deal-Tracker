\# KPI管理アプリ - 株式会社マイ・スターズ



\## 📋 プロジェクト概要

株式会社マイ・スターズの営業KPI管理アプリです。

営業担当者の日々の活動記録・KPI可視化・商談管理を一元化することを目的としています。



\## 🔗 デモURL

https://kpi-dashboard-deal-tracker.vercel.app/login



> ※現在はデモ用のダミーデータを表示しています。メールアドレス・パスワードは何でも入力してログインできます。



\## 📁 ファイル構成

src/ assets/ ロゴ画像 contexts/ AuthContext.tsx（認証） pages/ Dashboard.tsx / Login.tsx / DealInput.tsx types/ 型定義 App.tsx main.tsx


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


## 🙏 朱さんへのお願い（API連携）

現在はデモ用のダミーデータを使用しています。

本番稼働に向けて以下のAPI実装をお願いします。

詳細は別添の「朱さんへのお願いリスト.pdf」をご参照ください。



| # | 場所 | お願い内容 |

|---|------|-----------|

| ① | AuthContext.tsx | Supabase Auth の onAuthStateChange に差し替え |

| ② | Login.tsx | Supabase Auth の signInWithPassword に差し替え |

| ③ | Dashboard.tsx | /api/users と /api/kpi への差し替え |

| ④ | Dashboard.tsx | /api/export/deals への差し替え（CSV出力） |

| ⑤ | DealInput.tsx | /api/clinics?q=検索ワード への差し替え |

| ⑥ | DealInput.tsx | POST /api/clinics（新規医院登録） |

| ⑦ | DealInput.tsx | POST /api/deals（商談登録） |

| ⑧ | DealInput.tsx | activityType を /api/deals に含める |



\## 🛠 技術スタック

\- React / TypeScript / Vite

\- Tailwind CSS

\- Recharts

\- Framer Motion

\- Vercel

