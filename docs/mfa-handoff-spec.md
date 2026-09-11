# MFA仕様・開発引継ぎ資料

最終確認日: 2026-07-21

## 1. この資料の位置づけ

本資料は、KPI Dashboard の現行MFA実装を他の開発者へ引き継ぐための正本仕様です。実装と内容が食い違う場合は、まず現行コードとSupabase Authの設定を確認し、本資料も同じ変更で更新してください。

`docs/mfa-deferred-implementation.md` は2026-06-12にMFAを一時停止した時点の履歴資料です。現在の動作仕様ではありません。

## 2. 採用方式

- 認証基盤: Supabase Auth
- 第1要素: メールアドレスとパスワード
- 第2要素: TOTP
- 想定認証アプリ: Google Authenticator
- MFA適用範囲: アプリの全保護ルート、および原則として全認証必須API
- MFA登録前のユーザー: MFA設定画面へ強制遷移
- MFA登録済み・未確認のユーザー: MFA確認画面へ強制遷移
- MFA確認済みの判定: Supabaseセッションが `aal2` であり、かつアプリ独自の再確認期限内であること
- 再確認間隔: MFA確認時点からランダムな3〜7日後

## 3. 用語と状態

| 状態 | 判定 | 動作 |
|---|---|---|
| 未ログイン | Supabaseセッションなし | `/login` へ遷移 |
| MFA未登録 | 検証済みTOTP factorなし | `/mfa/setup` へ遷移 |
| MFA登録済み・未確認 | TOTP factorあり、AALが`aal1` | `/mfa/verify` へ遷移 |
| 再確認期限切れ | `mfa_reverify_after` が現在以前、欠損、または不正値 | `/mfa/verify` へ遷移 |
| MFA確認済み | AALが`aal2`かつ再確認期限内 | 保護画面/APIを利用可能 |

`aal1` はパスワード認証まで、`aal2` はTOTP確認まで完了したSupabaseのAuthenticator Assurance Levelです。

## 4. 画面遷移

### 通常ログイン

1. `/login` でメールアドレスとパスワードを送信する。
2. `AuthContext` がSupabaseセッション、プロフィール、AAL、TOTP factorを取得する。
3. TOTP factorがなければ `/mfa/setup` へ進む。
4. factorがあり、AALが`aal2`でなければ `/mfa/verify` へ進む。
5. `aal2`でも `mfa_reverify_after` が期限切れなら `/mfa/verify` へ進む。
6. 確認済みなら、元の遷移先、または通常のホーム画面へ進む。

### 初回MFA登録

1. `supabase.auth.mfa.enroll({ factorType: 'totp' })` でTOTP factorを作成する。
2. PCではQRコード、スマートフォンではsecret keyをGoogle Authenticatorへ登録する。
3. ユーザーが6桁の数字を入力する。クライアント側でも `/^\d{6}$/` を検査する。
4. `challenge()` と `verify()` でコードを検証する。
5. セッションを更新して`aal2`を反映する。
6. `POST /api/auth/mfa` へ `record-verification` を送り、確認日時と次回期限を保存する。
7. MFA状態を再取得し、元の画面へ戻る。

未検証factorが残っている場合は最新のものを再利用します。設定キーの再発行時は、その未検証factorを削除して新規登録します。

### 登録済みユーザーのMFA確認

1. `listFactors()` から検証済みTOTP factorを取得する。
2. 6桁コードを `challengeAndVerify()` で検証する。
3. セッション更新、確認日時の記録、MFA状態の再取得を行う。
4. 保存していた遷移先へ戻る。

## 5. フロントエンドの強制制御

`src/App.tsx` の `ProtectedRoute` が、ログイン、factor登録、MFA確認を順番に検査します。保護対象はダッシュボード、商談、CRM、顧客統合などの業務画面です。

`AuthContext` が以下を保持します。

```ts
type MfaStatus = {
  currentLevel: 'aal1' | 'aal2' | null;
  nextLevel: 'aal1' | 'aal2' | null;
  isEnrolled: boolean;
  isVerified: boolean;
  isReverificationRequired: boolean;
  verifiedAt: string | null;
  reverifyAfter: string | null;
};
```

MFA状態取得に失敗した場合はfail-closedとして、未登録・未確認・再確認必要の状態を返します。

## 6. APIの強制制御

