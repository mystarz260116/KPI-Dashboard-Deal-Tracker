# supabase/migrations/20260511123000_optimize_sales_import_raw_rows_for_kpi.sql

## 対応元ファイル

`supabase/migrations/20260511123000_optimize_sales_import_raw_rows_for_kpi.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「optimize sales import raw rows for kpi」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 検索・集計性能を改善するための索引やクエリ構造に関係します。

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
