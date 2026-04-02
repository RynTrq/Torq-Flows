import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';

const cwd = process.cwd();
const managedChildren = [];
let shuttingDown = false;

function log(message) {
  console.log(`[dev] ${message}`);
}

function logError(message) {
  console.error(`[dev] ${message}`);
}

function readDotenvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const values = {};
  const content = readFileSync(filePath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function loadProjectEnv() {
  return {
    ...readDotenvFile(path.join(cwd, '.env')),
    ...readDotenvFile(path.join(cwd, '.env.local')),
    ...process.env,
  };
}

const projectEnv = loadProjectEnv();

function resolveLocalPython() {
  const candidates = [
    path.join(cwd, '.venv', 'bin', 'python'),
    path.join(cwd, '.venv', 'Scripts', 'python.exe'),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveNextCli() {
  const candidate = path.join(
    cwd,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'next.cmd' : 'next'
  );

  return existsSync(candidate) ? candidate : 'next';
}

function resolveTemporalCli() {
  const candidates = [
    projectEnv.TEMPORAL_CLI_PATH,
    path.join(
      os.homedir(),
      '.temporalio',
      'bin',
      process.platform === 'win32' ? 'temporal.exe' : 'temporal'
    ),
    'temporal',
  ];

  return candidates.find((candidate) => candidate && (candidate === 'temporal' || existsSync(candidate))) ?? null;
}

function parseTemporalAddress() {
  const rawAddress = (projectEnv.TEMPORAL_ADDRESS || 'localhost:7233').trim();
  const withoutScheme = rawAddress.replace(/^[a-z]+:\/\//i, '');
  const [host = 'localhost', portValue = '7233'] = withoutScheme.split(':');
  const port = Number.parseInt(portValue, 10);

  return {
    host: host || 'localhost',
    port: Number.isFinite(port) ? port : 7233,
  };
}

function pipeWithPrefix(stream, prefix) {
  if (!stream) {
    return;
  }

  const reader = createInterface({ input: stream });
  reader.on('line', (line) => {
    console.log(`[${prefix}] ${line}`);
  });
}

function spawnManagedProcess(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    ...options,
  });

  pipeWithPrefix(child.stdout, name);
  pipeWithPrefix(child.stderr, name);

  child.on('error', (error) => {
    void shutdown(1, `${name} failed to start: ${error.message}`);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const status = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    void shutdown(code === 0 ? 1 : (code ?? 1), `${name} exited with ${status}`);
  });

  managedChildren.push(child);
  return child;
}

function killManagedProcess(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') {
        throw error;
      }
    }
  }

  child.kill(signal);
}

function listListeningPids(port) {
  try {
    const output = execFileSync('lsof', ['-ti', `tcp:${port}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    return output ? [...new Set(output.split(/\s+/).filter(Boolean))] : [];
  } catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 1) {
      return [];
    }

    return [];
  }
}

function isLocalAddress(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function waitForPort(host, port, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(host, port)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${host}:${port} to accept connections.`);
}

async function shutdown(exitCode = 0, reason = '') {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (reason) {
    logError(reason);
  }

  log('Shutting down dev stack...');

  for (const child of managedChildren) {
    killManagedProcess(child, 'SIGTERM');
  }

  await new Promise((resolve) => setTimeout(resolve, 1500));

  for (const child of managedChildren) {
    killManagedProcess(child, 'SIGKILL');
  }

  process.exit(exitCode);
}

async function main() {
  const python = resolveLocalPython();

  if (!python) {
    throw new Error(
      'Missing local virtualenv Python at .venv. Create it with `python3 -m venv .venv` and install backend dependencies first.'
    );
  }

  const nextCli = resolveNextCli();
  const temporalCli = resolveTemporalCli();
  const { host, port } = parseTemporalAddress();

  if (await isPortOpen('127.0.0.1', 4028)) {
    const pids = listListeningPids(4028);
    throw new Error(
      `Frontend port 4028 is already in use.${pids.length ? ` Listening PID${pids.length === 1 ? '' : 's'}: ${pids.join(', ')}.` : ''} Stop the existing process first, for example: lsof -ti tcp:4028 | xargs kill -9`
    );
  }

  if (await isPortOpen('127.0.0.1', 8000)) {
    const pids = listListeningPids(8000);
    throw new Error(
      `Backend API port 8000 is already in use.${pids.length ? ` Listening PID${pids.length === 1 ? '' : 's'}: ${pids.join(', ')}.` : ''} Stop the existing process first, for example: lsof -ti tcp:8000 | xargs kill -9`
    );
  }

  log(`Using Python: ${python}`);
  log(`Starting Next.js frontend on http://127.0.0.1:4028`);
  log(`Starting FastAPI backend on http://127.0.0.1:8000`);

  spawnManagedProcess('web', nextCli, ['dev', '-p', '4028']);
  spawnManagedProcess('api', python, [
    '-m',
    'uvicorn',
    'backend.app.main:app',
    '--host',
    '127.0.0.1',
    '--port',
    '8000',
    '--reload',
  ]);

  if (await isPortOpen(host, port)) {
    log(`Temporal is already running at ${host}:${port}`);
  } else if (!isLocalAddress(host)) {
    throw new Error(
      `Temporal is configured to use ${host}:${port}, but that address is not reachable. Start that server first or point TEMPORAL_ADDRESS at a local dev server.`
    );
  } else {
    if (!temporalCli) {
      throw new Error(
        'Temporal CLI was not found. Install it first, or set TEMPORAL_CLI_PATH to the binary location.'
      );
    }

    log(`Starting Temporal dev server on ${host}:${port}`);
    spawnManagedProcess('temporal', temporalCli, ['server', 'start-dev']);
    await waitForPort(host, port);
  }

  log('Starting Temporal worker');
  spawnManagedProcess('worker', python, ['-m', 'backend.app.worker']);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    void shutdown(0);
  });
}

main().catch((error) => {
  void shutdown(1, error instanceof Error ? error.message : String(error));
});
