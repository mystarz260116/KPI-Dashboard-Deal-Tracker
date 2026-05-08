import type { VercelRequest, VercelResponse } from '@vercel/node';
import finalizeHandler from '../../../src/server-handlers/import-sales/finalize.js';
import uploadHandler from '../../../src/server-handlers/import-sales/upload.js';

function getImportSalesRoute(req: VercelRequest) {
  const pathname = new URL(req.url ?? '/api/import/sales', 'http://localhost').pathname;
  return pathname.replace(/^\/api\/import\/sales\/?/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getImportSalesRoute(req);

  if (route === 'upload') {
    return uploadHandler(req, res);
  }

  if (route === 'finalize') {
    return finalizeHandler(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
}
