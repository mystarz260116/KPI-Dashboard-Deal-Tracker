# supabase/migrations/20260422122000_drop_shared_sales_views.sql

## 対応元ファイル

`supabase/migrations/20260422122000_drop_shared_sales_views.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「drop shared sales views」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 不要になった旧構造を削除または無効化します。

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
