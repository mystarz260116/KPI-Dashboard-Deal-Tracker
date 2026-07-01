# api/import.ts

## 対応元ファイル

`api/import.ts`

## 役割

売上データと商品カテゴリのインポートAPIのルーターです。

## 主な仕様

- アップロード、確定、月締め、商品カテゴリ更新をサブルートで扱います。
- CSV/TSV取込からDB反映までの入口になります。

## コードから読み取れる手がかり

- 主な依存: @vercel/node、../src/server-handlers/import-sales/finalize.js、../src/server-handlers/import-sales/close-month.js、../src/server-handlers/import-sales/month-closures.js、../src/server-handlers/import-sales/upload.js、../src/server-handlers/import-product-categories/upsert.js
- 主な公開要素: handler
- サブルート: sales/upload、sales/finalize、sales/close-month、sales/month-closures、product-categories/upsert

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
