# supabase/migrations/20260528100000_add_usage_tracking.sql

## 対応元ファイル

`supabase/migrations/20260528100000_add_usage_tracking.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「add usage tracking」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 既存テーブルへ業務項目や制約を追加します。

## コードから読み取れる手がかり

- 関連テーブル: profiles、login_events、deal_page_views
- 関連インデックス: idx_login_events_user_logged_in_at、idx_login_events_logged_in_at、idx_deal_page_views_viewer_viewed_at、idx_deal_page_views_clinic_viewed_at、idx_deal_page_views_deal_viewed_at

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
