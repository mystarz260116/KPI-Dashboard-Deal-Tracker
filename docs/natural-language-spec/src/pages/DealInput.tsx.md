# src/pages/DealInput.tsx

## 対応元ファイル

`src/pages/DealInput.tsx`

## 役割

新規商談を入力する画面です。

## 主な仕様

- 医院検索、prospect作成、提案カテゴリ、パイプライン初期値、カテゴリ別予定額を登録します。
- 商談登録後は履歴や進捗ボードへ反映されます。

## コードから読み取れる手がかり

- 主な依存: ../lib/supabase、react、react-router-dom、../contexts/AuthContext、../lib/dateUtils、../lib/authFetch、../lib/customerCode、motion/react
- 主な公開要素: DealInput

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
