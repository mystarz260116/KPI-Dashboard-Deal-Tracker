# supabase/migrations/20260422114500_drop_shared_sales_import_tables.sql

## 対応元ファイル

`supabase/migrations/20260422114500_drop_shared_sales_import_tables.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「drop shared sales import tables」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 不要になった旧構造を削除または無効化します。

## コードから読み取れる手がかり

- 関連テーブル: sales_import_rows、customer_external_staff_maps_kansai、customer_external_staff_maps_tokyo、sales_import_raw_rows_kansai、sales_import_raw_rows_tokyo、customer_external_staff_maps、profile_external_staff_maps、external_staffs、sales_import_raw_rows
- 関連DB関数: sum_sales_import_rows_amount

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
