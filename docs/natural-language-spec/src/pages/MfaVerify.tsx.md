# src/pages/MfaVerify.tsx

## 対応元ファイル

`src/pages/MfaVerify.tsx`

## 役割

ログイン後のMFAコード検証画面です。

## 主な仕様

- TOTPコードを検証し、保護画面へのアクセスを有効化します。
- 再検証が必要な場合にも利用されます。

## コードから読み取れる手がかり

- 主な依存: react、react-router-dom、lucide-react、../lib/supabase、../contexts/AuthContext、../lib/mfaReverification、../lib/mfaVerification、../assets/Mystarz-logo.png
- 主な公開要素: MfaVerify

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
