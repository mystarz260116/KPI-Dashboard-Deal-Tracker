# src/pages/Login.tsx

## 対応元ファイル

`src/pages/Login.tsx`

## 役割

ログイン画面です。

## 主な仕様

- メールアドレスとパスワードでSupabase Authへサインインします。
- ログイン済みユーザーはMFA状態と権限に応じて適切な画面へ遷移します。

## コードから読み取れる手がかり

- 主な依存: react、react-router-dom、../lib/supabase、motion/react、lucide-react、../assets/Mystarz-logo.png
- 主な公開要素: Login

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
