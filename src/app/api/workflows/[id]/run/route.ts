import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/server/auth';
import { BackendApiError, runWorkflow } from '@/lib/server/workflow-service';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { id } = await params;
    const workflowRun = await runWorkflow(user.id, id, body.inputPayload ?? {});
    return NextResponse.json({ run: workflowRun }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow run failed.';
    return NextResponse.json(
      {
        error: message,
        validationErrors: error instanceof BackendApiError ? error.validationErrors : [],
      },
      { status: error instanceof BackendApiError ? error.status : 400 }
    );
  }
}
