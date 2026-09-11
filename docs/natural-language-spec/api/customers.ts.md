# api/customers.ts

## 対応元ファイル

`api/customers.ts`

## 役割

廃止済みのCSV由来医院マスタ同期APIに移行案内を返すルーターです。

## 主な仕様

- CSV由来の医院マスタ生成・同期は行いません。
- 対象サブルートには `410 Gone` を返し、入れ歯くん同期への移行を案内します。

## コードから読み取れる手がかり

- 主な依存: @vercel/node
- 主な公開要素: handler
- サブルート: sync-from-sales-import（廃止）、sync-and-generate-merge-candidates（廃止）

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
