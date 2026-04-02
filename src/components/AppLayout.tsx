import React from 'react';
import Sidebar from './Sidebar';
import BackendServiceNotice from './BackendServiceNotice';
import { requireUser } from '@/lib/server/auth';
import { getAppShellCounts, getBackendFailureMessage } from '@/lib/server/workflow-service';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const user = await requireUser();
  let counts = {
    workflowCount: 0,
    activeRunCount: 0,
  };
  let backendFailureMessage: string | null = null;

  try {
    counts = await getAppShellCounts(user.id);
  } catch (error) {
    const message = getBackendFailureMessage(error);

    if (!message) {
      throw error;
    }

    backendFailureMessage = message;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <Sidebar user={user} counts={counts} />
      <main className="flex-1 overflow-auto min-w-0">
        {backendFailureMessage && (
          <BackendServiceNotice
            compact
            title="FastAPI Backend Issue"
            message={backendFailureMessage}
          />
        )}
        {children}
      </main>
    </div>
  );
}
