# src/server-handlers/deals/board.ts

## 対応元ファイル

`src/server-handlers/deals/board.ts`

## 役割

商談ドメインのサーバーハンドラーです。

## 主な仕様

- API入口から呼ばれ、商談ボード・履歴・コメント・通知・ステータスなどの業務処理を実行します。
- 認証済みユーザー、部署、担当者、月などの条件に応じてSupabaseへ読み書きします。

## コードから読み取れる手がかり

- 主な依存: @vercel/node、../../lib/supabaseAdmin.js、../../../api/_lib/auth.js、../../../api/_lib/newOrderDates.js、../../lib/dateUtils.js
- 主な公開要素: handler

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
