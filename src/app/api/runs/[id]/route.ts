import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/server/auth';
import { BackendApiError, getRunById } from '@/lib/server/workflow-service';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const run = await getRunById(user.id, id);

    if (!run) {
      return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
    }

    return NextResponse.json({ run });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load run.';
    return NextResponse.json(
      { error: message },
      { status: error instanceof BackendApiError ? error.status : 400 }
    );
  }
}
