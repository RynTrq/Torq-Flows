import { NextResponse } from 'next/server';
import { BackendApiError, runWorkflowFromWebhook } from '@/lib/server/workflow-service';

export const runtime = 'nodejs';

async function readPayload(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return {};
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody).entries());
  }

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawBody);
    } catch {
      throw new Error('Invalid JSON payload.');
    }
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return { rawBody };
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ path: string }> }) {
  try {
    const payload = await readPayload(request);
    const { path } = await params;
    const run = await runWorkflowFromWebhook(path, payload);
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook execution failed.';
    return NextResponse.json(
      {
        error: message,
        validationErrors: error instanceof BackendApiError ? error.validationErrors : [],
      },
      { status: error instanceof BackendApiError ? error.status : 400 }
    );
  }
}
