# supabase/migrations/20260423100000_sync_sales_import_batch_rpc.sql

## 対応元ファイル

`supabase/migrations/20260423100000_sync_sales_import_batch_rpc.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「sync sales import batch rpc」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。

## コードから読み取れる手がかり

- 関連DB関数: normalize_sales_import_date、parse_sales_import_amount、sync_sales_import_batch

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
