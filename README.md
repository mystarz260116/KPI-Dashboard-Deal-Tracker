# KPI Dashboard & Deal Tracker

株式会社マイ・スターズ向けの営業KPI管理・商談管理アプリです。売上インポート、KPI集計、CRM検索、商談入力、商談履歴、進捗ボード、コメント通知、医院マージをひとつの画面群で扱います。

## URL

- 本番: https://kpi-dashboard-deal-tracker.vercel.app/login
- ローカルWeb: http://127.0.0.1:5174
- ローカルAPI: http://127.0.0.1:3100

## 開発コマンド

```bash
npm install
LOCAL_API_PORT=3100 LOCAL_WEB_PORT=5174 npm run local:dev
npm run lint
npm run build
```

`local:dev` は Vite とローカルAPIサーバーを同時に起動します。本番・プレビューでは `api/` 配下の Vercel Functions がAPIになります。

## 全体構成

| 場所 | 役割 |
| --- | --- |
| `src/pages/` | Reactの画面。営業ユーザー/管理者が実際に触るUI。 |
| `src/server-handlers/` | APIルートから呼ばれる業務ロジック。DB操作や集計の中心。 |
| `api/` | Vercel Functionsの入口。認証、ルーティング、レスポンス整形を担当。 |
| `src/lib/` | Supabaseクライアント、認証付きfetch、日付、性能ログなどの共通部品。 |
| `supabase/migrations/` | DBスキーマ、RLS、RPC、業務テーブルの変更履歴。 |
| `scripts/` | ローカル開発サーバー、同期、デバッグ用スクリプト。 |

## 画面ファイル

| ファイル | コメント |
| --- | --- |
| `src/pages/Login.tsx` | ログイン画面。Supabase Authでメール/パスワード認証します。 |
| `src/pages/Signup.tsx` | 新規ユーザー登録画面。部署・ユーザー情報の初期登録導線です。 |
| `src/pages/Dashboard.tsx` | KPIダッシュボード。売上/KPI/新規受注先/通知/インポート導線を表示します。今後の大きな改修対象で、コンポーネント分割候補です。 |
| `src/pages/SalesPerformanceDashboard.tsx` | 商品カテゴリ・部署・担当者別の実績分析画面。予算や商品カテゴリの集計確認に使います。 |
| `src/pages/DealInput.tsx` | 新規商談入力画面。医院検索、prospect作成、提案カテゴリ、カテゴリ別の受注予定額/月、通知フィードを扱います。 |
| `src/pages/DealHistory.tsx` | 商談履歴一覧。検索・フィルター・コメント・リアクション表示を担当します。 |
| `src/pages/DealProgressDashboard.tsx` | 商談進捗ボード。月/担当/部署/温度フィルター、ステータス別カード、予定額ポートフォリオ、月締めを扱います。 |
| `src/pages/ClinicDetail.tsx` | 医院詳細画面。顧客/prospectの商談履歴、コメント、リアクション、売上明細を表示します。 |
| `src/pages/CrmSearch.tsx` | CRM検索画面。顧客とprospectの検索入口です。 |
| `src/pages/CustomerMerge.tsx` | 顧客マージ画面。重複候補の確認、統合、却下を行います。 |

## 共通ライブラリ

| ファイル | コメント |
| --- | --- |
| `src/lib/supabase.ts` | フロントエンド用Supabaseクライアント。Authセッション取得に使います。 |
| `src/lib/supabaseAdmin.ts` | API/サーバー処理用Supabaseクライアント。service role前提のDB操作で使います。 |
| `src/lib/authFetch.ts` | フロントエンドからAPIへ認証付きでfetchする共通関数です。 |
| `src/lib/dateUtils.ts` | 月初/月末などの日付処理をまとめています。 |
| `src/lib/mergeUtils.ts` | 顧客マージ関連の表示・判定補助です。 |
| `src/lib/perf.ts` | API応答時間などの簡易パフォーマンスログです。 |
| `src/contexts/AuthContext.tsx` | ログイン状態、プロフィール、権限のReact Contextです。 |

## API入口

| ファイル | コメント |
| --- | --- |
| `api/kpi.ts` | KPI、売上分析、新規受注先一覧のAPI入口です。 |
| `api/deals.ts` | 商談作成、履歴、ボード、コメント、リアクション、通知、月締めのAPI入口です。 |
| `api/import.ts` | 売上CSV/TSVインポート、確認、確定、月締めのAPI入口です。 |
| `api/merge.ts` | 顧客マージ候補の生成、件数、確定、却下のAPI入口です。 |
| `api/clinic.ts` | 医院詳細・商談・売上明細のAPI入口です。 |
| `api/customers.ts` | 顧客検索、prospect検索、売上取込からの顧客同期を扱います。 |
| `api/users.ts` | ユーザー一覧取得APIです。ダッシュボードの担当者フィルターで使います。 |
| `api/departments.ts` | 部署一覧取得APIです。部署フィルターや予算紐づけで使います。 |
| `api/auth/register.ts` | サインアップ時のプロフィール作成APIです。 |
| `api/_lib/auth.ts` | API側の認証ヘルパーです。 |
| `api/_lib/salesImport.ts` | 売上インポート処理で共有するパース・正規化ロジックです。 |
| `api/_lib/regionalReads.ts` | 地域/部署別の読み取り補助です。 |

## サーバーハンドラー

