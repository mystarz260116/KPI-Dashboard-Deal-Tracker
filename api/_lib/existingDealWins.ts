import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { toDateString } from '../../src/lib/dateUtils.js';

type ExistingDealRow = {
  id: string;
  user_id: string;
  customer_code: string | null;
  prospect_customer_id: string | null;
  deal_date: string;
  proposal_category: string | null;
  proposal_categories: string[] | null;
  created_at: string | null;
};

type SalesImportRow = {
  department_id: number | null;
  customer_code: string | null;
  amount: number | null;
  order_date: string | null;
  normalized_product_code: string | null;
};

type ProductCategoryMasterRow = {
  department_id: number | null;
  normalized_product_code: string | null;
  proposal_category: string | null;
};

export type ExistingDealWin = {
  deal_id: string;
  user_id: string;
  customer_code: string;
  deal_date: string;
  proposal_category: string;
  before_monthly_average: number;
  after_amount: number;
};

type ExistingDealWinOptions = {
  startDate: string;
  endExclusiveDate: string;
  allowedUserIds: Set<string>;
};

const BEFORE_MONTHS = 3;
const AFTER_MONTHS = 1;
const DEDUPE_MONTHS = 6;
const WARMUP_MONTHS = DEDUPE_MONTHS * 2;

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addMonths(value: string, months: number) {
  const date = parseDate(value);
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDayOfTargetMonth));
  return toDateString(target);
}

