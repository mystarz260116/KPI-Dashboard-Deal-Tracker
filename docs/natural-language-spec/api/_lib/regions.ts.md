# api/_lib/regions.ts

## 対応元ファイル

`api/_lib/regions.ts`

## 役割

API層の共通ヘルパーです。

## 主な仕様

- Vercel Functionsから共有される認証、地域・部署判定、売上取込、MFA再検証などの補助処理を提供します。

## コードから読み取れる手がかり

- 主な公開要素: SALES_IMPORT_RAW_TABLE、CUSTOMERS_TABLE、SALES_IMPORT_ROWS_TABLE、CUSTOMER_STAFF_MAP_TABLE、parseDepartmentId、normalizeRawDate、extractCodePrefix、parseRawAmount

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
