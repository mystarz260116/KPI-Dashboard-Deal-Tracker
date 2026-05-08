import type { VercelRequest, VercelResponse } from '@vercel/node';
import newOrdersHandler from '../../src/server-handlers/kpi/new-orders.js';

function getKpiRoute(req: VercelRequest) {
  const pathname = new URL(req.url ?? '/api/kpi', 'http://localhost').pathname;
  return pathname.replace(/^\/api\/kpi\/?/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getKpiRoute(req);

  if (route === 'new-orders') {
    return newOrdersHandler(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
}
