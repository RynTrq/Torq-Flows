import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/server/auth';
import {
  BackendApiError,
  deleteWorkflows,
  getWorkflowById,
  sanitizeWorkflowInput,
  updateWorkflowStatus,
  upsertWorkflow,
} from '@/lib/server/workflow-service';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const workflow = await getWorkflowById(user.id, id);

    if (!workflow) {
      return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });
    }

    return NextResponse.json({ workflow });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load workflow.';
    return NextResponse.json(
      { error: message },
      { status: error instanceof BackendApiError ? error.status : 400 }
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const status = body.status;

    if (
      typeof status === 'string' &&
      !('nodes' in body) &&
      !('edges' in body) &&
      !('name' in body)
    ) {
      const workflow = await updateWorkflowStatus(
        user.id,
        id,
        status as 'active' | 'draft' | 'archived'
      );

      if (!workflow) {
        return NextResponse.json({ error: 'Workflow not found.' }, { status: 404 });
      }

      return NextResponse.json({ workflow });
    }

    const input = sanitizeWorkflowInput(body);
    const workflow = await upsertWorkflow({
      userId: user.id,
      workflowId: id,
      name: input.name,
      status: input.status,
      nodes: input.nodes,
      edges: input.edges,
    });

    return NextResponse.json({ workflow });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow update failed.';
    return NextResponse.json(
      {
        error: message,
        validationErrors: error instanceof BackendApiError ? error.validationErrors : [],
      },
      { status: error instanceof BackendApiError ? error.status : 400 }
    );
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const input = sanitizeWorkflowInput(await request.json());
    const workflow = await upsertWorkflow({
      userId: user.id,
      workflowId: id,
      name: input.name,
      status: input.status,
      nodes: input.nodes,
      edges: input.edges,
    });

    return NextResponse.json({ workflow });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow update failed.';
    return NextResponse.json(
      {
        error: message,
        validationErrors: error instanceof BackendApiError ? error.validationErrors : [],
      },
      { status: error instanceof BackendApiError ? error.status : 400 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const deletedCount = await deleteWorkflows(user.id, [id]);
    return NextResponse.json({ deletedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow deletion failed.';
    return NextResponse.json(
      { error: message },
      { status: error instanceof BackendApiError ? error.status : 400 }
    );
  }
}
