# supabase/migrations/20260423093000_drop_sales_region_columns.sql

## 対応元ファイル

`supabase/migrations/20260423093000_drop_sales_region_columns.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「drop sales region columns」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 不要になった旧構造を削除または無効化します。

## コードから読み取れる手がかり

- 関連テーブル: sales_import_raw_rows、sales_import_rows、external_staffs、customer_external_staff_maps、profile_external_staff_maps

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
