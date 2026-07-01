# src/server-handlers/kpi/clinic-assets.ts

## 対応元ファイル

`src/server-handlers/kpi/clinic-assets.ts`

## 役割

KPI・売上分析ドメインのサーバーハンドラーです。

## 主な仕様

- ダッシュボードや分析画面で使う集計結果を生成します。
- 売上取込データ、商談、顧客、担当者、部署などを横断して読み取ります。

## コードから読み取れる手がかり

- 主な依存: ../../lib/supabaseAdmin.js、../../lib/dateUtils.js、../../../api/_lib/auth.js、../../../api/_lib/regionalReads.js
- 主な公開要素: handler

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
