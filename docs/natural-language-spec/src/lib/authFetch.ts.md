# src/lib/authFetch.ts

## 対応元ファイル

`src/lib/authFetch.ts`

## 役割

フロントエンドからAPIへ認証付きリクエストを送る共通関数です。

## 主な仕様

- SupabaseのアクセストークンをAuthorizationヘッダーへ付与します。
- ローカル開発と本番でAPIベースURLを吸収します。
- MFA再検証が必要なレスポンスを共通的に扱います。

## コードから読み取れる手がかり

- 主な依存: ./supabase、./mfaReverification
- 主な公開要素: authFetch

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
