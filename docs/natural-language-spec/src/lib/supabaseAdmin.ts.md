# src/lib/supabaseAdmin.ts

## 対応元ファイル

`src/lib/supabaseAdmin.ts`

## 役割

API・サーバー処理用のSupabase管理クライアントを作成します。

## 主な仕様

- service role key前提のため、ブラウザへ露出させません。
- RLSを越えた同期、集計、管理処理で使います。

## コードから読み取れる手がかり

- 主な依存: @supabase/supabase-js
- 主な公開要素: supabaseAdmin

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
