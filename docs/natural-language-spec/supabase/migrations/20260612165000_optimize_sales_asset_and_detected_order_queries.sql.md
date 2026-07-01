# supabase/migrations/20260612165000_optimize_sales_asset_and_detected_order_queries.sql

## 対応元ファイル

`supabase/migrations/20260612165000_optimize_sales_asset_and_detected_order_queries.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「optimize sales asset and detected order queries」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 検索・集計性能を改善するための索引やクエリ構造に関係します。

## コードから読み取れる手がかり

- 関連インデックス: idx_sales_import_rows_delivery_scope_customer、idx_sales_import_rows_order_scope_customer
- 関連DB関数: clinic_asset_sales_aggregates、sales_prior_customer_codes

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
