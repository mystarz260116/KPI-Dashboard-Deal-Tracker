import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const port = Number(process.env.LOCAL_API_PORT ?? 3000);

async function loadEnvFile(filePath: string) {
  try {
    const raw = await readFile(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key] != null) continue;

      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function loadEnv() {
  await loadEnvFile(path.join(projectRoot, '.env'));
  await loadEnvFile(path.join(projectRoot, '.env.local'));
}

function collectBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseBody(rawBody: string, contentType: string | undefined) {
  if (!rawBody) return undefined;
  if (contentType?.includes('application/json')) {
    return JSON.parse(rawBody);
  }
  return rawBody;
}

function createVercelLikeResponse(res: ServerResponse) {
  return {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      res.setHeader(name, value);
      return this;
    },
    json(payload: unknown) {
      if (!res.getHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(payload));
      return this;
    },
    end(payload?: string) {
      res.end(payload);
      return this;
    },
  };
}

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveHandler(apiPathname: string) {
  const relativeApiPath = apiPathname.replace(/^\/api\//, '');
  const exactPath = path.join(projectRoot, 'api', `${relativeApiPath}.ts`);
  let filePath = exactPath;

  if (!(await pathExists(exactPath))) {
    const segments = relativeApiPath.split('/').filter(Boolean);

    if (segments.length > 1) {
      const topLevelPath = path.join(projectRoot, 'api', `${segments[0]}.ts`);
      if (await pathExists(topLevelPath)) {
        filePath = topLevelPath;
      }
    }

    if (filePath !== exactPath) {
      const moduleUrl = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
      const mod = await import(moduleUrl);
      return mod.default;
    }

    let matchedCatchAllPath: string | null = null;

    for (let index = segments.length; index >= 1; index -= 1) {
      const requiredCatchAllPath = path.join(
        projectRoot,
        'api',
        ...segments.slice(0, index),
        '[...path].ts'
      );

      if (await pathExists(requiredCatchAllPath)) {
        matchedCatchAllPath = requiredCatchAllPath;
        break;
      }

      const candidatePath = path.join(
        projectRoot,
        'api',
        ...segments.slice(0, index),
        '[[...path]].ts'
      );

      if (await pathExists(candidatePath)) {
        matchedCatchAllPath = candidatePath;
        break;
      }
    }

    if (!matchedCatchAllPath) {
      throw new Error(`API handler not found for ${apiPathname}`);
    }

    filePath = matchedCatchAllPath;
  }

  const moduleUrl = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
  const mod = await import(moduleUrl);
  return mod.default;
}

async function start() {
  await loadEnv();

  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (!requestUrl.pathname.startsWith('/api/')) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    try {
      const handler = await resolveHandler(requestUrl.pathname);
      const rawBody = await collectBody(req);
      const vercelReq = {
        method: req.method,
        query: Object.fromEntries(requestUrl.searchParams.entries()),
        body: parseBody(rawBody, req.headers['content-type']),
        headers: req.headers,
        url: req.url,
      };

      await handler(vercelReq, createVercelLikeResponse(res));
    } catch (error) {
      console.error('Local API server error:', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify({ error: 'Local API server failed' }));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Local API server running on http://127.0.0.1:${port}`);
  });
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
