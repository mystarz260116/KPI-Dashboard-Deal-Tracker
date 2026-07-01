# supabase/migrations/20260528133000_add_product_category_master_and_sales_row_product_fields.sql

## 対応元ファイル

`supabase/migrations/20260528133000_add_product_category_master_and_sales_row_product_fields.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「add product category master and sales row product fields」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 既存テーブルへ業務項目や制約を追加します。

## コードから読み取れる手がかり

- 関連テーブル: product_category_masters、sales_import_rows
- 関連インデックス: idx_product_category_masters_code、idx_product_category_masters_proposal_category、idx_sales_import_rows_normalized_product_code
- 関連DB関数: sync_sales_import_batch

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