function compareDeals(left: ExistingDealRow, right: ExistingDealRow) {
  if (left.deal_date !== right.deal_date) {
    return left.deal_date < right.deal_date ? -1 : 1;
  }

  const leftCreated = left.created_at ?? '';
  const rightCreated = right.created_at ?? '';
  if (leftCreated !== rightCreated) {
    return leftCreated < rightCreated ? -1 : 1;
  }

  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function normalizeCategories(row: ExistingDealRow) {
  const categories = Array.isArray(row.proposal_categories) && row.proposal_categories.length > 0
    ? row.proposal_categories
    : row.proposal_category
      ? [row.proposal_category]
      : [];

  return Array.from(
    new Set(
      categories
        .map((category) => String(category ?? '').trim())
        .filter(Boolean)
    )
  );
}

function buildSalesAmountLookup(
  salesRows: SalesImportRow[],
  categoryByDepartmentAndProductCode: Map<string, string>
) {
  const amountByCustomerCategoryDate = new Map<string, number>();

  for (const row of salesRows) {
    const departmentId = Number(row.department_id);
    const productCode = String(row.normalized_product_code ?? '').trim();
    const customerCode = String(row.customer_code ?? '').trim();
    const orderDate = String(row.order_date ?? '').trim();
    if (!Number.isFinite(departmentId) || !productCode || !customerCode || !orderDate) {
      continue;
    }

    const category = categoryByDepartmentAndProductCode.get(`${departmentId}|${productCode}`);
    if (!category) {
      continue;
    }

    const amount = Number(row.amount ?? 0);
    if (!Number.isFinite(amount)) {
      continue;
    }

    const key = `${customerCode}|${category}|${orderDate}`;
    amountByCustomerCategoryDate.set(key, (amountByCustomerCategoryDate.get(key) ?? 0) + amount);
  }

  return amountByCustomerCategoryDate;
}

function sumAmountInRange(
  amountByCustomerCategoryDate: Map<string, number>,
  customerCode: string,
  category: string,
  startDate: string,
  endExclusiveDate: string
) {
  let total = 0;
  const prefix = `${customerCode}|${category}|`;

  for (const [key, amount] of amountByCustomerCategoryDate.entries()) {
    if (!key.startsWith(prefix)) {
      continue;
    }

    const date = key.slice(prefix.length);
    if (date >= startDate && date < endExclusiveDate) {
      total += amount;
    }
  }

  return total;
}

export async function detectExistingDealWins(options: ExistingDealWinOptions) {
  const allowedUserIdList = Array.from(options.allowedUserIds);
  if (allowedUserIdList.length === 0) {
    return [];
  }

  const warmupStartDate = addMonths(options.startDate, -WARMUP_MONTHS);
  const salesStartDate = addMonths(warmupStartDate, -BEFORE_MONTHS);
  const salesEndExclusiveDate = addMonths(options.endExclusiveDate, AFTER_MONTHS);

  const { data: dealsData, error: dealsError } = await supabaseAdmin
    .from('deals')
    .select('id, user_id, customer_code, prospect_customer_id, deal_date, proposal_category, proposal_categories, created_at')
    .in('user_id', allowedUserIdList)
    .not('customer_code', 'is', null)
    .is('prospect_customer_id', null)
    .gte('deal_date', warmupStartDate)
    .lt('deal_date', options.endExclusiveDate);

  if (dealsError) {
    throw dealsError;
  }

  const candidateDeals = ((dealsData ?? []) as ExistingDealRow[])
    .filter((deal) => normalizeCategories(deal).length > 0)
    .sort(compareDeals);

  if (candidateDeals.length === 0) {
    return [];
  }

  const customerCodes = Array.from(
    new Set(candidateDeals.map((deal) => String(deal.customer_code ?? '').trim()).filter(Boolean))
  );

  const { data: salesRowsData, error: salesRowsError } = await supabaseAdmin
    .from('sales_import_rows')
    .select('department_id, customer_code, amount, order_date, normalized_product_code')
    .eq('data_kind', 'order')
    .in('customer_code', customerCodes)
    .gte('order_date', salesStartDate)
    .lt('order_date', salesEndExclusiveDate);

  if (salesRowsError) {
    throw salesRowsError;
  }

  const salesRows = (salesRowsData ?? []) as SalesImportRow[];
  const departmentIds = Array.from(
    new Set(
      salesRows
        .map((row) => Number(row.department_id))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );

  if (departmentIds.length === 0) {
    return [];
  }

  const { data: categoryMastersData, error: categoryMastersError } = await supabaseAdmin
    .from('product_category_masters')
    .select('department_id, normalized_product_code, proposal_category')
    .in('department_id', departmentIds);

  if (categoryMastersError) {
    throw categoryMastersError;
  }

  const categoryByDepartmentAndProductCode = new Map<string, string>();
  for (const row of (categoryMastersData ?? []) as ProductCategoryMasterRow[]) {
    const departmentId = Number(row.department_id);
    const productCode = String(row.normalized_product_code ?? '').trim();
    const category = String(row.proposal_category ?? '').trim();
    if (!Number.isFinite(departmentId) || !productCode || !category) {
      continue;
    }

    categoryByDepartmentAndProductCode.set(`${departmentId}|${productCode}`, category);
  }

  const amountLookup = buildSalesAmountLookup(salesRows, categoryByDepartmentAndProductCode);
  const lastWonDateByCustomerAndCategory = new Map<string, string>();
  const wins: ExistingDealWin[] = [];

  for (const deal of candidateDeals) {
    const customerCode = String(deal.customer_code ?? '').trim();
    if (!customerCode) {
      continue;
    }

    for (const category of normalizeCategories(deal)) {
      const dedupeKey = `${customerCode}|${category}`;
      const lastWonDate = lastWonDateByCustomerAndCategory.get(dedupeKey);
      if (lastWonDate && deal.deal_date < addMonths(lastWonDate, DEDUPE_MONTHS)) {
        continue;
      }

      const beforeStartDate = addMonths(deal.deal_date, -BEFORE_MONTHS);
      const beforeAmount = sumAmountInRange(
        amountLookup,
        customerCode,
        category,
        beforeStartDate,
        deal.deal_date
      );
      const beforeMonthlyAverage = beforeAmount / BEFORE_MONTHS;
      const afterAmount = sumAmountInRange(
        amountLookup,
        customerCode,
        category,
        deal.deal_date,
        addMonths(deal.deal_date, AFTER_MONTHS)
      );

      if (afterAmount <= beforeMonthlyAverage) {
        continue;
      }

      lastWonDateByCustomerAndCategory.set(dedupeKey, deal.deal_date);

      if (deal.deal_date >= options.startDate && deal.deal_date < options.endExclusiveDate) {
        wins.push({
          deal_id: deal.id,
          user_id: deal.user_id,
          customer_code: customerCode,
          deal_date: deal.deal_date,
          proposal_category: category,
          before_monthly_average: beforeMonthlyAverage,
          after_amount: afterAmount,
        });
      }
    }
  }

  const firstWinByDealId = new Map<string, ExistingDealWin>();
  for (const win of wins) {
    if (!firstWinByDealId.has(win.deal_id)) {
      firstWinByDealId.set(win.deal_id, win);
    }
  }

  return Array.from(firstWinByDealId.values());
}
