# supabase/migrations/20260610090000_create_ireba_external_sync_tables.sql

## 対応元ファイル

`supabase/migrations/20260610090000_create_ireba_external_sync_tables.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「create ireba external sync tables」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 新しい業務テーブルまたは補助テーブルを追加します。

## コードから読み取れる手がかり

- 関連テーブル: ireba_order_headers、ireba_order_details、ireba_delivery_headers、ireba_delivery_details
- 関連インデックス: ireba_order_details_internal_code_idx、ireba_delivery_details_internal_code_idx

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
