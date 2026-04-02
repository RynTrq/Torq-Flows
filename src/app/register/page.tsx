import React from 'react';
import { redirect } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import AuthForm from '@/components/auth/AuthForm';
import { getCurrentUser } from '@/lib/server/auth';
import { APP_NAME } from '@/lib/brand';

export const metadata = {
  title: `Create Account | ${APP_NAME}`,
};

export default async function RegisterPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect('/workflow-management');
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-4">
            <AppLogo size={88} />
          </div>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">Create your workspace</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Register a new account to save workflows, inspect executions, and secure {APP_NAME}
            with database-backed sessions.
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 backdrop-blur px-6 py-6 shadow-2xl">
          <AuthForm mode="register" />
        </div>
      </div>
    </div>
  );
}
