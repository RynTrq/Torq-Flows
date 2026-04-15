import React from 'react';
import { AlertTriangle, ServerCrash } from 'lucide-react';

interface BackendServiceNoticeProps {
  title?: string;
  message: string;
  compact?: boolean;
}

const recoverySteps =
  process.env.NODE_ENV === 'production'
    ? [
        'Check the frontend `/api/health` endpoint and the backend `/health/ready` endpoint.',
        'Verify `DATABASE_URL`, `BACKEND_API_URL`, and `TEMPORAL_ADDRESS` are configured correctly.',
        'Confirm the backend API service and Temporal worker are both healthy.',
      ]
    : [
        'Start the full local stack with `npm run dev`.',
        'Ensure `DATABASE_URL` is configured and PostgreSQL is reachable.',
        'If you are debugging one service at a time, you can still run `npm run backend:api` or `npm run backend:worker` separately.',
      ];

export default function BackendServiceNotice({
  title = 'Backend Service Unavailable',
  message,
  compact = false,
}: BackendServiceNoticeProps) {
  if (compact) {
    return (
      <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-3">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-amber-300">{title}</p>
            <p className="mt-0.5 text-xs text-amber-200/80">{message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-10">
      <div className="w-full max-w-2xl rounded-2xl border border-amber-500/20 bg-zinc-900 p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
            <ServerCrash size={22} className="text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-zinc-100">{title}</p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{message}</p>
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Recovery Steps
              </p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                {recoverySteps.map((step) => (
                  <li key={step} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
