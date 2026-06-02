import type { VercelRequest, VercelResponse } from '@vercel/node';
import boardHandler from '../src/server-handlers/deals/board.js';
import closeMonthHandler from '../src/server-handlers/deals/close-month.js';
import commentsHandler from '../src/server-handlers/deals/comments.js';
import notificationsCleanupHandler from '../src/server-handlers/deals/notifications-cleanup.js';
import notificationsHandler from '../src/server-handlers/deals/notifications.js';
import reactionsHandler from '../src/server-handlers/deals/reactions.js';
import statusHandler from '../src/server-handlers/deals/status.js';
import viewHandler from '../src/server-handlers/deals/view.js';

function normalizeRoutePath(pathValue: string | string[] | undefined) {
  if (Array.isArray(pathValue)) {
    return pathValue.join('/');
  }

  return pathValue ?? '';
}

function getDealsRoute(req: VercelRequest) {
  const queryRoute = normalizeRoutePath(req.query?.path as string | string[] | undefined);
  if (queryRoute) {
    return queryRoute.replace(/^\/+|\/+$/g, '');
  }

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

  if (route === 'comments') {
    return commentsHandler(req, res);
  }

  if (route === 'notifications') {
    return notificationsHandler(req, res);
  }

  if (route === 'notifications-cleanup') {
    return notificationsCleanupHandler(req, res);
  }

  if (route === 'reactions') {
    return reactionsHandler(req, res);
  }

  if (route === 'view') {
    return viewHandler(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
}
