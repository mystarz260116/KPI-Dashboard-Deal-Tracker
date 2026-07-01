# 自然言語仕様ツリー

このディレクトリは、現在のアプリのファイル構造を保ったまま、各ファイルの機能と仕様を自然言語で説明するためのミラーです。

- 対応元ファイルと同じパスに `.md` を付けた説明ファイルを置いています。
- 実装ファイルは変更していません。
- 大きな仕様変更やファイル追加をした場合は、このディレクトリも同じ構造で更新してください。

## 全体像

このアプリは、株式会社マイ・スターズ向けの営業KPI管理・商談管理システムです。React/Viteの画面、Vercel FunctionsのAPI、Supabase/PostgresのDB変更、売上インポートや外部同期の補助スクリプトで構成されています。

## 主要な責務

- `src/pages/`: ユーザーが操作する画面です。ログイン、MFA、ダッシュボード、商談、CRM、医院詳細、顧客マージを扱います。
- `api/`: Vercel Functionsの入口です。認証、ルーティング、レスポンス返却を担当します。
- `src/server-handlers/`: APIから呼ばれる業務ロジックです。DB読み書き、集計、インポート、マージ処理を担当します。
- `src/lib/` と `api/_lib/`: 認証、Supabase、日付、MFA、売上取込などの共通処理です。
- `supabase/migrations/`: DBスキーマ・RLS・RPC・データ補正の変更履歴です。
- `scripts/`: ローカル開発、同期、デバッグ、補正を支える運用スクリプトです。

## ファイルツリー

