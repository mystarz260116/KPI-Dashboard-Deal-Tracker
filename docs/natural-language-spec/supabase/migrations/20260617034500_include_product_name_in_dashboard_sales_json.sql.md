# supabase/migrations/20260617034500_include_product_name_in_dashboard_sales_json.sql

## 対応元ファイル

`supabase/migrations/20260617034500_include_product_name_in_dashboard_sales_json.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「include product name in dashboard sales json」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。

## コードから読み取れる手がかり

- 関連DB関数: dashboard_sales_import_aggregates_json

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
