# src/contexts/AuthContext.tsx

## 対応元ファイル

`src/contexts/AuthContext.tsx`

## 役割

ログイン状態、プロフィール、権限、MFA状態を画面全体へ配るReact Contextです。

## 主な仕様

- Supabase Authのセッションを監視します。
- API利用に必要なユーザー属性と権限を取得します。
- MFA登録・検証状態を画面遷移の判断材料として提供します。

## コードから読み取れる手がかり

- 主な依存: react、../lib/supabase、@supabase/supabase-js、../types、../lib/perf、../lib/authFetch、../lib/mfaReverification
- 主な公開要素: useAuth、AuthProvider

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
