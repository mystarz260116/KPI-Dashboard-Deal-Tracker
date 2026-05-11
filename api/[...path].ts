import type { VercelRequest, VercelResponse } from '@vercel/node';
import customersSyncAndGenerateHandler from '../src/server-handlers/customers/sync-and-generate-merge-candidates.js';
import customersSyncFromSalesImportHandler from '../src/server-handlers/customers/sync-from-sales-import.js';
import dealsBoardHandler from '../src/server-handlers/deals/board.js';
import dealsCloseMonthHandler from '../src/server-handlers/deals/close-month.js';
import dealsStatusHandler from '../src/server-handlers/deals/status.js';
import importSalesFinalizeHandler from '../src/server-handlers/import-sales/finalize.js';
import importSalesUploadHandler from '../src/server-handlers/import-sales/upload.js';
import kpiNewOrdersHandler from '../src/server-handlers/kpi/new-orders.js';
import mergeCandidatesHandler from '../src/server-handlers/merge/candidates.js';
import mergeCandidatesCountHandler from '../src/server-handlers/merge/candidates-count.js';
import mergeConfirmHandler from '../src/server-handlers/merge/confirm.js';
import mergeGenerateCandidatesHandler from '../src/server-handlers/merge/generate-candidates.js';
import mergeRejectHandler from '../src/server-handlers/merge/reject.js';

function getRoute(req: VercelRequest) {
  const pathname = new URL(req.url ?? '/api', 'http://localhost').pathname;
  return pathname.replace(/^\/api\/?/, '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getRoute(req);

  if (route === 'deals/board') {
    return dealsBoardHandler(req, res);
  }

  if (route === 'deals/status') {
    return dealsStatusHandler(req, res);
  }

  if (route === 'deals/close-month') {
    return dealsCloseMonthHandler(req, res);
  }

  if (route === 'merge/candidates') {
    return mergeCandidatesHandler(req, res);
  }

  if (route === 'merge/candidates/count') {
    return mergeCandidatesCountHandler(req, res);
  }

  if (route === 'merge/confirm') {
    return mergeConfirmHandler(req, res);
  }

  if (route === 'merge/generate-candidates') {
    return mergeGenerateCandidatesHandler(req, res);
  }

  if (route === 'merge/reject') {
    return mergeRejectHandler(req, res);
  }

  if (route === 'customers/sync-from-sales-import') {
    return customersSyncFromSalesImportHandler(req, res);
  }

  if (route === 'customers/sync-and-generate-merge-candidates') {
    return customersSyncAndGenerateHandler(req, res);
  }

  if (route === 'import/sales/upload') {
    return importSalesUploadHandler(req, res);
  }

  if (route === 'import/sales/finalize') {
    return importSalesFinalizeHandler(req, res);
  }

  if (route === 'kpi/new-orders') {
    return kpiNewOrdersHandler(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
}
