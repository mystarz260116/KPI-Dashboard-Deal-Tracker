# src/App.tsx

## 対応元ファイル

`src/App.tsx`

## 役割

アプリ全体のルーティングと認証ゲートを定義する入口です。

## 主な仕様

- 未ログインのユーザーはログイン画面へ誘導します。
- MFA未登録ならセットアップ、未検証なら検証画面へ誘導します。
- モバイル端末またはダッシュボード閲覧権限がないユーザーは商談入力を初期画面にします。

## コードから読み取れる手がかり

- 主な依存: react-router-dom、react、./contexts/AuthContext、./pages/Login、./pages/Signup、./pages/ForgotPassword、./pages/ResetPassword、./pages/MfaSetup
- 主な公開要素: App
- 画面ルート: /login、/signup、/forgot-password、/reset-password、/mfa/setup、/mfa/verify、/dashboard、/deals/new、/deals/history、/deals/progress、/sales-performance、/clinic-assets、/crm、/clinics/:kind/:clinicId、/customer-merge、/

## 運用メモ

- この説明は現在のファイル構造に合わせた自然言語版です。実装変更時は対応する説明も更新してください。
- 種別: テキストとして読めるファイル。
- TypeScript/Reactの型やAPI契約が変わる場合、呼び出し元とサーバーハンドラーの両方を確認してください。
