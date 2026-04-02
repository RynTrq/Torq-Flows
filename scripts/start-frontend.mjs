import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const standaloneServerPath = path.join(process.cwd(), '.next', 'standalone', 'server.js');

if (!existsSync(standaloneServerPath)) {
  console.error(
    '[start] Missing .next/standalone/server.js. Build the frontend first with `npm run build`.',
  );
  process.exit(1);
}

const env = {
  ...process.env,
  HOSTNAME: process.env.HOSTNAME || '0.0.0.0',
  PORT: process.env.PORT || '4028',
};

const child = spawn(process.execPath, [standaloneServerPath], {
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
