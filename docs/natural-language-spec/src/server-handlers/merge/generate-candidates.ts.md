# src/server-handlers/merge/generate-candidates.ts

## 対応元ファイル

`src/server-handlers/merge/generate-candidates.ts`

## 役割

顧客・prospectマージ処理のサーバーハンドラーです。

## 主な仕様

- 重複候補の生成・取得・確定・却下を担当します。
- 統合後に商談や売上との紐づきが壊れないようにDBを更新します。

## コードから読み取れる手がかり

- 主な依存: ../../lib/supabaseAdmin.js、../../lib/mergeUtils.js、../../../api/_lib/auth.js
- 主な公開要素: handler

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
