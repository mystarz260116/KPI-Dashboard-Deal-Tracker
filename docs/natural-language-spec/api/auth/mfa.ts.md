# api/auth/mfa.ts

## 対応元ファイル

`api/auth/mfa.ts`

## 役割

MFA登録・検証・再検証状態を扱う認証APIです。

## 主な仕様

- TOTP登録、チャレンジ、検証、必要に応じた再認証状態の更新に使います。

## コードから読み取れる手がかり

- 主な依存: @vercel/node、../../src/lib/supabaseAdmin.js、../_lib/auth.js、../_lib/mfaReverification.js
- 主な公開要素: handler

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
