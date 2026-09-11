import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../../api/_lib/auth.js';

const bodyOf = (req: any) => typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});

const fetchAll = async (table: string) => {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from(table).select('*').range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) return rows;
  }
};

export default async function handler(req: any, res: any) {
  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile || !requireDashboardAccess(profile, res)) return;
    if (req.method === 'POST') {
      const requested = (Array.isArray(bodyOf(req).rows) ? bodyOf(req).rows : []).map((row: any) => ({
        normalized_product_code: String(row.normalized_product_code ?? '').trim(),
        material_category: String(row.material_category ?? '').trim() || '未分類',
        notes: String(row.notes ?? '').slice(0, 1000),
        is_active: row.is_active !== false,
      })).filter((row: any) => row.normalized_product_code);
      const codes = [...new Set(requested.map((row: any) => row.normalized_product_code))];
      const { data: aliases, error: aliasError } = codes.length
        ? await supabaseAdmin.from('material_product_sales_summary').select('department_id,normalized_product_code,normalized_product_name').in('normalized_product_code', codes)
        : { data: [], error: null };
      if (aliasError) throw aliasError;
      const requestMap = new Map(requested.map((row: any) => [row.normalized_product_code, row]));
      const rows = (aliases ?? []).map((alias: any) => ({
        department_id: Number(alias.department_id),
        normalized_product_code: alias.normalized_product_code,
        normalized_product_name: alias.normalized_product_name,
        ...(requestMap.get(alias.normalized_product_code) as any),
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }));
      if (rows.length) {
        const { error } = await supabaseAdmin.from('material_category_masters').upsert(rows, {
          onConflict: 'department_id,normalized_product_code,normalized_product_name',
        });
        if (error) throw error;
        const { error: refreshError } = await supabaseAdmin.rpc('refresh_material_category_daily_actuals');
        if (refreshError) throw refreshError;
      }
      return res.status(200).json({ saved_count: rows.length });
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const [sales, masters] = await Promise.all([
      fetchAll('material_product_sales_summary'),
      fetchAll('material_category_masters'),
    ]);
    const masterMap = new Map((masters ?? []).map((row: any) => [`${row.department_id}\u0000${row.normalized_product_code}\u0000${row.normalized_product_name}`, row]));
    const detailedRows = sales.map((row: any) => {
      const master = masterMap.get(`${row.department_id}\u0000${row.normalized_product_code}\u0000${row.normalized_product_name}`) as any;
      return { ...row, material_category: master?.material_category ?? '未分類', notes: master?.notes ?? '', is_active: master?.is_active ?? true };
    });
    const grouped = new Map<string, any>();
    for (const row of detailedRows) {
      const code = row.normalized_product_code;
      const current = grouped.get(code) ?? {
        normalized_product_code: code, representative_name: row.normalized_product_name, representative_count: -1,
        aliases: [], first_sales_date: row.first_sales_date, last_sales_date: row.last_sales_date,
        row_count: 0, units_total: 0, sales_total: 0, return_sales_total: 0,
        material_category: row.material_category, notes: row.notes, is_active: row.is_active,
      };
      const count = Number(row.row_count ?? 0);
      current.aliases.push({ department_id: row.department_id, product_name: row.normalized_product_name, row_count: count, units_total: Number(row.units_total), sales_total: Number(row.sales_total) });
      current.row_count += count; current.units_total += Number(row.units_total); current.sales_total += Number(row.sales_total); current.return_sales_total += Number(row.return_sales_total);
      if (count > current.representative_count) { current.representative_count = count; current.representative_name = row.normalized_product_name; }
      if (String(row.first_sales_date) < String(current.first_sales_date)) current.first_sales_date = row.first_sales_date;
      if (String(row.last_sales_date) > String(current.last_sales_date)) current.last_sales_date = row.last_sales_date;
      grouped.set(code, current);
    }
    const rows = [...grouped.values()].map(({ representative_count, ...row }) => ({ ...row, alias_count: row.aliases.length })).sort((a, b) => b.sales_total - a.sales_total);
    return res.status(200).json({ rows, detail_category: '5材料', generated_at: new Date().toISOString() });
  } catch (error) {
    console.error('material category master error:', error);
    return res.status(500).json({ error: 'material category master failed' });
  }
}
