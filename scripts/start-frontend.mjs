import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const rootServerPath = path.join(process.cwd(), 'server.js');
const standaloneServerPath = path.join(process.cwd(), '.next', 'standalone', 'server.js');

const serverEntryPoint = existsSync(rootServerPath) ? rootServerPath : standaloneServerPath;

if (!existsSync(serverEntryPoint)) {
  console.error(
    '[start] Missing frontend server entrypoint. Build the frontend first with `npm run build`.',
  );
  process.exit(1);
}

const env = {
  ...process.env,
  HOSTNAME: process.env.HOSTNAME || '0.0.0.0',
  PORT: process.env.PORT || '4028',
};

const child = spawn(process.execPath, [serverEntryPoint], {
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
