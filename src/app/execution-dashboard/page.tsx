import AppLayout from '@/components/AppLayout';
import BackendServiceNotice from '@/components/BackendServiceNotice';
import ExecutionDashboardContent from './components/ExecutionDashboardContent';
import { requireUser } from '@/lib/server/auth';
import { getBackendFailureMessage, listRuns } from '@/lib/server/workflow-service';
import type { WorkflowRun } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ExecutionDashboardPage() {
  const user = await requireUser();
  let runs: WorkflowRun[] = [];
  let backendFailureMessage: string | null = null;

  try {
    runs = await listRuns(user.id);
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
          title="Execution Dashboard Unavailable"
          message={`Run history could not be loaded. ${backendFailureMessage}`}
        />
      ) : (
        <ExecutionDashboardContent initialRuns={runs} />
      )}
    </AppLayout>
  );
}
