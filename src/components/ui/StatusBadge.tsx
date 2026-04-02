import React from 'react';

type StatusVariant =
  | 'running'
  | 'completed'
  | 'failed'
  | 'queued'
  | 'cancelled'
  | 'timed_out'
  | 'active'
  | 'draft'
  | 'archived';

const variantStyles: Record<StatusVariant, string> = {
  running: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  queued: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  cancelled: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  timed_out: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  draft: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  archived: 'bg-zinc-700/30 text-zinc-500 border-zinc-700/30',
};

const dotStyles: Record<StatusVariant, string> = {
  running: 'bg-blue-400 animate-pulse',
  completed: 'bg-emerald-400',
  failed: 'bg-red-400',
  queued: 'bg-zinc-400',
  cancelled: 'bg-orange-400',
  timed_out: 'bg-amber-400',
  active: 'bg-emerald-400',
  draft: 'bg-zinc-400',
  archived: 'bg-zinc-600',
};

const labels: Record<StatusVariant, string> = {
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  queued: 'Queued',
  cancelled: 'Cancelled',
  timed_out: 'Timed Out',
  active: 'Active',
  draft: 'Draft',
  archived: 'Archived',
};

interface StatusBadgeProps {
  status: StatusVariant;
  showDot?: boolean;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, showDot = true, size = 'sm' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${variantStyles[status]} ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
    >
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotStyles[status]}`} />
      )}
      {labels[status]}
    </span>
  );
}
