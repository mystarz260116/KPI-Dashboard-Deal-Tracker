import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const apiPort = process.env.LOCAL_API_PORT ?? '3000';
const webPort = process.env.LOCAL_WEB_PORT ?? '5173';

function run(command: string, args: string[], extraEnv: Record<string, string> = {}) {
  return spawn(command, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: 'inherit',
  });
}

const children: ChildProcess[] = [
  run('node', ['--import', 'tsx', 'scripts/local-api-server.ts'], {
    LOCAL_API_PORT: apiPort,
    LOCAL_AUTH_BYPASS: '1',
  }),
  run('./node_modules/.bin/vite', ['--host', '0.0.0.0', '--port', webPort], {
    LOCAL_API_PORT: apiPort,
    VITE_LOCAL_AUTH_BYPASS: 'true',
  }),
];

function shutdown(signal: NodeJS.Signals) {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

for (const child of children) {
  child.on('exit', code => {
    if (code && code !== 0) {
      shutdown('SIGTERM');
      process.exit(code);
    }
  });
}

console.log(`Web: http://127.0.0.1:${webPort}`);
console.log(`API: http://127.0.0.1:${apiPort}`);
