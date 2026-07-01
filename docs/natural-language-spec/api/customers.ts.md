# api/customers.ts

## 対応元ファイル

`api/customers.ts`

## 役割

顧客・prospect検索と売上取込からの顧客同期を扱うAPIです。

## 主な仕様

- 商談入力やCRM検索で利用する検索結果を返します。
- 売上インポート後の顧客マスタ生成・同期処理も担います。

## コードから読み取れる手がかり

- 主な依存: @vercel/node、../src/server-handlers/customers/sync-and-generate-merge-candidates.js、../src/server-handlers/customers/sync-from-sales-import.js
- 主な公開要素: handler
- サブルート: sync-from-sales-import、sync-and-generate-merge-candidates

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
