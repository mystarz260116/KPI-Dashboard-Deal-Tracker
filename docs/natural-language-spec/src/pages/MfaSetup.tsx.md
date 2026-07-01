# src/pages/MfaSetup.tsx

## 対応元ファイル

`src/pages/MfaSetup.tsx`

## 役割

MFA/TOTPを初回登録する画面です。

## 主な仕様

- QRコードまたは秘密鍵を認証アプリへ登録させます。
- 確認コード検証後にアプリ利用を許可します。

## コードから読み取れる手がかり

- 主な依存: react、react-router-dom、lucide-react、../lib/supabase、../contexts/AuthContext、../lib/mfaReverification、../lib/mfaVerification、../assets/Mystarz-logo.png
- 主な公開要素: MfaSetup

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
