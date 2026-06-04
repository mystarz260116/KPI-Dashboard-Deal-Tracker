import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';
import { SALES_IMPORT_RAW_TABLE } from './regions.js';
import { normalizeSalesImportDataKind } from './regionalReads.js';

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
  importBatchId: string,
  dataKind: 'delivery' | 'order' = 'delivery'
) {
  const { data, error } = await supabaseAdmin
    .from(SALES_IMPORT_RAW_TABLE)
    .select('納品日, 受注日, data_kind')
    .eq('department_id', departmentId)
    .eq('import_batch_id', importBatchId)
    .eq('data_kind', dataKind);

  if (error) {
    throw error;
  }

  const months = new Set<string>();
  const rawDateColumn = dataKind === 'order' ? '受注日' : '納品日';

  (data ?? []).forEach((row: any) => {
    const fallbackMonth = getMonthKeyFromRawDate(row[rawDateColumn]);
    if (fallbackMonth) {
      months.add(fallbackMonth);
    }
  });

  return Array.from(months).sort();
}

export async function getClosedMonths(
  departmentId: number,
  targetYearMonths: string[],
  dataKind: 'delivery' | 'order' = 'delivery'
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
    .eq('data_kind', dataKind)
    .in('target_year_month', normalizedMonths);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function replaceOpenMonthSalesData(
  departmentId: number,
  importBatchId: string,
  targetYearMonths: string[],
  dataKind: 'delivery' | 'order' = 'delivery'
) {
  let deletedRawRows = 0;
  let deletedSalesRows = 0;
  const normalizedDataKind = normalizeSalesImportDataKind(dataKind);
  const salesDateColumn = normalizedDataKind === 'order' ? 'order_date' : 'delivery_date';
  const rawDateColumn = normalizedDataKind === 'order' ? '受注日' : '納品日';

  for (const targetYearMonth of targetYearMonths) {
    const { start, endExclusive } = getMonthRange(targetYearMonth);

    const rawRowsToDelete: any[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data: rawRowsPage, error: rawRowsLookupError } = await supabaseAdmin
        .from(SALES_IMPORT_RAW_TABLE)
        .select(`id, ${rawDateColumn}`)
        .eq('department_id', departmentId)
        .eq('data_kind', normalizedDataKind)
        .neq('import_batch_id', importBatchId)
        .range(from, from + pageSize - 1);

      if (rawRowsLookupError) {
        throw rawRowsLookupError;
      }

      const page = rawRowsPage ?? [];
      rawRowsToDelete.push(...page);

      if (page.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    const rawIdsToDelete = (rawRowsToDelete ?? [])
      .filter((row: any) => {
        const month = getMonthKeyFromRawDate(row[rawDateColumn]);
        return month === targetYearMonth;
      })
      .map((row: any) => row.id)
      .filter(Boolean);

    for (let index = 0; index < rawIdsToDelete.length; index += 1000) {
      const rawIdChunk = rawIdsToDelete.slice(index, index + 1000);
      const deleteRawResult = await supabaseAdmin
        .from(SALES_IMPORT_RAW_TABLE)
        .delete({ count: 'exact' })
        .eq('department_id', departmentId)
        .eq('data_kind', normalizedDataKind)
        .in('id', rawIdChunk);

      if (deleteRawResult.error) {
        throw deleteRawResult.error;
      }

      deletedRawRows += deleteRawResult.count ?? rawIdChunk.length;
    }

    const deleteSalesRowsResult = await supabaseAdmin
      .from('sales_import_rows')
      .delete({ count: 'exact' })
      .eq('department_id', departmentId)
      .eq('data_kind', normalizedDataKind)
      .neq('import_batch_id', importBatchId)
      .gte(salesDateColumn, start)
      .lt(salesDateColumn, endExclusive);

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
  importBatchId: string,
  dataKind: 'delivery' | 'order' = 'delivery'
) {
  const deleteResult = await supabaseAdmin
    .from(SALES_IMPORT_RAW_TABLE)
    .delete()
    .eq('department_id', departmentId)
    .eq('data_kind', dataKind)
    .eq('import_batch_id', importBatchId);

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  return deleteResult.count ?? 0;
}
