import { NextResponse } from 'next/server';
import { query } from '@/lib/server/database';
import { getBackendBaseUrl } from '@/lib/server/env';

export const runtime = 'nodejs';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
    const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
    const detail = 'detail' in error && typeof error.detail === 'string' ? error.detail : '';

    return [name, code, detail].filter(Boolean).join(': ') || 'Unknown error';
  }

  return 'Unknown error';
}

export async function GET() {
  const checks: Record<string, Record<string, string>> = {
    app: { status: 'ok' },
    authDatabase: { status: 'ok' },
    backend: { status: 'ok' },
  };

  let status = 200;

  try {
    await query('SELECT 1');
  } catch (error) {
    status = 503;
    checks.authDatabase = {
      status: 'error',
      error: getErrorMessage(error),
    };
  }

  try {
    const response = await fetch(`${getBackendBaseUrl()}/health/ready`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Backend readiness check failed with status ${response.status}.`);
    }
  } catch (error) {
    status = 503;
    checks.backend = {
      status: 'error',
      error: getErrorMessage(error),
    };
  }

  return NextResponse.json(
    {
      status: status === 200 ? 'ok' : 'error',
      checks,
    },
    { status }
  );
}
