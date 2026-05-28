import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { requireAuthenticatedProfile, requireDashboardAccess } from '../../../api/_lib/auth.js';

type RawRow = {
  department_id?: unknown;
  normalized_product_code?: unknown;
  normalized_product_name?: unknown;
  proposal_category?: unknown;
  major_category?: unknown;
  is_kpi_target?: unknown;
  sort_order?: unknown;
  notes?: unknown;
};

function parseBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on', 't'].includes(raw)) return true;
  if (['false', '0', 'no', 'n', 'off', 'f', ''].includes(raw)) return false;
  return false;
}

function parseInteger(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizeText(value: unknown) {
  const raw = String(value ?? '').trim();
  return raw || null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const profile = await requireAuthenticatedProfile(req, res);
    if (!profile) return;
    if (!requireDashboardAccess(profile, res)) return;

    const rows = Array.isArray(req.body?.rows) ? req.body.rows as RawRow[] : [];
    if (rows.length === 0) {
      return res.status(400).json({ error: 'rows are required' });
    }

    const deduped = new Map<string, {
      department_id: number;
      normalized_product_code: string;
      normalized_product_name: string;
      proposal_category: string | null;
      major_category: string | null;
      is_kpi_target: boolean;
      sort_order: number;
      notes: string | null;
      updated_at: string;
    }>();

    for (const row of rows) {
      const departmentId = parseInteger((row as any).department_id, NaN);
      const normalizedProductCode = String((row as any).normalized_product_code ?? '').trim();
      const normalizedProductName = String((row as any).normalized_product_name ?? '').trim();

      if (!Number.isFinite(departmentId) || departmentId <= 0 || !normalizedProductCode || !normalizedProductName) {
        continue;
      }

      const key = `${departmentId}|${normalizedProductCode}`;
      deduped.set(key, {
        department_id: departmentId,
        normalized_product_code: normalizedProductCode,
        normalized_product_name: normalizedProductName,
        proposal_category: normalizeText((row as any).proposal_category),
        major_category: normalizeText((row as any).major_category),
        is_kpi_target: parseBoolean((row as any).is_kpi_target),
        sort_order: parseInteger((row as any).sort_order, 0),
        notes: normalizeText((row as any).notes),
        updated_at: new Date().toISOString(),
      });
    }

    const payload = Array.from(deduped.values());
    if (payload.length === 0) {
      return res.status(400).json({ error: 'valid rows are required' });
    }

    const { error } = await supabaseAdmin
      .from('product_category_masters')
      .upsert(payload, {
        onConflict: 'department_id,normalized_product_code',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error('product category masters upsert error:', error);
      return res.status(500).json({ error: 'product category masters upsert failed' });
    }

    return res.status(200).json({
      success: true,
      upserted_count: payload.length,
      received_count: rows.length,
      deduped_count: rows.length - payload.length,
    });
  } catch (error) {
    console.error('product category masters upsert unexpected error:', error);
    return res.status(500).json({ error: 'product category masters upsert api failed' });
  }
}
