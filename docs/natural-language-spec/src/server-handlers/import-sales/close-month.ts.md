# src/server-handlers/import-sales/close-month.ts

## 対応元ファイル

`src/server-handlers/import-sales/close-month.ts`

## 役割

売上インポート処理のサーバーハンドラーです。

## 主な仕様

- アップロード内容の検証、正規化、確定、月締めを担当します。
- CSV/TSV由来の行データを業務テーブルへ反映します。

## コードから読み取れる手がかり

- 主な依存: ../../lib/supabaseAdmin.js、../../../api/_lib/auth.js、../../../api/_lib/regions.js、../../../api/_lib/salesImportMonthClosures.js、../../../api/_lib/regionalReads.js
- 主な公開要素: handler

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
