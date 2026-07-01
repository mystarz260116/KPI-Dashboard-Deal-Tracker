# vercel.json

## 対応元ファイル

`vercel.json`

## 役割

Vercel上のルーティング、SPA fallback、Cronを定義します。

## 主な仕様

- `/api/...` を各Functionへrewriteします。
- 画面URLは`index.html`へ戻してReact Routerに処理させます。
- 通知クリーンアップなど定期処理のスケジュールを定義します。

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