| ファイル | コメント |
| --- | --- |
| `src/server-handlers/deals/board.ts` | 進捗ボードの取得。月表示、マージ月判定、ステータス別集計、予定額を扱います。 |
| `src/server-handlers/deals/status.ts` | 商談ステータス更新。ターゲティング、訪問中、交渉中、応諾済み、受注、失注を管理します。 |
| `src/server-handlers/deals/close-month.ts` | 進捗ボードの月締め。翌月への引き継ぎ対象を判定します。 |
| `src/server-handlers/deals/comments.ts` | 商談コメントの投稿・取得です。通知作成の起点にもなります。 |
| `src/server-handlers/deals/reactions.ts` | いいね等のリアクションと、押した人の表示情報を返します。 |
| `src/server-handlers/deals/notifications.ts` | コメント通知一覧・既読化・通知作成を扱います。 |
| `src/server-handlers/deals/notifications-cleanup.ts` | 既読30日経過の通知を削除する定期処理です。 |
| `src/server-handlers/deals/view.ts` | 商談履歴/詳細表示用の取得処理です。 |
| `src/server-handlers/kpi/new-orders.ts` | ダッシュボードの新規受注先一覧です。医院詳細へのリンク情報も返します。 |
| `src/server-handlers/kpi/sales-performance.ts` | 商品カテゴリ別・担当者別の実績集計です。 |
| `src/server-handlers/import-sales/upload.ts` | 売上データのアップロード・プレビュー処理です。 |
| `src/server-handlers/import-sales/finalize.ts` | 売上データの確定処理です。 |
| `src/server-handlers/import-sales/close-month.ts` | 売上インポート側の月締め処理です。 |
| `src/server-handlers/import-product-categories/upsert.ts` | 商品カテゴリマスタの追加・更新です。 |
| `src/server-handlers/customers/sync-from-sales-import.ts` | 売上取込データから顧客マスタを同期します。 |
| `src/server-handlers/customers/sync-and-generate-merge-candidates.ts` | 顧客同期後に重複マージ候補を生成します。 |
| `src/server-handlers/merge/candidates.ts` | マージ候補一覧の取得です。 |
| `src/server-handlers/merge/candidates-count.ts` | 未処理マージ候補数を返します。 |
| `src/server-handlers/merge/generate-candidates.ts` | 顧客重複候補を生成します。 |
| `src/server-handlers/merge/confirm.ts` | 顧客/prospect統合の確定処理です。 |
| `src/server-handlers/merge/reject.ts` | マージ候補の却下処理です。 |

## 主要DB変更

| マイグレーション | コメント |
| --- | --- |
| `20260423113000_add_deal_analysis_fields.sql` | 商談分析に必要な項目を追加しました。 |
| `20260428000000_add_deal_proposal_categories.sql` | 商談に提案カテゴリを追加しました。 |
| `20260428160000_add_deal_pipeline_stage.sql` | 進捗ボード用のパイプラインステータスを追加しました。 |
| `20260528113000_create_deal_comments.sql` | 商談コメントテーブルを作成しました。 |
| `20260528121500_create_deal_reactions.sql` | 商談リアクションテーブルを作成しました。 |
| `20260602090000_create_deal_comment_notifications.sql` | コメント通知テーブルを作成しました。 |
| `20260603090000_backfill_merged_prospect_deal_customer_codes.sql` | prospect統合後に商談が顧客詳細へ残るよう補正しました。 |
| `20260603100000_add_accepted_pipeline_stage.sql` | 進捗ボードに「応諾済み」ステータスを追加しました。 |
| `20260603110000_add_deal_expected_monthly_amounts.sql` | カテゴリ別の受注予定額/月を `expected_monthly_amounts` として保持します。 |

## ルーティングとCron

`vercel.json` で `/api/deals/board` のようなパスを `api/deals.ts?path=board` にrewriteしています。SPAの画面遷移も同じファイルで `index.html` に戻しています。

通知削除Cron:

```json
{
  "path": "/api/deals/notifications-cleanup",
  "schedule": "0 18 * * *"
}
```

日本時間では毎日午前3時ごろに、既読から30日経過したコメント通知を削除します。未読通知は削除しません。

## Supabaseバックアップ

Supabase公式ドキュメントでは、Free/Pro/Team/Enterpriseのプロジェクトは日次バックアップが自動作成されます。確認場所は Supabase Dashboard の `Database > Backups` です。

- Pro: 直近7日分の日次バックアップ
- Team: 直近14日分の日次バックアップ
- Enterprise: 最大30日分の日次バックアップ
- PITR: Point-in-Time Recovery。Pro/Team/Enterpriseで有料アドオンとして有効化できます。

CLIでバックアップ一覧を見る場合:

```bash
supabase login
supabase backups list --project-ref xgsusqvtjqwyhfcrssbg
```

現在のローカル環境ではSupabase Management API用のアクセストークンが無いため、CLIからバックアップ設定の確認・変更はできません。PITRを有効化する場合は、プロジェクトOwner/AdminでSupabase Dashboardに入り、`Database > Backups > Point-in-Time Recovery` から有効化してください。

参考: https://supabase.com/docs/guides/platform/backups

## ダッシュボード改修メモ

`src/pages/Dashboard.tsx` はKPI、売上インポート、マージ通知、コメント通知、新規受注先など複数責務が集まっています。今後の改修では、以下の順で分割すると安全です。

1. API取得ロジックをhooksへ分離する。
2. KPIカード、期間フィルター、新規受注先、通知欄、インポート欄を小コンポーネント化する。
3. 表示用データ整形を `src/server-handlers/kpi/` 側へ寄せ、画面側は表示責務に絞る。
4. 既存の `npm run lint` と `npm run build` を通してから本番反映する。