APIは `Authorization: Bearer <Supabase access token>` を受け取り、`requireAuthenticatedProfile()` で次を検査します。

1. Bearer tokenが存在すること。
2. `supabase.auth.getUser(accessToken)` でtokenが有効であること。
3. 対応する`profiles`行が存在すること。
4. tokenのAALが`aal2`であること。
5. `mfa_reverify_after` が期限内であること。

主なレスポンスは次のとおりです。

| HTTP | code | 意味 |
|---|---|---|
| 401 | なし | tokenなし、または無効token |
| 403 | なし | profileなし、または権限なし |
| 403 | `MFA_REQUIRED` | AALが`aal2`ではない |
| 403 | `MFA_REVERIFY_REQUIRED` | アプリ独自の再確認期限切れ |

`authFetch()` はMFA関連の403を受けると、現在のパスを`sessionStorage`へ保存し、`/mfa/verify`へ遷移します。

例外として、MFAの確認記録API自身は期限切れ状態でも呼べる必要があるため、`allowMfaReverifyExpired: true`を指定します。MFA完了前に許可するAPIを追加する場合は、用途と脅威をレビューして例外を最小限にしてください。

## 7. データ仕様

`public.profiles` に以下を保持します。

| カラム | 型 | 内容 |
|---|---|---|
| `mfa_verified_at` | `timestamptz` | アプリが最後にMFA確認を記録した日時 |
| `mfa_reverify_after` | `timestamptz` | 次回MFA確認が必要になる日時 |

TOTPのsecretやfactor本体はアプリDBへ保存せず、Supabase Authが管理します。クライアントへ返されたsecretは登録画面でのみ扱い、ログへ出力しないでください。

確認成功時、サーバーは現在時刻を `mfa_verified_at` に、現在からランダムな3〜7日後を `mfa_reverify_after` に保存します。その後、API認証キャッシュを破棄します。

## 8. リダイレクト仕様

- React Routerの `location.state.from` を第一候補に使う。
- APIの403を起点とする場合は `sessionStorage.mfaRedirectPath` を使う。
- MFA成功時に保存値を読み出して削除する。
- 遷移先がない場合、モバイルは `/deals/new`、それ以外は通常 `/dashboard` を使う。

新しいリダイレクト入力を追加する場合は、外部URLへ遷移できないよう、アプリ内の相対パスだけを許可してください。

## 9. 関連ファイル一覧

### 仕様・利用資料

| ファイル | 役割 |
|---|---|
| `docs/mfa-handoff-spec.md` | 本資料。現行MFA仕様の正本 |
| `security_requirements_matrix.md` | システム全体のセキュリティ検討基準 |
| `output/pdf/mfa_google_authenticator_manual.pdf` | 利用者向けGoogle Authenticator設定手順 |
| `output/pdf/mfa_google_authenticator_manual.html` | 上記マニュアルのHTML版 |
| `docs/mfa-deferred-implementation.md` | MFA一時停止時の履歴。現行仕様ではない |

### フロントエンド

| ファイル | 役割 |
|---|---|
| `src/App.tsx` | 保護ルート、MFA設定・確認画面への強制遷移 |
| `src/contexts/AuthContext.tsx` | セッション、プロフィール、AAL、factor、再確認期限の統合状態管理 |
| `src/pages/Login.tsx` | パスワードログイン |
| `src/pages/MfaSetup.tsx` | TOTP登録、QR/secret表示、初回コード確認、キー再発行 |
| `src/pages/MfaVerify.tsx` | 登録済みfactorのコード確認 |
| `src/lib/mfaVerification.ts` | MFA成功日時をAPIへ記録 |
| `src/lib/mfaReverification.ts` | 再確認期限判定とリダイレクト先の一時保存 |
| `src/lib/authFetch.ts` | Bearer token付与とMFA 403の処理 |
| `src/lib/supabase.ts` | ブラウザ側Supabase Authクライアント |
| `src/pages/ResetPassword.tsx` | パスワード回復セッション。MFAとの組み合わせに注意 |
| `src/types.ts` | ユーザーのMFA日時フィールド |

### サーバー・DB

