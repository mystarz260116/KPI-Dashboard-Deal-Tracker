import type { VercelRequest, VercelResponse } from '@vercel/node';
import finalizeHandler from '../src/server-handlers/import-sales/finalize.js';
import closeMonthHandler from '../src/server-handlers/import-sales/close-month.js';
import monthClosuresHandler from '../src/server-handlers/import-sales/month-closures.js';
import uploadHandler from '../src/server-handlers/import-sales/upload.js';
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

  if (route === 'sales/upload') {
    return uploadHandler(req, res);
  }

  if (route === 'sales/finalize') {
    return finalizeHandler(req, res);
  }

  if (route === 'sales/close-month') {
    return closeMonthHandler(req, res);
  }

  if (route === 'sales/month-closures') {
    return monthClosuresHandler(req, res);
  }

  if (route === 'product-categories/upsert') {
    return productCategoryMasterUpsertHandler(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
}
