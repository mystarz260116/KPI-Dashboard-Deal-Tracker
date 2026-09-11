import type { VercelRequest, VercelResponse } from '@vercel/node';
import productCategoryMasterUpsertHandler from '../src/server-handlers/import-product-categories/upsert.js';

function normalizeRoutePath(pathValue: string | string[] | undefined) {
  if (Array.isArray(pathValue)) {
    return pathValue.join('/');
  }

  return pathValue ?? '';
}

function getImportRoute(req: VercelRequest) {
  const queryRoute = normalizeRoutePath(req.query?.path as string | string[] | undefined);
  if (queryRoute) {
    return queryRoute.replace(/^\/+|\/+$/g, '');
  }

  const pathname = new URL(req.url ?? '/api/import', 'http://localhost').pathname;
  return pathname.replace(/^\/api\/import\/?/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getImportRoute(req);

  if (route.startsWith('sales/')) {
    return res.status(410).json({
      error: 'CSV取込機能は廃止されました。医院・受注・納品データは入れ歯くん同期を使用してください。',
      code: 'SALES_CSV_IMPORT_RETIRED',
    });
  }

  if (route === 'product-categories/upsert') {
    return productCategoryMasterUpsertHandler(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
}