| ファイル | 役割 |
|---|---|
| `api/_lib/auth.ts` | token検証、profile取得、AAL・再確認期限のAPI共通検査 |
| `api/auth/mfa.ts` | 確認日時・次回期限の保存 |
| `api/_lib/mfaReverification.ts` | サーバー側の3〜7日ルール |
| `src/lib/supabaseAdmin.ts` | service roleを使うサーバー専用DBクライアント |
| `supabase/migrations/20260701090000_add_mfa_reverification_schedule.sql` | MFA日時カラムの追加と既存profileの初期化 |
| `.env.example` | Supabase URL/keyの変数名一覧。秘密値は含めない |

## 10. 環境・運用要件

- SupabaseプロジェクトでTOTP MFAが利用可能であること。
- `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` がブラウザ環境に設定されていること。
- `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` がサーバー環境に設定されていること。
- service role keyをブラウザ、ソースコード、利用者向け資料へ出さないこと。
- 本番はHTTPSで提供すること。Clipboard APIなど一部機能もsecure contextを前提とする。
- Supabase Auth側のJWT・セッション有効期限も、アプリの3〜7日再確認ルールと併せて管理すること。
- factor紛失時の本人確認、factor解除、アカウント復旧は管理者運用として別途定めること。

## 11. 開発・受入確認

### 自動確認

```bash
npm run build
```

リポジトリにMFA専用の自動テストは現在ありません。変更時は以下の手動確認も実施してください。

### 手動確認項目

1. 未ログインで保護URLを開くとログイン画面へ移る。
2. 新規ユーザーがログインするとMFA設定画面へ移る。
3. QRコードとsecret keyの両方でGoogle Authenticatorへ登録できる。
4. 数字以外、5桁、7桁、不正な6桁コードが拒否される。
5. 正しいコードで登録が完了し、元の画面へ戻る。
6. ログアウト後の再ログインでMFA確認画面が表示される。
7. 正しいコードの後、API tokenのAALが`aal2`になる。
8. `mfa_verified_at`と`mfa_reverify_after`が更新される。
9. 期限を過去に変更すると、画面とAPIの両方で再確認が要求される。
10. APIへtokenなし、`aal1` token、期限切れprofileでアクセスし、それぞれ401/403になる。
11. 未検証factorが残った状態で設定画面を再表示し、設定継続と再発行が動く。
12. パスワード再設定後のセッションとMFA遷移が正しく動く。
13. PCとiPhone/Androidの両方で設定・確認する。

## 12. 既知の注意点・今後の改善候補

### 優先度高

- `api/_lib/auth.ts` の同一tokenに対する並行profile取得では、`inFlight`を待つ分岐が通常分岐と同じMFA期限検査を行わず、そのままprofileを返します。並行リクエスト時にも必ず共通のMFA検査を通すよう修正し、回帰テストを追加する候補です。
- `src/lib/mfaReverification.ts` と `api/_lib/mfaReverification.ts` に同じ3〜7日ルールが重複しています。片側だけ変更すると不整合になるため、共有可能な定数・ロジックへの集約を検討してください。
- リダイレクト先は現在文字列として保存・利用されます。将来外部入力が混ざる場合に備え、`/`で始まるアプリ内相対パスだけを許可する検証を追加してください。

### 運用判断が必要

- factorを失ったユーザーの復旧手順と、管理者によるfactor解除時の本人確認基準がコード内にありません。
- パスワード再設定でSupabaseがAAL2を要求した場合、現在の画面文言には「MFAを一時停止中」と表示されます。現行仕様に合わせた文言と回復フローへの更新が必要です。
- MFA成功・失敗、factor登録・解除について、アプリ独自の監査ログとアラートは確認できません。Supabase Authログの保管・監視方針を決めてください。
- 総当たり対策はSupabase Authおよび配信基盤側のレート制限設定も確認してください。
- 複数の検証済みTOTP factorがある場合、確認画面は先頭のfactorを使用します。複数factorを正式対応するか、1ユーザー1factorに制限するか決定してください。

## 13. 変更時のルール

- MFAを迂回できるAPIオプションを追加する場合は、理由と対象APIを本資料へ記録する。
- 再確認日数を変更するときは、クライアント、サーバー、DB初期化、利用者案内を同時に更新する。
- Supabase Authの設定変更はコードレビューだけでは追跡できないため、変更日・担当者・変更内容を運用記録へ残す。
- TOTP secret、access token、service role keyをログ、スクリーンショット、Issue、チャットへ貼らない。
- MFA関連の変更後は、画面側だけでなくAPIの401/403も確認する。
