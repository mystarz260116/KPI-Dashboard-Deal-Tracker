# api/auth/register.ts

## 対応元ファイル

`api/auth/register.ts`

## 役割

サインアップ後のプロフィール作成APIです。

## 主な仕様

- Supabase Authのユーザーに業務アプリ側の部署・権限情報を紐づけます。

## コードから読み取れる手がかり

- 主な依存: @vercel/node、../../src/lib/supabaseAdmin.js
- 主な公開要素: handler

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
