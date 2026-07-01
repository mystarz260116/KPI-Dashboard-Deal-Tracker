# src/pages/Dashboard.tsx

## 対応元ファイル

`src/pages/Dashboard.tsx`

## 役割

営業KPIのメインダッシュボードです。

## 主な仕様

- 売上実績、KPI、インポート状況、新規受注先、通知、マージ候補などを集約します。
- 部署・担当者・期間の条件で表示内容を切り替えます。

## コードから読み取れる手がかり

- 主な依存: react、react-router-dom、../contexts/AuthContext、../types、../lib/dateUtils、../lib/authFetch、../lib/perf、motion/react
- 主な公開要素: Dashboard

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
