import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/server/auth';
import {
  BackendApiError,
  deleteWorkflows,
  listWorkflows,
  sanitizeWorkflowInput,
  upsertWorkflow,
} from '@/lib/server/workflow-service';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const workflows = await listWorkflows(user.id);
    return NextResponse.json({ workflows });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load workflows.';
    return NextResponse.json(
      { error: message },
      { status: error instanceof BackendApiError ? error.status : 400 }
    );
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const input = sanitizeWorkflowInput(await request.json());
    const workflow = await upsertWorkflow({
      userId: user.id,
      name: input.name,
      status: input.status,
      nodes: input.nodes,
      edges: input.edges,
    });

    return NextResponse.json({ workflow }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow could not be created.';
    return NextResponse.json(
      {
        error: message,
        validationErrors: error instanceof BackendApiError ? error.validationErrors : [],
      },
      { status: error instanceof BackendApiError ? error.status : 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string')
      : [];
    const deletedCount = await deleteWorkflows(user.id, ids);
    return NextResponse.json({ deletedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow deletion failed.';
    return NextResponse.json(
      { error: message },
      { status: error instanceof BackendApiError ? error.status : 400 }
    );
  }
}
