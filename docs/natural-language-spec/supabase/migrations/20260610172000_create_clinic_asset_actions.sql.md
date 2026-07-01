# supabase/migrations/20260610172000_create_clinic_asset_actions.sql

## 対応元ファイル

`supabase/migrations/20260610172000_create_clinic_asset_actions.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「create clinic asset actions」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 新しい業務テーブルまたは補助テーブルを追加します。

## コードから読み取れる手がかり

- 関連テーブル: clinic_asset_actions
- 関連インデックス: idx_clinic_asset_actions_status、idx_clinic_asset_actions_next_action_date

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
