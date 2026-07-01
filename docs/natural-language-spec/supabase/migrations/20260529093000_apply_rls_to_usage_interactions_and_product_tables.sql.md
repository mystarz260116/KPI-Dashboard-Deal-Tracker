# supabase/migrations/20260529093000_apply_rls_to_usage_interactions_and_product_tables.sql

## 対応元ファイル

`supabase/migrations/20260529093000_apply_rls_to_usage_interactions_and_product_tables.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「apply rls to usage interactions and product tables」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- Row Level Securityポリシーに関係します。

## コードから読み取れる手がかり

- 関連テーブル: login_events、deal_page_views、deal_comments、deal_reactions、product_category_masters、product_departments、product_department_budgets、sales_import_month_closures、deal_board_states、deal_board_month_closures
- 関連DB関数: is_admin_user、can_access_dashboard_data

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
