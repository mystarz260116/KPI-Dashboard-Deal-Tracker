# supabase/migrations/20260616143000_redact_patient_name_at_storage_boundary.sql

## 対応元ファイル

`supabase/migrations/20260616143000_redact_patient_name_at_storage_boundary.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「redact patient name at storage boundary」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。

## コードから読み取れる手がかり

- 関連DB関数: redact_sales_import_patient_name、redact_ireba_patient_name_and_payload、redact_ireba_raw_payload_patient_name

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
