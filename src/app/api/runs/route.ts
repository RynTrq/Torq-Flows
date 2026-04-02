import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/server/auth';
import { BackendApiError, listRuns } from '@/lib/server/workflow-service';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const runs = await listRuns(user.id);
    return NextResponse.json({ runs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load runs.';
    return NextResponse.json(
      { error: message },
      { status: error instanceof BackendApiError ? error.status : 400 }
    );
  }
}
