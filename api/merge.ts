import type { VercelRequest, VercelResponse } from '@vercel/node';
import candidatesHandler from '../src/server-handlers/merge/candidates.js';
import candidatesCountHandler from '../src/server-handlers/merge/candidates-count.js';
import confirmHandler from '../src/server-handlers/merge/confirm.js';
import generateCandidatesHandler from '../src/server-handlers/merge/generate-candidates.js';
import rejectHandler from '../src/server-handlers/merge/reject.js';

function normalizeRoutePath(pathValue: string | string[] | undefined) {
  if (Array.isArray(pathValue)) {
    return pathValue.join('/');
  }

  return pathValue ?? '';
}

function getMergeRoute(req: VercelRequest) {
  const queryRoute = normalizeRoutePath(req.query?.path as string | string[] | undefined);
  if (queryRoute) {
    return queryRoute.replace(/^\/+|\/+$/g, '');
  }

  const pathname = new URL(req.url ?? '/api/merge', 'http://localhost').pathname;
  return pathname.replace(/^\/api\/merge\/?/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getMergeRoute(req);

  if (route === 'candidates') {
    return candidatesHandler(req, res);
  }

  if (route === 'candidates/count') {
    return candidatesCountHandler(req, res);
  }

  if (route === 'confirm') {
    return confirmHandler(req, res);
  }

  if (route === 'generate-candidates') {
    return generateCandidatesHandler(req, res);
  }

  if (route === 'reject') {
    return rejectHandler(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
}
