# src/server-handlers/customers/sync-and-generate-merge-candidates.ts

## 対応元ファイル

`src/server-handlers/customers/sync-and-generate-merge-candidates.ts`

## 役割

顧客同期処理のサーバーハンドラーです。

## 主な仕様

- 売上取込データから顧客マスタを同期します。
- 同期後に重複候補生成など後続処理へつなげます。

## コードから読み取れる手がかり

- 主な依存: ../../lib/supabaseAdmin.js、../../lib/mergeUtils.js、../../../api/_lib/auth.js、../../../api/_lib/regions.js、../../../api/_lib/salesImport.js
- 主な公開要素: handler

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
