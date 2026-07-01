# supabase/migrations/20260528143000_create_product_department_budgets.sql

## 対応元ファイル

`supabase/migrations/20260528143000_create_product_department_budgets.sql`

## 役割

Supabase/Postgresのマイグレーションです。変更テーマは「create product department budgets」です。

## 主な仕様

- ファイル名先頭のタイムスタンプ順に適用される前提です。
- テーブル、カラム、インデックス、RLS、RPC、データ補正などのDB変更を管理します。
- 新しい業務テーブルまたは補助テーブルを追加します。

## コードから読み取れる手がかり

- 関連テーブル: product_department_budgets
- 関連インデックス: idx_product_department_budgets_unique、idx_product_department_budgets_department_month

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- DB変更は適用順、既存データへの影響、RLS、インデックス負荷を確認してから反映してください。
