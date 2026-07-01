# supabase/migrations/20260610170500_add_clinic_asset_sales_indexes.sql

## 対応元ファイル

`supabase/migrations/20260610170500_add_clinic_asset_sales_indexes.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「add clinic asset sales indexes」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 既存テーブルへ業務項目や制約を追加します。
- 検索・集計性能を改善するための索引やクエリ構造に関係します。

## コードから読み取れる手がかり

- 関連インデックス: idx_sales_import_rows_kind_delivery_dept_staff_customer、idx_sales_import_rows_kind_order_dept_staff_customer

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
