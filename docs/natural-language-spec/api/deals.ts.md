# api/deals.ts

## 対応元ファイル

`api/deals.ts`

## 役割

商談関連APIのルーターです。

## 主な仕様

- `board`、`status`、`comments`、`notifications`、`reactions`、`view` などのサブルートを対応するサーバーハンドラーへ振り分けます。
- Vercel rewriteの`path`クエリと通常のURLパスの両方を解釈します。

## コードから読み取れる手がかり

- 主な依存: @vercel/node、../src/server-handlers/deals/board.js、../src/server-handlers/deals/close-month.js、../src/server-handlers/deals/comments.js、../src/server-handlers/deals/notifications-cleanup.js、../src/server-handlers/deals/notifications.js、../src/server-handlers/deals/reactions.js、../src/server-handlers/deals/status.js
- 主な公開要素: handler
- サブルート: board、status、close-month、comments、notifications、notifications-cleanup、reactions、view

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
