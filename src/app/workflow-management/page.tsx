import AppLayout from '@/components/AppLayout';
import BackendServiceNotice from '@/components/BackendServiceNotice';
import WorkflowTable from './components/WorkflowTable';
import { requireUser } from '@/lib/server/auth';
import { getBackendFailureMessage, listWorkflows } from '@/lib/server/workflow-service';
import type { WorkflowListItem } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function WorkflowManagementPage() {
  const user = await requireUser();
  let workflows: WorkflowListItem[] = [];
  let backendFailureMessage: string | null = null;

  try {
    workflows = await listWorkflows(user.id);
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
          title="Workflow Management Unavailable"
          message={`The workflow list could not be loaded. ${backendFailureMessage}`}
        />
      ) : (
        <WorkflowTable initialWorkflows={workflows} />
      )}
    </AppLayout>
  );
}
