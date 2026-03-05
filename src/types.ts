// types.ts

// ============================================
// ユーザー・認証
// ============================================

export type UserRole = 'sales' | 'manager' | 'admin';

export interface User {
  id: string;           // SupabaseはUUID（文字列）
  email: string;
  name: string;
  department: string;
  role: UserRole;       // 営業 / 上長 / 管理者
}

// ============================================
// 取引先（医院）
// ============================================

export interface Clinic {
  id: string;           // SupabaseはUUID（文字列）
  name: string;
  irebakun_id?: string; // 将来：いればくんとのマッピング用（未定）
}

// ============================================
// 商談（Deal）
// ============================================

export interface Deal {
  id: string;
  clinic_id: string;        // 取引先ID
  clinic_name?: string;     // 表示用（APIが返す場合）
  assigned_to: string;      // 担当者のユーザーID
  assigned_name?: string;   // 表示用（APIが返す場合）
  date: string;             // ISO形式 "2026-03-03"
  status: DealStatus;
  amount?: number;          // 金額（確定後に入る想定）
  notes?: string;           // 内容・メモ
  next_action?: string;     // 次アクション
  created_at?: string;
  updated_at?: string;
}

export type DealStatus =
  | 'proposal'   // 提案
  | 'negotiating'// 商談中
  | 'won'        // 受注
  | 'lost';      // 失注

// ============================================
// ダッシュボード：フィルター
// ============================================

export type Period = 'day' | 'week' | 'month';
export type Granularity = 'all' | 'department' | 'individual';
// ※旧: 'global' → 'all' に変更（仕様書に合わせた）

export interface DashboardFilter {
  period: Period;
  from: string;         // ISO形式 "2026-03-01"
  to: string;           // ISO形式 "2026-03-31"
  granularity: Granularity;
  department_id?: string; // granularity==='department'のとき使用
  user_id?: string;       // granularity==='individual'のとき使用
}

// ============================================
// ダッシュボード：KPIパネルデータ
// ============================================

// ①予算達成率
export interface BudgetPanel {
  sales: number;          // 売上金額
  budget: number;         // 予算
  achievement_rate: number; // 達成率（%）= sales / budget * 100
}

// ②売上合計
export interface SalesPanel {
  sales: number;          // 今期の売上
  prev_sales: number;     // 前期間の売上
  change_rate: number;    // 前期間比（%）
}

// ③提案パイプライン
export interface PipelinePanel {
  proposal_count: number; // 提案件数
  won_count: number;      // 受注件数
  conversion_rate: number;// 転換率（%）= won / proposal * 100
}

// ④⑤ 営業別ランキング（提案数・受注数 共通型）
export interface RankingItem {
  name: string;           // 担当者名
  count: number;          // 件数
}

// ⑥既存vs新規
export interface SalesMixPanel {
  existing_sales: number; // 既存売上
  new_sales: number;      // 新規売上
  existing_rate: number;  // 既存構成比（%）
  new_rate: number;       // 新規構成比（%）
}

// 全パネルをまとめた型（APIレスポンス想定）
export interface KPIData {
  budget: BudgetPanel;
  sales: SalesPanel;
  pipeline: PipelinePanel;
  proposal_ranking: RankingItem[];
  won_ranking: RankingItem[];
  sales_mix: SalesMixPanel;
}


// ============================================
// 商品（品目）
// ============================================

export interface Product {
  id: string;
  name: string;           // 商品名
  unit_price: number;     // 単価（中央値：約6,000円）
}

// ============================================
// 行動KPI
// ============================================

export interface ActionKPI {
  user_id: string;
  date: string;           // ISO形式 "2026-03-04"
  visit_count: number;    // 訪問数
  call_count: number;     // 架電数
  proposal_count: number; // 提案（商談）数 ← 行動指標
  won_clinic_count: number;  // 受注医院数  ← 成果指標
  won_unit_count: number;    // 受注本数    ← 成果指標
  won_amount: number;        // 受注金額    ← 成果指標
}

// ============================================
// 転換率マスタ（北澤さん定義）
// ============================================

export type ApproachType =
  | 'visit'       // 訪問：転換率10%
  | 'referral'    // 紹介：転換率70%
  | 'inquiry';    // 引き合い（問い合わせ）：転換率70%

export interface ConversionRate {
  approach_type: ApproachType;
  rate: number;   // 例：visit=0.10, referral=0.70
}

