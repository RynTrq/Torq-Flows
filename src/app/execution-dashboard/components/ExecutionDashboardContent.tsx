'use client';

import React, { useMemo, useState } from 'react';
import RunVolumeChart from './RunVolumeChart';
import RunsTable from './RunsTable';
import { Activity, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { WorkflowRun } from '@/lib/types';

const colorMap: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  blue: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    text: 'text-blue-400',
    icon: 'text-blue-400',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    icon: 'text-emerald-400',
  },
  red: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    text: 'text-red-400',
    icon: 'text-red-400',
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    icon: 'text-amber-400',
  },
};

const rangeConfig = {
  '1h': {
    bucketCount: 12,
    bucketMs: 5 * 60 * 1000,
    label: (date: Date) =>
      date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
  },
  '24h': {
    bucketCount: 24,
    bucketMs: 60 * 60 * 1000,
    label: (date: Date) => date.toLocaleTimeString('en-US', { hour: '2-digit', hour12: false }),
  },
  '7d': {
    bucketCount: 7,
    bucketMs: 24 * 60 * 60 * 1000,
    label: (date: Date) => date.toLocaleDateString('en-US', { weekday: 'short' }),
  },
  '30d': {
    bucketCount: 10,
    bucketMs: 3 * 24 * 60 * 60 * 1000,
    label: (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  },
} as const;

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function getRunsForRange(runs: WorkflowRun[], dateRange: keyof typeof rangeConfig) {
  const config = rangeConfig[dateRange];
  const cutoff = Date.now() - config.bucketCount * config.bucketMs;
  return runs.filter((run) => new Date(run.startedAt).getTime() >= cutoff);
}

function buildChartData(runs: WorkflowRun[], dateRange: keyof typeof rangeConfig) {
  const config = rangeConfig[dateRange];
  const start = Date.now() - config.bucketCount * config.bucketMs;

  return Array.from({ length: config.bucketCount }, (_, index) => {
    const bucketStart = start + index * config.bucketMs;
    const bucketEnd = bucketStart + config.bucketMs;
    const bucketRuns = runs.filter((run) => {
      const startedAt = new Date(run.startedAt).getTime();
      return startedAt >= bucketStart && startedAt < bucketEnd;
    });

    return {
      time: config.label(new Date(bucketStart)),
      completed: bucketRuns.filter((run) => run.status === 'completed').length,
      failed: bucketRuns.filter((run) => run.status === 'failed').length,
    };
  });
}

interface ExecutionDashboardContentProps {
  initialRuns: WorkflowRun[];
}

export default function ExecutionDashboardContent({ initialRuns }: ExecutionDashboardContentProps) {
  const [dateRange, setDateRange] = useState('24h');
  const runsForRange = useMemo(
    () => getRunsForRange(initialRuns, dateRange as keyof typeof rangeConfig),
    [dateRange, initialRuns]
  );
  const chartData = useMemo(
    () => buildChartData(initialRuns, dateRange as keyof typeof rangeConfig),
    [dateRange, initialRuns]
  );
  const activeRuns = initialRuns.filter((run) => ['running', 'queued'].includes(run.status)).length;
  const completedRuns24h = initialRuns.filter(
    (run) =>
      run.status === 'completed' &&
      Date.now() - new Date(run.startedAt).getTime() <= 24 * 60 * 60 * 1000
  );
  const failedToday = initialRuns.filter(
    (run) =>
      run.status === 'failed' &&
      Date.now() - new Date(run.startedAt).getTime() <= 24 * 60 * 60 * 1000
  ).length;
  const averageDuration =
    runsForRange.length > 0
      ? Math.round(
          runsForRange
            .filter((run) => typeof run.durationMs === 'number')
            .reduce((total, run) => total + (run.durationMs ?? 0), 0) /
            Math.max(1, runsForRange.filter((run) => typeof run.durationMs === 'number').length)
        )
      : null;
  const successRate24h =
    completedRuns24h.length === 0 && failedToday === 0
      ? null
      : (completedRuns24h.length / Math.max(1, completedRuns24h.length + failedToday)) * 100;
  const kpiCards = [
    {
      id: 'kpi-active',
      label: 'Active Runs',
      value: String(activeRuns),
      sub: activeRuns > 0 ? 'Runs are currently processing' : 'No active runs',
      icon: Activity,
      color: 'blue',
      alert: activeRuns > 0,
    },
    {
      id: 'kpi-success',
      label: 'Success Rate (24h)',
      value: successRate24h === null ? '—' : `${successRate24h.toFixed(1)}%`,
      sub: successRate24h === null ? 'No data yet' : `${completedRuns24h.length} completed runs`,
      icon: CheckCircle,
      color: 'emerald',
      alert: false,
    },
    {
      id: 'kpi-failed',
      label: 'Failed Today',
      value: String(failedToday),
      sub: failedToday > 0 ? 'Investigate failed workflows' : 'No failures',
      icon: XCircle,
      color: 'red',
      alert: failedToday > 0,
    },
    {
      id: 'kpi-duration',
      label: 'Avg Duration',
      value: averageDuration === null ? '—' : formatDuration(averageDuration),
      sub: runsForRange.length > 0 ? `${runsForRange.length} runs in range` : 'No data yet',
      icon: Clock,
      color: 'amber',
      alert: false,
    },
  ];

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Execution Dashboard</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Real-time run monitoring across workflows</p>
        </div>
        <div className="flex items-center gap-2">
          {['1h', '24h', '7d', '30d'].map((range) => (
            <button
              key={`range-${range}`}
              onClick={() => setDateRange(range)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-150 ${
                dateRange === range
                  ? 'bg-emerald-600 text-white'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 py-5 space-y-5 max-w-screen-2xl mx-auto w-full">
        {/* KPI Cards — 4 equal columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpiCards.map((card) => {
            const colors = colorMap[card.color];
            const CardIcon = card.icon;
            return (
              <div
                key={card.id}
                className={`rounded-xl border p-4 ${colors.bg} ${colors.border} relative overflow-hidden`}
              >
                {card.alert && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                )}
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    {card.label}
                  </p>
                  <CardIcon size={16} className={colors.icon} />
                </div>
                <p className={`text-3xl font-bold tabular-nums ${colors.text}`}>{card.value}</p>
                <p className="text-[11px] text-zinc-600 mt-1">{card.sub}</p>
              </div>
            );
          })}
        </div>

        {/* Chart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Run Volume</h2>
              <p className="text-[11px] text-zinc-600 mt-0.5">Completed vs failed runs over time</p>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-zinc-500">Completed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-zinc-500">Failed</span>
              </div>
            </div>
          </div>
          <RunVolumeChart data={chartData} />
        </div>

        {/* Runs table */}
        <RunsTable initialRuns={initialRuns} />
      </div>
    </div>
  );
}
