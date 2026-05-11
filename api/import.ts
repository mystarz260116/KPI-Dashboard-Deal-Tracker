import type { VercelRequest, VercelResponse } from '@vercel/node';
import finalizeHandler from '../src/server-handlers/import-sales/finalize.js';
import uploadHandler from '../src/server-handlers/import-sales/upload.js';

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

  return res.status(404).json({ error: 'Not found' });
}