```text
├── .env.example.md
├── api
│   ├── _lib
│   │   ├── auth.ts.md
│   │   ├── existingDealWins.ts.md
│   │   ├── mfaReverification.ts.md
│   │   ├── newOrderDates.ts.md
│   │   ├── profileExternalStaff.ts.md
│   │   ├── regionalReads.ts.md
│   │   ├── regions.ts.md
│   │   ├── salesImport.ts.md
│   │   └── salesImportMonthClosures.ts.md
│   ├── auth
│   │   ├── mfa.ts.md
│   │   └── register.ts.md
│   ├── clinic.ts.md
│   ├── customers.ts.md
│   ├── deals.ts.md
│   ├── departments.ts.md
│   ├── import.ts.md
│   ├── kpi.ts.md
│   ├── merge.ts.md
│   └── users.ts.md
├── db_dump.sql.md
├── docs
│   ├── ireba-external-api.md.md
│   └── mfa-deferred-implementation.md.md
├── index.html.md
├── metadata.json.md
├── output
│   └── pdf
│       ├── assets
│       │   ├── google-authenticator-icon.jpg.md
│       │   ├── google-authenticator-key-form.jpg.md
│       │   ├── google-authenticator-list.jpg.md
│       │   └── google-authenticator-menu.jpg.md
│       ├── mfa_google_authenticator_manual.html.md
│       ├── mfa_google_authenticator_manual.pdf.md
│       ├── mfa_manual_preview_full.png.md
│       └── mfa_manual_preview.png.md
├── package-lock.json.md
├── package.json.md
├── public
│   └── favicon.svg.md
├── README.md.md
├── schema.sql.md
├── scripts
│   ├── debug-sales-upload.mjs.md
│   ├── local-api-server.ts.md
│   ├── local-dev.ts.md
│   └── sync-profile-external-staff-maps.ts.md
├── security_requirements_matrix.md.md
├── seed.sql.md
├── src
│   ├── App.tsx.md
│   ├── assets
│   │   ├── M.png.md
│   │   └── Mystarz-logo.png.md
│   ├── contexts
│   │   └── AuthContext.tsx.md
│   ├── index.css.md
│   ├── lib
│   │   ├── authFetch.ts.md
│   │   ├── customerCode.ts.md
│   │   ├── dateUtils.ts.md
│   │   ├── mergeUtils.ts.md
│   │   ├── mfaReverification.ts.md
│   │   ├── mfaVerification.ts.md
│   │   ├── perf.ts.md
│   │   ├── supabase.ts.md
│   │   └── supabaseAdmin.ts.md
│   ├── main.tsx.md
│   ├── pages
│   │   ├── ClinicAssetsDashboard.tsx.md
│   │   ├── ClinicDetail.tsx.md
│   │   ├── CrmSearch.tsx.md
│   │   ├── CustomerMerge.tsx.md
│   │   ├── Dashboard.tsx.md
│   │   ├── DealHistory.tsx.md
│   │   ├── DealInput.tsx.md
│   │   ├── DealProgressDashboard.tsx.md
│   │   ├── ForgotPassword.tsx.md
│   │   ├── Login.tsx.md
│   │   ├── MfaSetup.tsx.md
│   │   ├── MfaVerify.tsx.md
│   │   ├── ResetPassword.tsx.md
│   │   ├── SalesPerformanceDashboard.tsx.md
│   │   └── Signup.tsx.md
│   ├── server-handlers
│   │   ├── customers
│   │   │   ├── sync-and-generate-merge-candidates.ts.md
│   │   │   └── sync-from-sales-import.ts.md
│   │   ├── deals
│   │   │   ├── board.ts.md
│   │   │   ├── close-month.ts.md
│   │   │   ├── comments.ts.md
│   │   │   ├── notifications-cleanup.ts.md
│   │   │   ├── notifications.ts.md
│   │   │   ├── reactions.ts.md
│   │   │   ├── status.ts.md
│   │   │   └── view.ts.md
│   │   ├── import-product-categories
│   │   │   └── upsert.ts.md
│   │   ├── import-sales
│   │   │   ├── close-month.ts.md
│   │   │   ├── finalize.ts.md
│   │   │   ├── month-closures.ts.md
│   │   │   └── upload.ts.md
│   │   ├── kpi
│   │   │   ├── clinic-assets.ts.md
│   │   │   ├── detected-new-order.ts.md
│   │   │   ├── new-orders.ts.md
│   │   │   └── sales-performance.ts.md
│   │   └── merge
│   │       ├── candidates-count.ts.md
│   │       ├── candidates.ts.md
│   │       ├── confirm.ts.md
│   │       ├── detected-new-orders.ts.md
│   │       ├── generate-candidates.ts.md
│   │       └── reject.ts.md
│   ├── types.ts.md
│   └── vite-env.d.ts.md
├── supabase
│   ├── functions
│   │   └── ireba-sync
│   │       └── index.ts.md
│   └── migrations
│       ├── 20260409054631_remote_schema.sql.md
│       ├── 20260409054640_rls_policies.sql.md
│       ├── 20260421195000_external_staffs_department_id.sql.md
│       ├── 20260422070151_split_sales_raw_and_external_staffs_by_region.sql.md
│       ├── 20260422070507_auto_sync_regional_external_staffs.sql.md
│       ├── 20260422072552_add_import_region_and_timestamp.sql.md
│       ├── 20260422093000_sum_sales_import_rows_amount.sql.md
│       ├── 20260422110000_split_business_tables_by_region.sql.md
│       ├── 20260422114500_drop_shared_sales_import_tables.sql.md
│       ├── 20260422122000_drop_shared_sales_views.sql.md
│       ├── 20260422125500_profile_external_staff_maps_regional_indexes.sql.md
│       ├── 20260422133000_fix_auth_signup_profile_trigger.sql.md
│       ├── 20260422134500_reset_auth_user_triggers.sql.md
│       ├── 20260422140000_disable_auth_user_profile_trigger.sql.md
│       ├── 20260422142000_disable_legacy_profile_triggers.sql.md
│       ├── 20260422150000_restore_shared_deals_drop_regional.sql.md
│       ├── 20260423090000_unify_sales_region_tables.sql.md
│       ├── 20260423091000_drop_legacy_regional_tables.sql.md
│       ├── 20260423092000_use_department_id_for_sales_import.sql.md
│       ├── 20260423093000_drop_sales_region_columns.sql.md
│       ├── 20260423100000_sync_sales_import_batch_rpc.sql.md
│       ├── 20260423101000_fix_sync_sales_import_batch_customer_dedupe.sql.md
│       ├── 20260423102000_disable_timeout_for_sales_import_batch_sync.sql.md
│       ├── 20260423113000_add_deal_analysis_fields.sql.md
│       ├── 20260428000000_add_deal_proposal_categories.sql.md
│       ├── 20260428160000_add_deal_pipeline_stage.sql.md
│       ├── 20260428163000_expand_deal_pipeline_stage.sql.md
│       ├── 20260428170000_create_deal_board_month_closures.sql.md
│       ├── 20260428173000_create_deal_board_states.sql.md
│       ├── 20260428180000_add_deal_executed_action_type.sql.md
│       ├── 20260428183000_expand_deal_board_states_for_won.sql.md
│       ├── 20260509013000_allow_admin_read_all_deals.sql.md
│       ├── 20260509014500_link_budgets_to_external_staffs.sql.md
│       ├── 20260509015500_drop_budgets_user_id.sql.md
│       ├── 20260509020500_restore_budgets_user_id.sql.md
│       ├── 20260509023000_add_sum_sales_import_raw_rows_amount.sql.md
│       ├── 20260511123000_optimize_sales_import_raw_rows_for_kpi.sql.md
│       ├── 20260513093000_add_kpi_column_to_budgets.sql.md
│       ├── 20260519112000_create_sales_import_month_closures.sql.md
│       ├── 20260521090000_filter_sales_import_rows_to_tech_only.sql.md
│       ├── 20260528100000_add_usage_tracking.sql.md
│       ├── 20260528113000_create_deal_comments.sql.md
│       ├── 20260528121500_create_deal_reactions.sql.md
│       ├── 20260528133000_add_product_category_master_and_sales_row_product_fields.sql.md
│       ├── 20260528134500_add_department_id_to_product_category_masters.sql.md
│       ├── 20260528143000_create_product_department_budgets.sql.md
│       ├── 20260528150000_add_product_departments_and_links.sql.md
│       ├── 20260529093000_apply_rls_to_usage_interactions_and_product_tables.sql.md
│       ├── 20260602090000_create_deal_comment_notifications.sql.md
│       ├── 20260603090000_backfill_merged_prospect_deal_customer_codes.sql.md
│       ├── 20260603100000_add_accepted_pipeline_stage.sql.md
│       ├── 20260603110000_add_deal_expected_monthly_amounts.sql.md
│       ├── 20260604090000_add_order_import_data_kind.sql.md
│       ├── 20260608030000_add_budget_kpi_goal_columns.sql.md
│       ├── 20260608031000_drop_legacy_budget_kpi_column.sql.md
│       ├── 20260608032000_allow_decimal_budget_kpi_closure.sql.md
│       ├── 20260608033000_allow_decimal_budget_kpi_visit.sql.md
│       ├── 20260608034000_rename_budget_kpi_columns_to_csv_names.sql.md
│       ├── 20260610090000_create_ireba_external_sync_tables.sql.md
│       ├── 20260610163000_create_dashboard_sales_import_aggregates.sql.md
│       ├── 20260610164500_create_clinic_asset_sales_aggregates.sql.md
│       ├── 20260610170000_optimize_clinic_asset_sales_aggregates.sql.md
│       ├── 20260610170500_add_clinic_asset_sales_indexes.sql.md
│       ├── 20260610172000_create_clinic_asset_actions.sql.md
│       ├── 20260610173000_rename_clinic_asset_actions_to_cares.sql.md
│       ├── 20260612090000_rename_ireba_sync_columns_to_japanese_keys.sql.md
│       ├── 20260612160000_create_detected_new_orders.sql.md
│       ├── 20260612163500_mark_detected_new_order_deals_won.sql.md
│       ├── 20260612165000_optimize_sales_asset_and_detected_order_queries.sql.md
│       ├── 20260615090000_create_ireba_sync_api_logs.sql.md
│       ├── 20260616140000_normalize_customer_code_labels.sql.md
│       ├── 20260616143000_redact_patient_name_at_storage_boundary.sql.md
│       ├── 20260617030000_add_clinic_asset_sales_aggregates_json.sql.md
│       ├── 20260617033000_add_dashboard_sales_import_aggregates_json.sql.md
│       ├── 20260617034500_include_product_name_in_dashboard_sales_json.sql.md
│       ├── 20260630120000_repair_polluted_customer_codes.sql.md
│       ├── 20260630121000_remove_stale_june_delivery_batch.sql.md
│       └── 20260701090000_add_mfa_reverification_schedule.sql.md
├── templates
│   └── product_department_budgets_template.csv.md
├── tsconfig.json.md
├── vercel.json.md
└── vite.config.ts.md
```
