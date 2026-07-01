# supabase/migrations/20260604090000_add_order_import_data_kind.sql

## 対応元ファイル

`supabase/migrations/20260604090000_add_order_import_data_kind.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「add order import data kind」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 既存テーブルへ業務項目や制約を追加します。

## コードから読み取れる手がかり

- 関連テーブル: sales_import_raw_rows、sales_import_rows、sales_import_month_closures
- 関連インデックス: idx_sales_import_raw_rows_department_kind_batch、idx_sales_import_rows_department_kind_delivery_date、idx_sales_import_rows_department_kind_order_date、idx_sales_import_month_closures_department_kind_month
- 関連DB関数: sync_sales_import_batch、sum_sales_import_rows_amount

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
