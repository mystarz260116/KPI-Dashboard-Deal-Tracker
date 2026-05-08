import type { VercelRequest, VercelResponse } from '@vercel/node';
import boardHandler from '../../src/server-handlers/deals/board.js';
import closeMonthHandler from '../../src/server-handlers/deals/close-month.js';
import statusHandler from '../../src/server-handlers/deals/status.js';

function getDealsRoute(req: VercelRequest) {
  const pathname = new URL(req.url ?? '/api/deals', 'http://localhost').pathname;
  return pathname.replace(/^\/api\/deals\/?/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getDealsRoute(req);

  if (route === 'board') {
    return boardHandler(req, res);
  }

  if (route === 'status') {
    return statusHandler(req, res);
  }

  if (route === 'close-month') {
    return closeMonthHandler(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
}
