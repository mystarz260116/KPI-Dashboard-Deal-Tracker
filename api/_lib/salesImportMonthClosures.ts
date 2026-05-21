import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { SALES_IMPORT_RAW_TABLE } from './regions.js';

function padMonth(month: number) {
  return String(month).padStart(2, '0');
}

export function normalizeYearMonth(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }

  return `${year}-${padMonth(month)}`;
}

export function getMonthKeyFromRawDate(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const slashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/\d{1,2}$/);
  if (slashMatch) {
    return `${slashMatch[1]}-${padMonth(Number(slashMatch[2]))}`;
  }

  const dashMatch = trimmed.match(/^(\d{4})-(\d{1,2})-\d{1,2}$/);
  if (dashMatch) {
    return `${dashMatch[1]}-${padMonth(Number(dashMatch[2]))}`;
  }

  return null;
}

export function getMonthRange(yearMonth: string) {
  const normalized = normalizeYearMonth(yearMonth);
  if (!normalized) {
    throw new Error(`Invalid year month: ${yearMonth}`);
  }

  const [year, month] = normalized.split('-').map(Number);
  const start = `${year}-${padMonth(month)}-01`;
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const endExclusive = `${nextMonthYear}-${padMonth(nextMonth)}-01`;

  return {
    yearMonth: normalized,
    start,
    endExclusive,
  };
}

export async function getBatchTargetMonths(
  departmentId: number,
  importBatchId: string
) {
  const { data, error } = await supabaseAdmin
    .from(SALES_IMPORT_RAW_TABLE)
    .select('delivery_date_parsed, 納品日')
    .eq('department_id', departmentId)
    .eq('import_batch_id', importBatchId);

  if (error) {
    throw error;
  }

  const months = new Set<string>();

  (data ?? []).forEach((row: any) => {
    if (row.delivery_date_parsed) {
      const parsed = new Date(String(row.delivery_date_parsed));
      if (!Number.isNaN(parsed.getTime())) {
        months.add(`${parsed.getFullYear()}-${padMonth(parsed.getMonth() + 1)}`);
        return;
      }
    }

    const fallbackMonth = getMonthKeyFromRawDate(row['納品日']);
    if (fallbackMonth) {
      months.add(fallbackMonth);
    }
  });

  return Array.from(months).sort();
}

export async function getClosedMonths(
  departmentId: number,
  targetYearMonths: string[]
) {
  if (targetYearMonths.length === 0) {
    return [];
  }

  const normalizedMonths = targetYearMonths
    .map((month) => normalizeYearMonth(month))
    .filter(Boolean) as string[];

  if (normalizedMonths.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('sales_import_month_closures')
    .select('target_year_month, closed_at, closed_by')
    .eq('department_id', departmentId)
    .in('target_year_month', normalizedMonths);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function replaceOpenMonthSalesData(
  departmentId: number,
  importBatchId: string,
  targetYearMonths: string[]
) {
  let deletedRawRows = 0;
  let deletedSalesRows = 0;

  for (const targetYearMonth of targetYearMonths) {
    const { start, endExclusive } = getMonthRange(targetYearMonth);

    const deleteRawResult = await supabaseAdmin
      .from(SALES_IMPORT_RAW_TABLE)
      .delete()
      .eq('department_id', departmentId)
      .neq('import_batch_id', importBatchId)
      .gte('delivery_date_parsed', start)
      .lt('delivery_date_parsed', endExclusive);

    if (deleteRawResult.error) {
      throw deleteRawResult.error;
    }

    deletedRawRows += deleteRawResult.count ?? 0;

    const deleteSalesRowsResult = await supabaseAdmin
      .from('sales_import_rows')
      .delete()
      .eq('department_id', departmentId)
      .neq('import_batch_id', importBatchId)
      .gte('delivery_date', start)
      .lt('delivery_date', endExclusive);

    if (deleteSalesRowsResult.error) {
      throw deleteSalesRowsResult.error;
    }

    deletedSalesRows += deleteSalesRowsResult.count ?? 0;
  }

  return {
    deletedRawRows,
    deletedSalesRows,
  };
}

export async function discardImportBatch(
  departmentId: number,
  importBatchId: string
) {
  const deleteResult = await supabaseAdmin
    .from(SALES_IMPORT_RAW_TABLE)
    .delete()
    .eq('department_id', departmentId)
    .eq('import_batch_id', importBatchId);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  return deleteResult.count ?? 0;
}
