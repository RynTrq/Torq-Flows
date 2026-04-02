'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Search,
  ChevronRight,
  X,
  RefreshCw,
  Clock,
  Copy,
  Play,
  Square,
  GitBranch,
  Globe,
  Loader2,
  Terminal,
  Activity,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import type { RunStatus, WorkflowRun } from '@/lib/types';

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function prettyPrintJson(rawJson: string) {
  try {
    return JSON.stringify(JSON.parse(rawJson), null, 2);
  } catch {
    return rawJson;
  }
}

const nodeTypeIcons: Record<string, React.ElementType> = {
  manual_trigger: Play,
  webhook_trigger: Globe,
  decision: GitBranch,
  wait: Clock,
  api_call: Terminal,
  end: Square,
};

const nodeTypeColors: Record<string, string> = {
  manual_trigger: 'text-emerald-400',
  webhook_trigger: 'text-purple-400',
  decision: 'text-amber-400',
  wait: 'text-blue-400',
  api_call: 'text-violet-400',
  end: 'text-red-400',
};

const nodeStatusStyles: Record<string, string> = {
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  running: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  skipped: 'bg-zinc-700/30 text-zinc-500 border-zinc-700/30',
  pending: 'bg-zinc-800/50 text-zinc-600 border-zinc-700/30',
};

interface RunsTableProps {
  initialRuns: WorkflowRun[];
}

