import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(supabaseUrl, supabaseKey);

type Period = "weekly" | "monthly" | "quarterly" | "yearly";
type Granularity = "all" | "department" | "individual";

function getPeriodRange(period: Period) {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "weekly") {
    const day = current.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(current.getFullYear(), current.getMonth(), current.getDate() + diffToMonday);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    const prevStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7);
    const prevEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    return { start, end, prevStart, prevEnd };
  }

  if (period === "yearly") {
    const start = new Date(current.getFullYear(), 0, 1);
    const end = new Date(current.getFullYear() + 1, 0, 1);
    const prevStart = new Date(current.getFullYear() - 1, 0, 1);
    const prevEnd = new Date(current.getFullYear(), 0, 1);
    return { start, end, prevStart, prevEnd };
  }

  if (period === "quarterly") {
    const quarterStartMonth = Math.floor(current.getMonth() / 3) * 3;
    const start = new Date(current.getFullYear(), quarterStartMonth, 1);
    const end = new Date(current.getFullYear(), quarterStartMonth + 3, 1);
    const prevStart = new Date(current.getFullYear(), quarterStartMonth - 3, 1);
    const prevEnd = new Date(current.getFullYear(), quarterStartMonth, 1);
    return { start, end, prevStart, prevEnd };
  }

  const start = new Date(current.getFullYear(), current.getMonth(), 1);
  const end = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  const prevStart = new Date(current.getFullYear(), current.getMonth() - 1, 1);
  const prevEnd = new Date(current.getFullYear(), current.getMonth(), 1);
  return { start, end, prevStart, prevEnd };
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toYearMonth(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}


