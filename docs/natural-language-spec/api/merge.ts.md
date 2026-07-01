# api/merge.ts

## 対応元ファイル

`api/merge.ts`

## 役割

顧客・prospectマージ関連APIのルーターです。

## 主な仕様

- 候補生成、候補一覧、件数取得、統合確定、却下を扱います。
- 重複医院の整理を管理画面から実行できるようにします。

## コードから読み取れる手がかり

- 主な依存: @vercel/node、../src/server-handlers/merge/candidates.js、../src/server-handlers/merge/candidates-count.js、../src/server-handlers/merge/confirm.js、../src/server-handlers/merge/generate-candidates.js、../src/server-handlers/merge/reject.js
- 主な公開要素: handler
- サブルート: candidates、candidates/count、confirm、generate-candidates、reject

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
