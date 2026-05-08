import type { VercelRequest, VercelResponse } from '@vercel/node';
import syncAndGenerateHandler from '../../src/server-handlers/customers/sync-and-generate-merge-candidates.js';
import syncFromSalesImportHandler from '../../src/server-handlers/customers/sync-from-sales-import.js';

function getCustomersRoute(req: VercelRequest) {
  const pathname = new URL(req.url ?? '/api/customers', 'http://localhost').pathname;
  return pathname.replace(/^\/api\/customers\/?/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getCustomersRoute(req);

  if (route === 'sync-from-sales-import') {
    return syncFromSalesImportHandler(req, res);
  }

  if (route === 'sync-and-generate-merge-candidates') {
    return syncAndGenerateHandler(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
}