function getYearMonthsBetween(start: Date, end: Date) {
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= endMonth) {
    months.push(toYearMonth(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  async function syncCustomerExternalStaffMaps() {
    const { data: salesRows, error: salesRowsError } = await supabase
      .from("sales_import_rows")
      .select("customer_code, external_staff_code")
      .not("customer_code", "is", null)
      .not("external_staff_code", "is", null);

    if (salesRowsError) {
      throw salesRowsError;
    }

    const uniqueMapRows = Array.from(
      new Map(
        (salesRows ?? [])
          .filter((row: any) => row.customer_code && row.external_staff_code)
          .map((row: any) => [
            `${String(row.customer_code)}::${String(row.external_staff_code)}`,
            {
              customer_code: String(row.customer_code),
              external_staff_code: String(row.external_staff_code),
            },
          ])
      ).values()
    );

    if (uniqueMapRows.length === 0) {
      return { upserted_count: 0 };
    }

    const { error: upsertError } = await supabase
      .from("customer_external_staff_maps")
      .upsert(uniqueMapRows, {
        onConflict: "customer_code,external_staff_code",
        ignoreDuplicates: false,
      });

    if (upsertError) {
      throw upsertError;
    }

    return { upserted_count: uniqueMapRows.length };
  }

  // Auth API
  app.post("/api/login", (_req, res) => {
    res.status(410).json({ error: "Login is handled by Supabase Auth in the frontend" });
  });

  app.post("/api/signup", (_req, res) => {
    res.status(410).json({ error: "Signup is handled by Supabase Auth in the frontend" });
  });

  // KPI API
  app.get("/api/kpi", async (req, res) => {
    try {
      const period = (req.query.period as Period | undefined) ?? "monthly";
      const granularity = (req.query.granularity as Granularity | undefined) ?? "all";
      const department = (req.query.department as string | undefined) ?? "";
      const userId = (req.query.userId as string | undefined) ?? "";

      const fromParam = req.query.from as string | undefined;
      const toParam = req.query.to as string | undefined;

      let start: Date;
      let end: Date;
      let prevStart: Date;
      let prevEnd: Date;

      if (fromParam && toParam) {
        start = new Date(fromParam);
        end = new Date(toParam);
        end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);

        // Previous period = same range one year earlier
        prevStart = new Date(start);
        prevStart.setFullYear(prevStart.getFullYear() - 1);

        prevEnd = new Date(end);
        prevEnd.setFullYear(prevEnd.getFullYear() - 1);
      } else {
        const range = getPeriodRange(period);
        start = range.start;
        end = range.end;
        prevStart = range.prevStart;
        prevEnd = range.prevEnd;
      }

      const currentStart = toDateString(start);
      const currentEnd = toDateString(end);
      const previousStart = toDateString(prevStart);
      const previousEnd = toDateString(prevEnd);

      const targetYearMonths = getYearMonthsBetween(start, end);

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, name, department_id, departments(name)")
        .order("name", { ascending: true });

      if (profilesError) {
        console.error("kpi profiles error:", profilesError);
        return res.status(500).json({ error: "kpi profiles fetch failed" });
      }

      const users = (profilesData ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        department_id: p.department_id,
        department: p.departments?.name ?? "",
      }));

      let filteredUsers = users;
      if (granularity === "department" && department) {
        filteredUsers = filteredUsers.filter((u) => u.department === department);
      }
      if (granularity === "individual" && userId) {
        filteredUsers = filteredUsers.filter((u) => u.id === userId);
      }

      const allowedUserIds = new Set(filteredUsers.map((u) => u.id));
      const allowedDepartmentIds = Array.from(new Set(filteredUsers.map((u) => u.department_id).filter(Boolean)));

      // Prospects created in the selected period
      const { data: createdProspects, error: createdProspectsError } = await supabase
        .from("prospect_customers")
        .select("id, status, merged_customer_code, merged_at, created_by, created_at")
        .gte("created_at", currentStart)
        .lt("created_at", currentEnd);

      if (createdProspectsError) {
        console.error("kpi prospects error:", createdProspectsError);
        return res.status(500).json({ error: "prospects fetch failed" });
      }

      // New orders confirmed in the selected period
      const { data: mergedProspectsInPeriod, error: mergedProspectsInPeriodError } = await supabase
        .from("prospect_customers")
        .select("id, name, created_by, merged_customer_code, merged_at, status")
        .eq("status", "merged")
        .not("merged_customer_code", "is", null)
        .gte("merged_at", currentStart)
        .lt("merged_at", currentEnd);

      if (mergedProspectsInPeriodError) {
        console.error("kpi merged prospects error:", mergedProspectsInPeriodError);
        return res.status(500).json({ error: "merged prospects fetch failed" });
      }

      const { data: profileStaffMaps, error: profileStaffMapsError } = await supabase
        .from("profile_external_staff_maps")
        .select("profile_id, external_staff_code");

      if (profileStaffMapsError) {
        console.error("kpi profile staff map error:", profileStaffMapsError);
        return res.status(500).json({ error: "profile staff map fetch failed" });
      }

      const filteredStaffMaps = (profileStaffMaps ?? []).filter((m: any) => allowedUserIds.has(m.profile_id));
      const allowedExternalStaffCodes = new Set(
        filteredStaffMaps.map((m: any) => String(m.external_staff_code))
      );
      const externalStaffCodeToUserId = new Map<string, string>();
      filteredStaffMaps.forEach((m: any) => {
        externalStaffCodeToUserId.set(String(m.external_staff_code), m.profile_id);
      });

      const { data: currentDeals, error: currentDealsError } = await supabase
        .from("deals")
        .select("id, user_id, customer_code, prospect_customer_id, deal_date, activity_type, amount, created_at, customers(name), prospect_customers(name)")
        .gte("deal_date", currentStart)
        .lt("deal_date", currentEnd);

      if (currentDealsError) {
        console.error("kpi current deals error:", currentDealsError);
        return res.status(500).json({ error: "current deals fetch failed" });
      }

      const { data: previousDeals, error: previousDealsError } = await supabase
        .from("deals")
        .select("id, user_id, deal_date, activity_type, amount")
        .gte("deal_date", previousStart)
        .lt("deal_date", previousEnd);

      if (previousDealsError) {
        console.error("kpi previous deals error:", previousDealsError);
        return res.status(500).json({ error: "previous deals fetch failed" });
      }

      const { data: currentSalesRows, error: currentSalesRowsError } = await supabase
        .from("sales_import_rows")
        .select("delivery_date, customer_code, customer_name, external_staff_code, amount")
        .gte("delivery_date", currentStart)
        .lt("delivery_date", currentEnd);

      if (currentSalesRowsError) {
        console.error("kpi current sales rows error:", currentSalesRowsError);
        return res.status(500).json({ error: "current sales rows fetch failed" });
      }

      const { data: previousSalesRows, error: previousSalesRowsError } = await supabase
        .from("sales_import_rows")
        .select("delivery_date, customer_code, customer_name, external_staff_code, amount")
        .gte("delivery_date", previousStart)
        .lt("delivery_date", previousEnd);

      if (previousSalesRowsError) {
        console.error("kpi previous sales rows error:", previousSalesRowsError);
        return res.status(500).json({ error: "previous sales rows fetch failed" });
      }

      const scopedMergedProspectsInPeriod = (mergedProspectsInPeriod ?? []).filter((p: any) =>
        allowedUserIds.has(p.created_by)
      );

      const mergedCustomerCodesInPeriod = Array.from(
        new Set(scopedMergedProspectsInPeriod.map((p: any) => p.merged_customer_code).filter(Boolean))
      );

      const { data: mergedCustomersData, error: mergedCustomersError } = await supabase
        .from("customers")
        .select("code, name")
        .in("code", mergedCustomerCodesInPeriod.length > 0 ? mergedCustomerCodesInPeriod : ["__none__"]);

      if (mergedCustomersError) {
        console.error("kpi merged customers error:", mergedCustomersError);
        return res.status(500).json({ error: "merged customers fetch failed" });
      }

      const mergedCustomerNameMap = new Map<string, string>();
      (mergedCustomersData ?? []).forEach((c: any) => {
        mergedCustomerNameMap.set(c.code, c.name ?? c.code);
      });
      const mergedSalesTotal = (currentSalesRows ?? [])
        .filter((row: any) => mergedCustomerCodesInPeriod.includes(row.customer_code))
        .reduce((sum: number, row: any) => {
          const amount = Number(row.amount ?? 0);
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0);

      let budgetsQuery = supabase
        .from("budgets")
        .select("user_id, department_id, target_year_month, target_amount")
        .in("target_year_month", targetYearMonths);

      if (granularity === "department" && allowedDepartmentIds.length > 0) {
        budgetsQuery = budgetsQuery.in("department_id", allowedDepartmentIds);
      }
      if (granularity === "individual" && userId) {
        budgetsQuery = budgetsQuery.eq("user_id", userId);
      }

      const { data: budgetsData, error: budgetsError } = await budgetsQuery;

      if (budgetsError) {
        console.error("kpi budgets error:", budgetsError);
        return res.status(500).json({ error: "budgets fetch failed" });
      }

      const scopedCurrentDeals = (currentDeals ?? []).filter((d: any) => allowedUserIds.has(d.user_id));
      const scopedPreviousDeals = (previousDeals ?? []).filter((d: any) => allowedUserIds.has(d.user_id));
      const scopedBudgets = (budgetsData ?? []).filter((b: any) => {
        if (granularity === "individual") return b.user_id === userId;
        if (granularity === "department") return allowedDepartmentIds.includes(b.department_id);
        return allowedUserIds.has(b.user_id);
      });

      const scopedCurrentSalesRows = (currentSalesRows ?? []).filter((row: any) =>
        allowedExternalStaffCodes.has(String(row.external_staff_code))
      );
      const scopedPreviousSalesRows = (previousSalesRows ?? []).filter((row: any) =>
        allowedExternalStaffCodes.has(String(row.external_staff_code))
      );

      const wonDeals = scopedMergedProspectsInPeriod;
      const visitDeals = scopedCurrentDeals.filter((d: any) => d.activity_type === "visit");

      const salesTotal = scopedCurrentSalesRows.reduce((sum: number, row: any) => {
        const amount = Number(row.amount ?? 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0);

      const previousSalesTotal = scopedPreviousSalesRows.reduce((sum: number, row: any) => {
        const amount = Number(row.amount ?? 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0);

      const budgetTotal = scopedBudgets.reduce((sum: number, b: any) => {
        const amount = Number(b.target_amount ?? 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0);

      const achievementRate = budgetTotal > 0 ? Number(((salesTotal / budgetTotal) * 100).toFixed(1)) : 0;
      const changeRate = previousSalesTotal > 0 ? Number((((salesTotal - previousSalesTotal) / previousSalesTotal) * 100).toFixed(1)) : 0;
      // New conversion rate logic: prospects created in period that eventually merged / prospects created in period
      const newProspectsCount = (createdProspects ?? []).length;
      const mergedProspectsCount = (createdProspects ?? []).filter((p: any) =>
        p.status === "merged" && p.merged_customer_code
      ).length;
      const conversionRate = newProspectsCount > 0
        ? Number(((mergedProspectsCount / newProspectsCount) * 100).toFixed(1))
        : 0;
      const avgOrderValue = mergedProspectsCount > 0
        ? Math.round(mergedSalesTotal / mergedProspectsCount)
        : 0;

      const visitRankingMap = new Map<string, number>();
      const wonRankingMap = new Map<string, number>();

      scopedCurrentDeals.forEach((d: any) => {
        const user = users.find((u) => u.id === d.user_id);
        if (!user) return;

        if (d.activity_type === "visit") {
          visitRankingMap.set(user.name, (visitRankingMap.get(user.name) ?? 0) + 1);
        }
      });

      scopedMergedProspectsInPeriod.forEach((p: any) => {
        const user = users.find((u) => u.id === p.created_by);
        if (!user) return;

        wonRankingMap.set(user.name, (wonRankingMap.get(user.name) ?? 0) + 1);
      });

      const visit_ranking = Array.from(visitRankingMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const won_ranking = Array.from(wonRankingMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const new_orders = scopedMergedProspectsInPeriod
        .slice()
        .sort((a: any, b: any) => new Date(b.merged_at).getTime() - new Date(a.merged_at).getTime())
        .slice(0, 10)
        .map((p: any) => {
          const user = users.find((u) => u.id === p.created_by);
          const customerCode = p.merged_customer_code;
          return {
            clinic: mergedCustomerNameMap.get(customerCode) ?? p.name ?? customerCode,
            sales: user?.name ?? "",
          };
        });

      return res.json({
        budget: {
          sales: salesTotal,
          budget: budgetTotal,
          achievement_rate: achievementRate,
          target_year_months: targetYearMonths,
        },
        sales: {
          sales: salesTotal,
          prev_sales: previousSalesTotal,
          change_rate: changeRate,
        },
        visit_ranking,
        won_ranking,
        conversion_rate: conversionRate,
        new_prospects_count: newProspectsCount,
        merged_new_orders_count: mergedProspectsCount,
        avg_order_value: avgOrderValue,
        new_orders,
      });
    } catch (error) {
      console.error("kpi api unexpected error:", error);
      return res.status(500).json({ error: "kpi api failed" });
    }
  });

  app.get("/api/kpi/new-orders", async (req, res) => {
    try {
      const granularity = (req.query.granularity as Granularity | undefined) ?? "all";
      const department = (req.query.department as string | undefined) ?? "";
      const userId = (req.query.userId as string | undefined) ?? "";
      const fromParam = req.query.from as string | undefined;
      const toParam = req.query.to as string | undefined;

      if (!fromParam || !toParam) {
        return res.status(400).json({ error: "from and to are required" });
      }

      const start = new Date(fromParam);
      const endInclusive = new Date(toParam);
      const endExclusive = new Date(endInclusive.getFullYear(), endInclusive.getMonth(), endInclusive.getDate() + 1);

      const currentStart = toDateString(start);
      const currentEnd = toDateString(endExclusive);

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, name, department_id, departments(name)")
        .order("name", { ascending: true });

      if (profilesError) {
        console.error("new-orders profiles error:", profilesError);
        return res.status(500).json({ error: "profiles fetch failed" });
      }

      const users = (profilesData ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        department_id: p.department_id,
        department: p.departments?.name ?? "",
      }));

      let filteredUsers = users;
      if (granularity === "department" && department) {
        filteredUsers = filteredUsers.filter((u) => u.department === department);
      }
      if (granularity === "individual" && userId) {
        filteredUsers = filteredUsers.filter((u) => u.id === userId);
      }

      const allowedUserIds = new Set(filteredUsers.map((u) => u.id));

      const { data: mergedProspects, error: mergedProspectsError } = await supabase
        .from("prospect_customers")
        .select("id, name, created_by, merged_customer_code, merged_at, status")
        .eq("status", "merged")
        .not("merged_customer_code", "is", null)
        .gte("merged_at", currentStart)
        .lt("merged_at", currentEnd);

      if (mergedProspectsError) {
        console.error("new-orders prospects error:", mergedProspectsError);
        return res.status(500).json({ error: "merged prospects fetch failed" });
      }

      const scopedMergedProspects = (mergedProspects ?? []).filter((p: any) => allowedUserIds.has(p.created_by));
      const mergedCustomerCodes = Array.from(
        new Set(scopedMergedProspects.map((p: any) => p.merged_customer_code).filter(Boolean))
      );

      const { data: customersData, error: customersError } = await supabase
        .from("customers")
        .select("code, name")
        .in("code", mergedCustomerCodes.length > 0 ? mergedCustomerCodes : ["__none__"]);

      if (customersError) {
        console.error("new-orders customers error:", customersError);
        return res.status(500).json({ error: "customers fetch failed" });
      }

      const customerNameMap = new Map<string, string>();
      (customersData ?? []).forEach((c: any) => {
        customerNameMap.set(c.code, c.name ?? c.code);
      });

      const { data: salesRows, error: salesRowsError } = await supabase
        .from("sales_import_rows")
        .select("customer_code, amount, delivery_date")
        .gte("delivery_date", currentStart)
        .lt("delivery_date", currentEnd)
        .in("customer_code", mergedCustomerCodes.length > 0 ? mergedCustomerCodes : ["__none__"]);

      if (salesRowsError) {
        console.error("new-orders sales rows error:", salesRowsError);
        return res.status(500).json({ error: "sales rows fetch failed" });
      }

      const salesByCustomerCode = new Map<string, number>();
      (salesRows ?? []).forEach((row: any) => {
        const key = row.customer_code;
        const amount = Number(row.amount ?? 0);
        if (!key || !Number.isFinite(amount)) return;
        salesByCustomerCode.set(key, (salesByCustomerCode.get(key) ?? 0) + amount);
      });

      const items = scopedMergedProspects
        .map((p: any) => {
          const user = users.find((u) => u.id === p.created_by);
          const customerCode = p.merged_customer_code;
          return {
            prospect_customer_id: p.id,
            customer_code: customerCode,
            customer_name: customerNameMap.get(customerCode) ?? p.name ?? customerCode,
            sales_user_id: p.created_by,
            sales_user_name: user?.name ?? "",
            merged_at: p.merged_at,
            sales_amount: salesByCustomerCode.get(customerCode) ?? 0,
          };
        })
        .sort((a, b) => new Date(b.merged_at).getTime() - new Date(a.merged_at).getTime());

      const totalSales = items.reduce((sum, item) => sum + item.sales_amount, 0);

      return res.json({
        items,
        count: items.length,
        total_sales: totalSales,
      });
    } catch (error) {
      console.error("new-orders api unexpected error:", error);
      return res.status(500).json({ error: "new-orders api failed" });
    }
  });

  app.get("/api/merge/candidates/count", async (_req, res) => {
    try {
      const { count, error } = await supabase
        .from("customer_merge_candidates")
        .select("prospect_customer_id", { count: "exact", head: true })
        .eq("decision", "pending");

      if (error) {
        console.error("merge candidates count error:", error);
        return res.status(500).json({ error: "merge candidates count failed" });
      }

      return res.json({
        pending_count: count ?? 0,
      });
    } catch (error) {
      console.error("merge candidates count unexpected error:", error);
      return res.status(500).json({ error: "merge candidates count api failed" });
    }
  });

  app.get("/api/merge/candidates", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("customer_merge_candidates")
        .select(`
          prospect_customer_id,
          customer_code,
          match_score,
          match_reason,
          decision,
          prospect_customers(name),
          customers(name)
        `)
        .eq("decision", "pending")
        .order("match_score", { ascending: false });

      if (error) {
        console.error("merge candidates fetch error:", error);
        return res.status(500).json({ error: "merge candidates fetch failed" });
      }

      const items = (data ?? []).map((row: any) => ({
        prospect_customer_id: row.prospect_customer_id,
        prospect_name: row.prospect_customers?.name ?? "",
        customer_code: row.customer_code,
        customer_name: row.customers?.name ?? row.customer_code,
        match_score: row.match_score,
        match_reason: row.match_reason,
        decision: row.decision,
      }));

      return res.json(items);
    } catch (error) {
      console.error("merge candidates unexpected error:", error);
      return res.status(500).json({ error: "merge candidates api failed" });
    }
  });

  app.post("/api/merge/generate-candidates", async (_req, res) => {
    try {
      const { data: prospects, error: prospectsError } = await supabase
        .from("prospect_customers")
        .select("id, name, status, merged_customer_code")
        .neq("status", "merged");

      if (prospectsError) {
        console.error("generate merge prospects error:", prospectsError);
        return res.status(500).json({ error: "prospects fetch failed" });
      }

      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("code, name");

      if (customersError) {
        console.error("generate merge customers error:", customersError);
        return res.status(500).json({ error: "customers fetch failed" });
      }

      const normalize = (value: string) =>
        (value ?? "")
          .replace(/[\s　]+/g, "")
          .replace(/[()（）]/g, "")
          .trim();

      const toBigramSet = (value: string) => {
        const normalized = normalize(value);
        const grams = new Set<string>();

        if (normalized.length < 2) {
          if (normalized) grams.add(normalized);
          return grams;
        }

        for (let i = 0; i < normalized.length - 1; i += 1) {
          grams.add(normalized.slice(i, i + 2));
        }

        return grams;
      };

      const similarity = (left: string, right: string) => {
        const leftSet = toBigramSet(left);
        const rightSet = toBigramSet(right);

        if (leftSet.size === 0 || rightSet.size === 0) return 0;

        let intersection = 0;
        leftSet.forEach((token) => {
          if (rightSet.has(token)) intersection += 1;
        });

        return intersection / Math.max(leftSet.size, rightSet.size);
      };

      const candidateRows: Array<{
        prospect_customer_id: string;
        customer_code: string;
        match_score: number;
        match_reason: string;
        decision: string;
      }> = [];

      (prospects ?? []).forEach((prospect: any) => {
        const prospectName = prospect.name ?? "";

        (customers ?? []).forEach((customer: any) => {
          const score = similarity(prospectName, customer.name ?? "");
          if (score < 0.6) return;

          candidateRows.push({
            prospect_customer_id: prospect.id,
            customer_code: customer.code,
            match_score: Number(score.toFixed(4)),
            match_reason: "name_similarity",
            decision: "pending",
          });
        });
      });

      if (candidateRows.length === 0) {
        return res.json({ success: true, inserted_count: 0 });
      }

      const { error: insertError } = await supabase
        .from("customer_merge_candidates")
        .upsert(candidateRows, {
          onConflict: "prospect_customer_id,customer_code",
          ignoreDuplicates: false,
        });

      if (insertError) {
        console.error("generate merge insert error:", insertError);
        return res.status(500).json({ error: "merge candidates insert failed" });
      }

      return res.json({
        success: true,
        inserted_count: candidateRows.length,
      });
    } catch (error) {
      console.error("generate merge unexpected error:", error);
      return res.status(500).json({ error: "generate merge candidates api failed" });
    }
  });

  app.post("/api/merge/confirm", async (req, res) => {
    try {
      const { prospect_customer_id, customer_code, merged_by } = req.body ?? {};

      if (!prospect_customer_id || !customer_code) {
        return res.status(400).json({ error: "prospect_customer_id and customer_code are required" });
      }

      const mergePayload: Record<string, any> = {
        status: "merged",
        merged_customer_code: customer_code,
        merged_at: new Date().toISOString(),
      };

      if (merged_by) {
        mergePayload.merged_by = merged_by;
      }

      const { error: prospectUpdateError } = await supabase
        .from("prospect_customers")
        .update(mergePayload)
        .eq("id", prospect_customer_id);

      if (prospectUpdateError) {
        console.error("merge confirm prospect update error:", prospectUpdateError);
        return res.status(500).json({ error: "prospect merge update failed" });
      }

      const { error: candidateApproveError } = await supabase
        .from("customer_merge_candidates")
        .update({
          decision: "approved",
          reviewed_by: merged_by ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("prospect_customer_id", prospect_customer_id)
        .eq("customer_code", customer_code);

      if (candidateApproveError) {
        console.error("merge confirm candidate approve error:", candidateApproveError);
        return res.status(500).json({ error: "candidate approve update failed" });
      }

      const { error: candidateRejectOthersError } = await supabase
        .from("customer_merge_candidates")
        .update({
          decision: "rejected",
          reviewed_by: merged_by ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("prospect_customer_id", prospect_customer_id)
        .neq("customer_code", customer_code);

      if (candidateRejectOthersError) {
        console.error("merge confirm candidate reject error:", candidateRejectOthersError);
        return res.status(500).json({ error: "candidate reject update failed" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("merge confirm unexpected error:", error);
      return res.status(500).json({ error: "merge confirm api failed" });
    }
  });

  // Clinics API
  app.get("/api/clinics", (_req, res) => {
    res.status(410).json({ error: "Clinics are fetched directly from Supabase in the frontend" });
  });

  app.post("/api/clinics", (_req, res) => {
    res.status(410).json({ error: "Clinic creation is handled directly with Supabase in the frontend" });
  });

  // Deals API
  app.get("/api/deals", (_req, res) => {
    res.status(410).json({ error: "Deals are fetched directly from Supabase in the frontend" });
  });

  app.post("/api/deals", (_req, res) => {
    res.status(410).json({ error: "Deals are created directly with Supabase in the frontend" });
  });

  // Sales import finalize API
  app.post("/api/import/sales/finalize", async (_req, res) => {
    try {
      const { error: syncError } = await supabase.rpc("sync_master_from_sales_import_raw");

      if (syncError) {
        console.error("sales import finalize sync error:", syncError);
        return res.status(500).json({ error: "sales import finalize sync failed" });
      }
      let customerExternalStaffMapResult;
      try {
        customerExternalStaffMapResult = await syncCustomerExternalStaffMaps();
      } catch (customerExternalStaffMapsError) {
        console.error("sales import finalize customer external staff maps error:", customerExternalStaffMapsError);
        return res.status(500).json({ error: "customer external staff maps sync failed" });
      }

      const { data: prospects, error: prospectsError } = await supabase
        .from("prospect_customers")
        .select("id, name, status, merged_customer_code")
        .neq("status", "merged");

      if (prospectsError) {
        console.error("sales import finalize prospects error:", prospectsError);
        return res.status(500).json({ error: "prospects fetch failed" });
      }

      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("code, name");

      if (customersError) {
        console.error("sales import finalize customers error:", customersError);
        return res.status(500).json({ error: "customers fetch failed" });
      }

      const normalize = (value: string) =>
        (value ?? "")
          .replace(/[\s　]+/g, "")
          .replace(/[()（）]/g, "")
          .trim();

      const toBigramSet = (value: string) => {
        const normalized = normalize(value);
        const grams = new Set<string>();

        if (normalized.length < 2) {
          if (normalized) grams.add(normalized);
          return grams;
        }

        for (let i = 0; i < normalized.length - 1; i += 1) {
          grams.add(normalized.slice(i, i + 2));
        }

        return grams;
      };

      const similarity = (left: string, right: string) => {
        const leftSet = toBigramSet(left);
        const rightSet = toBigramSet(right);

        if (leftSet.size === 0 || rightSet.size === 0) return 0;

        let intersection = 0;
        leftSet.forEach((token) => {
          if (rightSet.has(token)) intersection += 1;
        });

        return intersection / Math.max(leftSet.size, rightSet.size);
      };

      const candidateRows: Array<{
        prospect_customer_id: string;
        customer_code: string;
        match_score: number;
        match_reason: string;
        decision: string;
      }> = [];

      (prospects ?? []).forEach((prospect: any) => {
        const prospectName = prospect.name ?? "";

        (customers ?? []).forEach((customer: any) => {
          const score = similarity(prospectName, customer.name ?? "");
          if (score < 0.6) return;

          candidateRows.push({
            prospect_customer_id: prospect.id,
            customer_code: customer.code,
            match_score: Number(score.toFixed(4)),
            match_reason: "name_similarity",
            decision: "pending",
          });
        });
      });

      if (candidateRows.length === 0) {
        return res.json({
          success: true,
          synced: true,
          inserted_count: 0,
          customer_external_staff_maps_upserted: customerExternalStaffMapResult?.upserted_count ?? 0,
        });
      }

      const { error: insertError } = await supabase
        .from("customer_merge_candidates")
        .upsert(candidateRows, {
          onConflict: "prospect_customer_id,customer_code",
          ignoreDuplicates: false,
        });

      if (insertError) {
        console.error("sales import finalize merge insert error:", insertError);
        return res.status(500).json({ error: "merge candidates insert failed" });
      }

      return res.json({
        success: true,
        synced: true,
        inserted_count: candidateRows.length,
        customer_external_staff_maps_upserted: customerExternalStaffMapResult?.upserted_count ?? 0,
      });
    } catch (error) {
      console.error("sales import finalize unexpected error:", error);
      return res.status(500).json({ error: "sales import finalize api failed" });
    }
  });
  // Customers sync API
  app.post("/api/customers/sync-from-sales-import", async (_req, res) => {
    try {
      const { error } = await supabase.rpc("sync_master_from_sales_import_raw");

      if (error) {
        console.error("customers sync error:", error);
        return res.status(500).json({ error: "customers sync failed" });
      }
      let customerExternalStaffMapResult;
      try {
        customerExternalStaffMapResult = await syncCustomerExternalStaffMaps();
      } catch (customerExternalStaffMapsError) {
        console.error("customers sync customer external staff maps error:", customerExternalStaffMapsError);
        return res.status(500).json({ error: "customer external staff maps sync failed" });
      }

      return res.json({
        success: true,
        customer_external_staff_maps_upserted: customerExternalStaffMapResult?.upserted_count ?? 0,
      });
    } catch (error) {
      console.error("customers sync unexpected error:", error);
      return res.status(500).json({ error: "customers sync api failed" });
    }
  });

  app.post("/api/customers/sync-and-generate-merge-candidates", async (_req, res) => {
    try {
      const { error: syncError } = await supabase.rpc("sync_master_from_sales_import_raw");

      if (syncError) {
        console.error("customers sync before merge generation error:", syncError);
        return res.status(500).json({ error: "customers sync before merge generation failed" });
      }
      let customerExternalStaffMapResult;
      try {
        customerExternalStaffMapResult = await syncCustomerExternalStaffMaps();
      } catch (customerExternalStaffMapsError) {
        console.error("sync+generate customer external staff maps error:", customerExternalStaffMapsError);
        return res.status(500).json({ error: "customer external staff maps sync failed" });
      }

      const { data: prospects, error: prospectsError } = await supabase
        .from("prospect_customers")
        .select("id, name, status, merged_customer_code")
        .neq("status", "merged");

      if (prospectsError) {
        console.error("sync+generate prospects error:", prospectsError);
        return res.status(500).json({ error: "prospects fetch failed" });
      }

      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("code, name");

      if (customersError) {
        console.error("sync+generate customers error:", customersError);
        return res.status(500).json({ error: "customers fetch failed" });
      }

      const normalize = (value: string) =>
        (value ?? "")
          .replace(/[\s　]+/g, "")
          .replace(/[()（）]/g, "")
          .trim();

      const toBigramSet = (value: string) => {
        const normalized = normalize(value);
        const grams = new Set<string>();

        if (normalized.length < 2) {
          if (normalized) grams.add(normalized);
          return grams;
        }

        for (let i = 0; i < normalized.length - 1; i += 1) {
          grams.add(normalized.slice(i, i + 2));
        }

        return grams;
      };

      const similarity = (left: string, right: string) => {
        const leftSet = toBigramSet(left);
        const rightSet = toBigramSet(right);

        if (leftSet.size === 0 || rightSet.size === 0) return 0;

        let intersection = 0;
        leftSet.forEach((token) => {
          if (rightSet.has(token)) intersection += 1;
        });

        return intersection / Math.max(leftSet.size, rightSet.size);
      };

      const candidateRows: Array<{
        prospect_customer_id: string;
        customer_code: string;
        match_score: number;
        match_reason: string;
        decision: string;
      }> = [];

      (prospects ?? []).forEach((prospect: any) => {
        const prospectName = prospect.name ?? "";

        (customers ?? []).forEach((customer: any) => {
          const score = similarity(prospectName, customer.name ?? "");
          if (score < 0.6) return;

          candidateRows.push({
            prospect_customer_id: prospect.id,
            customer_code: customer.code,
            match_score: Number(score.toFixed(4)),
            match_reason: "name_similarity",
            decision: "pending",
          });
        });
      });

      if (candidateRows.length === 0) {
        return res.json({
          success: true,
          synced: true,
          inserted_count: 0,
          customer_external_staff_maps_upserted: customerExternalStaffMapResult?.upserted_count ?? 0,
        });
      }

      const { error: insertError } = await supabase
        .from("customer_merge_candidates")
        .upsert(candidateRows, {
          onConflict: "prospect_customer_id,customer_code",
          ignoreDuplicates: false,
        });

      if (insertError) {
        console.error("sync+generate merge insert error:", insertError);
        return res.status(500).json({ error: "merge candidates insert failed" });
      }

      return res.json({
        success: true,
        synced: true,
        inserted_count: candidateRows.length,
        customer_external_staff_maps_upserted: customerExternalStaffMapResult?.upserted_count ?? 0,
      });
    } catch (error) {
      console.error("sync+generate unexpected error:", error);
      return res.status(500).json({ error: "sync and generate merge candidates api failed" });
    }
  });

  // Users API
  app.get("/api/users", async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, department_id, departments(name)")
        .order("name", { ascending: true });

      if (error) {
        console.error("users api error:", error);
        return res.status(500).json({ error: "users fetch failed" });
      }

      const users = (data ?? []).map((u: any) => ({
        id: u.id,
        name: u.name,
        department: u.departments?.name ?? "",
        department_id: u.department_id ?? null,
      }));

      return res.json(users);
    } catch (error) {
      console.error("users api unexpected error:", error);
      return res.status(500).json({ error: "users api failed" });
    }
  });

  // Export API
  app.get("/api/export/deals", (_req, res) => {
    res.status(410).json({ error: "Deal export is not implemented in the Supabase-backed server yet" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
