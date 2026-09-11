import type { VercelRequest, VercelResponse } from '@vercel/node';

function normalizeRoutePath(pathValue: string | string[] | undefined) {
  if (Array.isArray(pathValue)) {
    return pathValue.join('/');
  }

  return pathValue ?? '';
}

function getCustomersRoute(req: VercelRequest) {
  const queryRoute = normalizeRoutePath(req.query?.path as string | string[] | undefined);
  if (queryRoute) {
    return queryRoute.replace(/^\/+|\/+$/g, '');
  }

  const pathname = new URL(req.url ?? '/api/customers', 'http://localhost').pathname;
  return pathname.replace(/^\/api\/customers\/?/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getCustomersRoute(req);

  if (route === 'sync-from-sales-import' || route === 'sync-and-generate-merge-candidates') {
    return res.status(410).json({
      error: 'CSV由来の医院マスタ同期は廃止されました。入れ歯くん同期を使用してください。',
      code: 'LEGACY_CUSTOMER_SYNC_RETIRED',
    });
  }

  return res.status(404).json({ error: 'Not found' });
}
