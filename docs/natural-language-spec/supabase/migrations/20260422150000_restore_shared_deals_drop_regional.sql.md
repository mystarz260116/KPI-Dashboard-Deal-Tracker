# supabase/migrations/20260422150000_restore_shared_deals_drop_regional.sql

## 対応元ファイル

`supabase/migrations/20260422150000_restore_shared_deals_drop_regional.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「restore shared deals drop regional」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 不要になった旧構造を削除または無効化します。

## コードから読み取れる手がかり

- 関連テーブル: deals、deals_kansai、deals_tokyo
- 関連インデックス: idx_deals_user_id、idx_deals_deal_date、idx_deals_customer_code、idx_deals_prospect_customer_id

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
