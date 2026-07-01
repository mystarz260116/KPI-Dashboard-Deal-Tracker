# supabase/migrations/20260423091000_drop_legacy_regional_tables.sql

## 対応元ファイル

`supabase/migrations/20260423091000_drop_legacy_regional_tables.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「drop legacy regional tables」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 不要になった旧構造を削除または無効化します。

## コードから読み取れる手がかり

- 関連テーブル: sales_import_raw_rows_kansai、sales_import_raw_rows_tokyo、sales_import_rows_kansai、sales_import_rows_tokyo、external_staffs_kansai、external_staffs_tokyo、customer_external_staff_maps_kansai、customer_external_staff_maps_tokyo、profile_external_staff_maps_kansai、profile_external_staff_maps_tokyo、customers_kansai、customers_tokyo

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
