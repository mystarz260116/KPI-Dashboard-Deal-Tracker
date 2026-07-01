# api/clinic.ts

## 対応元ファイル

`api/clinic.ts`

## 役割

医院詳細画面向けAPIです。

## 主な仕様

- 顧客またはprospectの基本情報、商談履歴、コメント、リアクション、売上明細を取得します。
- URL上の医院種別とIDを元に表示対象を切り替えます。

## コードから読み取れる手がかり

- 主な依存: @vercel/node、../src/lib/supabaseAdmin.js、../src/lib/customerCode.js、./_lib/auth.js
- 主な公開要素: handler

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
