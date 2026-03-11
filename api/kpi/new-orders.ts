

import { supabaseAdmin } from '../../src/lib/supabaseAdmin';
import { toDateString } from '../../src/lib/dateUtils';

type Granularity = 'all' | 'department' | 'individual';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const granularity = (req.query.granularity as Granularity | undefined) ?? 'all';
    const department = (req.query.department as string | undefined) ?? '';
    const userId = (req.query.userId as string | undefined) ?? '';
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;

    if (!fromParam || !toParam) {
      return res.status(400).json({ error: 'from and to are required' });
    }

    const start = new Date(fromParam);
    const endInclusive = new Date(toParam);
    const endExclusive = new Date(endInclusive.getFullYear(), endInclusive.getMonth(), endInclusive.getDate() + 1);

    const currentStart = toDateString(start);
    const currentEnd = toDateString(endExclusive);

    const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, name, department_id, departments(name)')
      .order('name', { ascending: true });

    if (profilesError) {
      console.error('new-orders profiles error:', profilesError);
      return res.status(500).json({ error: 'profiles fetch failed' });
    }

    const users = (profilesData ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      department_id: p.department_id,
      department: p.departments?.name ?? '',
    }));

    let filteredUsers = users;
    if (granularity === 'department' && department) {
      filteredUsers = filteredUsers.filter((u) => u.department === department);
    }
    if (granularity === 'individual' && userId) {
      filteredUsers = filteredUsers.filter((u) => u.id === userId);
    }

    const allowedUserIds = new Set(filteredUsers.map((u) => u.id));

    const { data: mergedProspects, error: mergedProspectsError } = await supabaseAdmin
      .from('prospect_customers')
      .select('id, name, created_by, merged_customer_code, merged_at, status')
      .eq('status', 'merged')
      .not('merged_customer_code', 'is', null)
      .gte('merged_at', currentStart)
      .lt('merged_at', currentEnd);

    if (mergedProspectsError) {
      console.error('new-orders prospects error:', mergedProspectsError);
      return res.status(500).json({ error: 'merged prospects fetch failed' });
    }

    const scopedMergedProspects = (mergedProspects ?? []).filter((p: any) => allowedUserIds.has(p.created_by));
    const mergedCustomerCodes = Array.from(
      new Set(scopedMergedProspects.map((p: any) => p.merged_customer_code).filter(Boolean))
    );

    const { data: customersData, error: customersError } = await supabaseAdmin
      .from('customers')
      .select('code, name')
      .in('code', mergedCustomerCodes.length > 0 ? mergedCustomerCodes : ['__none__']);

    if (customersError) {
      console.error('new-orders customers error:', customersError);
      return res.status(500).json({ error: 'customers fetch failed' });
    }

    const customerNameMap = new Map<string, string>();
    (customersData ?? []).forEach((c: any) => {
      customerNameMap.set(c.code, c.name ?? c.code);
    });

    const { data: salesRows, error: salesRowsError } = await supabaseAdmin
      .from('sales_import_rows')
      .select('customer_code, amount, delivery_date')
      .gte('delivery_date', currentStart)
      .lt('delivery_date', currentEnd)
      .in('customer_code', mergedCustomerCodes.length > 0 ? mergedCustomerCodes : ['__none__']);

    if (salesRowsError) {
      console.error('new-orders sales rows error:', salesRowsError);
      return res.status(500).json({ error: 'sales rows fetch failed' });
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
          sales_user_name: user?.name ?? '',
          merged_at: p.merged_at,
          sales_amount: salesByCustomerCode.get(customerCode) ?? 0,
        };
      })
      .sort((a, b) => new Date(b.merged_at).getTime() - new Date(a.merged_at).getTime());

    const totalSales = items.reduce((sum, item) => sum + item.sales_amount, 0);

    return res.status(200).json({
      items,
      count: items.length,
      total_sales: totalSales,
    });
  } catch (error) {
    console.error('new-orders api unexpected error:', error);
    return res.status(500).json({ error: 'new-orders api failed' });
  }
}