export default function RunsTable({ initialRuns }: RunsTableProps) {
  const [runs, setRuns] = useState(initialRuns);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RunStatus | 'all'>('all');
  const [workflowFilter, setWorkflowFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const perPage = 10;

  useEffect(() => {
    setRuns(initialRuns);
  }, [initialRuns]);

  const uniqueWorkflows = useMemo(() => {
    const names = [...new Set(runs.map((run) => run.workflowName))];
    return names.sort();
  }, [runs]);

  const filtered = useMemo(() => {
    return runs.filter((run) => {
      if (search) {
        const query = search.toLowerCase();
        const matchesSearch =
          run.workflowName.toLowerCase().includes(query) ||
          run.id.toLowerCase().includes(query) ||
          run.temporalRunId.toLowerCase().includes(query);

        if (!matchesSearch) {
          return false;
        }
      }

      if (statusFilter !== 'all' && run.status !== statusFilter) {
        return false;
      }

      if (workflowFilter !== 'all' && run.workflowName !== workflowFilter) {
        return false;
      }

      return true;
    });
  }, [runs, search, statusFilter, workflowFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const refreshRuns = async () => {
    setRefreshing(true);

    try {
      const response = await fetch('/api/runs', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as { runs?: WorkflowRun[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not refresh runs.');
      }

      setRuns(payload.runs ?? []);
      toast.success('Run history refreshed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not refresh runs.');
    } finally {
      setRefreshing(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Run History</h2>
          <p className="text-[11px] text-zinc-600 mt-0.5">
            {filtered.length} run{filtered.length !== 1 ? 's' : ''} · click a row to expand logs
          </p>
        </div>
        <button
          onClick={refreshRuns}
          disabled={refreshing}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all duration-150 disabled:opacity-50"
          title="Refresh run history"
        >
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-900/50 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search run ID, workflow..."
            className="w-full bg-zinc-950 border border-zinc-700 rounded-md pl-7 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as RunStatus | 'all');
            setPage(1);
          }}
          className="bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
        >
          <option value="all">All statuses</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="queued">Queued</option>
          <option value="cancelled">Cancelled</option>
          <option value="timed_out">Timed Out</option>
        </select>
        <select
          value={workflowFilter}
          onChange={(event) => {
            setWorkflowFilter(event.target.value);
            setPage(1);
          }}
          className="bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500 max-w-[180px] truncate"
        >
          <option value="all">All workflows</option>
          {uniqueWorkflows.map((workflowName) => (
            <option key={`wf-filter-${workflowName}`} value={workflowName}>
              {workflowName}
            </option>
          ))}
        </select>
        {(search || statusFilter !== 'all' || workflowFilter !== 'all') && (
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('all');
              setWorkflowFilter('all');
            }}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
          >
            <X size={10} /> Clear
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="w-8 px-4 py-2.5" />
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 w-24">
                Run ID
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 min-w-[180px]">
                Workflow
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 w-24">
                Status
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 w-20">
                Trigger
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 w-24">
                Started
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 w-24">
                Duration
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 w-32">
                Progress
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 w-24">
                Runtime ID
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center">
                  <Activity size={32} className="text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500 text-sm font-medium">No runs found</p>
                  <p className="text-zinc-700 text-xs mt-1">Try adjusting your filters</p>
                </td>
              </tr>
            ) : (
              paginated.map((run) => (
                <RunRow
                  key={run.id}
                  run={run}
                  expanded={expandedRows.has(run.id)}
                  onToggle={() => toggleExpand(run.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800">
        <span className="text-xs text-zinc-600">
          {Math.min((page - 1) * perPage + 1, filtered.length)}–
          {Math.min(page * perPage, filtered.length)} of {filtered.length} runs
        </span>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={`runpage-${pageNumber}`}
              onClick={() => setPage(pageNumber)}
              className={`w-7 h-7 rounded text-xs font-medium transition-all duration-150 ${
                pageNumber === page
                  ? 'bg-emerald-600 text-white'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {pageNumber}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RunRow({
  run,
  expanded,
  onToggle,
}: {
  run: WorkflowRun;
  expanded: boolean;
  onToggle: () => void;
}) {
  const progressPct = run.nodeCount > 0 ? (run.nodesCompleted / run.nodeCount) * 100 : 0;

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors duration-100 ${
          expanded ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/30'
        }`}
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <ChevronRight
            size={13}
            className={`text-zinc-600 transition-transform duration-150 ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        </td>

        <td className="px-3 py-3">
          <span className="text-xs font-mono text-zinc-400">{run.id}</span>
        </td>

        <td className="px-3 py-3">
          <p className="text-sm font-medium text-zinc-100 truncate max-w-[200px]">
            {run.workflowName}
          </p>
          {run.errorMessage && (
            <p className="text-[10px] text-red-400 truncate max-w-[200px] mt-0.5">
              {run.errorMessage}
            </p>
          )}
        </td>

        <td className="px-3 py-3">
          <StatusBadge status={run.status} />
        </td>

        <td className="px-3 py-3">
          <div className="flex items-center gap-1.5">
            {run.triggerType === 'webhook' ? (
              <Globe size={11} className="text-purple-400" />
            ) : (
              <Play size={11} className="text-emerald-400" />
            )}
            <span className="text-xs text-zinc-500 capitalize">{run.triggerType}</span>
          </div>
        </td>

        <td className="px-3 py-3">
          <span className="text-xs font-mono text-zinc-500">
            {formatRelativeTime(run.startedAt)}
          </span>
        </td>

        <td className="px-3 py-3">
          <span className="text-xs font-mono text-zinc-400 tabular-nums">
            {run.status === 'running' ? (
              <span className="text-blue-400 flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" /> live
              </span>
            ) : (
              formatDuration(run.durationMs)
            )}
          </span>
        </td>

        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progressPct}%`,
                  background:
                    run.status === 'failed'
                      ? '#ef4444'
                      : run.status === 'timed_out'
                        ? '#f59e0b'
                        : run.status === 'running'
                          ? '#3b82f6'
                          : '#22c55e',
                }}
              />
            </div>
            <span className="text-[11px] font-mono text-zinc-600 tabular-nums">
              {run.nodesCompleted}/{run.nodeCount}
            </span>
          </div>
        </td>

        <td className="px-3 py-3">
          <button
            onClick={(event) => {
              event.stopPropagation();
              navigator.clipboard.writeText(run.temporalRunId);
              toast.success('Runtime execution ID copied');
            }}
            className="flex items-center gap-1 text-[10px] font-mono text-zinc-600 hover:text-zinc-300 transition-colors group"
            title="Copy runtime execution ID"
          >
            <span className="truncate max-w-[80px]">
              {run.temporalRunId.split('-').slice(0, 2).join('-')}
            </span>
            <Copy
              size={9}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            />
          </button>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={9} className="bg-zinc-950/60 border-b border-zinc-800">
            <div className="px-6 py-4 expand-down">
              <div className="mb-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">
                    Input Payload
                  </p>
                  <pre className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-[11px] font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap max-h-24">
                    {prettyPrintJson(run.inputPayload)}
                  </pre>
                </div>
                {run.finalOutput && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">
                      Final Output
                    </p>
                    <pre className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-[11px] font-mono text-emerald-400/80 overflow-x-auto whitespace-pre-wrap max-h-24">
                      {prettyPrintJson(run.finalOutput)}
                    </pre>
                  </div>
                )}
                {run.errorMessage && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1.5">
                      Error
                    </p>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      <p className="text-[11px] font-mono text-red-400">{run.errorMessage}</p>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">
                Node Execution Log
              </p>
              <div className="space-y-1.5">
                {run.nodeLogs.map((log, index) => {
                  const NodeIcon = nodeTypeIcons[log.nodeType] || Terminal;
                  const iconColor = nodeTypeColors[log.nodeType] || 'text-zinc-400';

                  return (
                    <div
                      key={log.id}
                      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${nodeStatusStyles[log.status]} bg-zinc-900/50`}
                    >
                      <span className="text-[10px] font-mono text-zinc-700 w-5 flex-shrink-0 pt-0.5">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <NodeIcon size={13} className={`${iconColor} flex-shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-zinc-200">{log.nodeLabel}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${nodeStatusStyles[log.status]}`}
                          >
                            {log.status}
                            {log.status === 'running' && (
                              <Loader2 size={9} className="inline ml-1 animate-spin" />
                            )}
                          </span>
                          {log.durationMs !== null && (
                            <span className="text-[10px] font-mono text-zinc-600">
                              {formatDuration(log.durationMs)}
                            </span>
                          )}
                          {log.startedAt && (
                            <span className="text-[10px] font-mono text-zinc-700">
                              {formatTime(log.startedAt)}
                            </span>
                          )}
                        </div>

                        {log.output && (
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-[11px] font-mono text-zinc-400">
                            {prettyPrintJson(log.output)}
                          </pre>
                        )}
                        {log.error && (
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1.5 text-[11px] font-mono text-red-400">
                            {log.error}
                          </pre>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
