import { supabaseAdmin } from '../../src/lib/supabaseAdmin.js';

type SalesDateRow = {
  customer_code: string | null;
  delivery_date: string | null;
  order_date: string | null;
};

type MergedProspectRow = {
  merged_customer_code?: string | null;
};

function effectiveOrderDate(row: SalesDateRow) {
  return row.order_date || row.delivery_date || null;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function fetchFirstOrderDateByCustomerCode(customerCodes: string[]) {
  const uniqueCodes = Array.from(new Set(customerCodes.map((code) => String(code ?? '').trim()).filter(Boolean)));
  const firstDateByCustomerCode = new Map<string, string>();

  for (const codeChunk of chunk(uniqueCodes, 500)) {
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabaseAdmin
        .from('sales_import_rows')
        .select('customer_code, delivery_date, order_date')
        .in('customer_code', codeChunk)
        .range(from, from + pageSize - 1);

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as SalesDateRow[];
      for (const row of rows) {
        const customerCode = String(row.customer_code ?? '').trim();
        const orderDate = effectiveOrderDate(row);
        if (!customerCode || !orderDate) continue;

        const current = firstDateByCustomerCode.get(customerCode);
        if (!current || orderDate < current) {
          firstDateByCustomerCode.set(customerCode, orderDate);
        }
      }

      if (rows.length < pageSize) {
        break;
      }

      from += pageSize;
    }
  }

  return firstDateByCustomerCode;
}

export function filterMergedProspectsByFirstOrderDate<T extends MergedProspectRow>(
  prospects: T[],
  firstDateByCustomerCode: Map<string, string>,
  startDate: string,
  endExclusiveDate: string
) {
  return prospects.filter((prospect) => {
    const customerCode = String(prospect.merged_customer_code ?? '').trim();
    const firstOrderDate = firstDateByCustomerCode.get(customerCode);
    return Boolean(firstOrderDate && firstOrderDate >= startDate && firstOrderDate < endExclusiveDate);
  });
}
