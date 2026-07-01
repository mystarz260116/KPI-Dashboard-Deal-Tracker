# api/kpi.ts

## 対応元ファイル

`api/kpi.ts`

## 役割

KPI・売上分析・新規受注関連APIのルーターです。

## 主な仕様

- ダッシュボード表示に必要な集計系エンドポイントを提供します。
- 部署・担当者・期間などの条件をサーバーハンドラーへ渡します。

## コードから読み取れる手がかり

- 主な依存: ../src/lib/supabaseAdmin.js、./_lib/auth.js、./_lib/newOrderDates.js、./_lib/existingDealWins.js、../src/server-handlers/kpi/new-orders.js、../src/server-handlers/kpi/sales-performance.js、../src/server-handlers/kpi/clinic-assets.js、../src/server-handlers/kpi/detected-new-order.js
- 主な公開要素: handler
- サブルート: new-orders、sales-performance、clinic-assets、detected-new-order

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
