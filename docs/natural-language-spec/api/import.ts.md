# api/import.ts

## 対応元ファイル

`api/import.ts`

## 役割

商品カテゴリ更新APIのルーターと、廃止済み売上CSV APIの案内口です。

## 主な仕様

- `sales/*` はすべて `410 Gone` を返し、入れ歯くん同期への移行を案内します。
- 商品カテゴリ更新だけをサブルートで扱います。

## コードから読み取れる手がかり

- 主な依存: @vercel/node、../src/server-handlers/import-product-categories/upsert.js
- 主な公開要素: handler
- サブルート: sales/*（廃止）、product-categories/upsert

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
