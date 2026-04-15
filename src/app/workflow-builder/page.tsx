import AppLayout from '@/components/AppLayout';
import BackendServiceNotice from '@/components/BackendServiceNotice';
import WorkflowBuilderCanvas from './components/WorkflowBuilderCanvas';
import { requireUser } from '@/lib/server/auth';
import { getBackendFailureMessage, getWorkflowById } from '@/lib/server/workflow-service';
import type { WorkflowDefinition } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function WorkflowBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const user = await requireUser();
  const { id } = await searchParams;
  let workflow: WorkflowDefinition | null = null;
  let backendFailureMessage: string | null = null;

  try {
    workflow = typeof id === 'string' ? await getWorkflowById(user.id, id) : null;
  } catch (error) {
    const message = getBackendFailureMessage(error);

    if (!message) {
      throw error;
    }

    backendFailureMessage = message;
  }

  return (
    <AppLayout>
      {backendFailureMessage ? (
        <BackendServiceNotice
          title="Workflow Builder Backend Unavailable"
          message={`The builder could not load workflow data. ${backendFailureMessage}`}
        />
      ) : (
        <WorkflowBuilderCanvas initialWorkflow={workflow} />
      )}
    </AppLayout>
  );
}
