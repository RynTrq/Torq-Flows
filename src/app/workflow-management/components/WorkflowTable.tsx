'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Search,
  Plus,
  Play,
  Copy,
  Edit2,
  Archive,
  MoreHorizontal,
  Globe,
  Zap,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  CheckCircle,
  XCircle,
  Clock,
  GitBranch,
  Loader2,
  Trash2,
  ExternalLink,
  Filter,
  X,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import type { RunStatus, TriggerType, WorkflowListItem, WorkflowStatus } from '@/lib/types';

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

type SortKey = keyof WorkflowListItem;
type SortDir = 'asc' | 'desc';

interface WorkflowTableProps {
  initialWorkflows: WorkflowListItem[];
}

export default function WorkflowTable({ initialWorkflows }: WorkflowTableProps) {
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | 'all'>('all');
  const [triggerFilter, setTriggerFilter] = useState<TriggerType | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [runningId, setRunningId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setWorkflows(initialWorkflows);
  }, [initialWorkflows]);

  const filtered = useMemo(() => {
    const result = [...workflows];

    const filteredWorkflows = result.filter((workflow) => {
      if (search) {
        const query = search.toLowerCase();
        const matchesSearch =
          workflow.name.toLowerCase().includes(query) ||
          workflow.description.toLowerCase().includes(query);

        if (!matchesSearch) {
          return false;
        }
      }

      if (statusFilter !== 'all' && workflow.status !== statusFilter) {
        return false;
      }

      if (triggerFilter !== 'all' && workflow.triggerType !== triggerFilter) {
        return false;
      }

      return true;
    });

    filteredWorkflows.sort((left, right) => {
      const leftValue = left[sortKey] ?? '';
      const rightValue = right[sortKey] ?? '';
      const comparison = String(leftValue).localeCompare(String(rightValue), undefined, {
        numeric: true,
      });
      return sortDir === 'asc' ? comparison : -comparison;
    });

    return filteredWorkflows;
  }, [search, sortDir, sortKey, statusFilter, triggerFilter, workflows]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const loadWorkflows = async () => {
    setRefreshing(true);

    try {
      const response = await fetch('/api/workflows', {
        cache: 'no-store',
      });
      const payload = (await response.json()) as { workflows?: WorkflowListItem[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not refresh workflows.');
      }

      setWorkflows(payload.workflows ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not refresh workflows.');
    } finally {
      setRefreshing(false);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDir('asc');
  };

  const toggleRow = (id: string) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === paginated.length) {
      setSelectedRows(new Set());
      return;
    }

    setSelectedRows(new Set(paginated.map((workflow) => workflow.id)));
  };

  const handleRun = async (workflow: WorkflowListItem) => {
    setRunningId(workflow.id);
    setOpenMenuId(null);

    try {
      const isWebhookWorkflow = workflow.triggerType === 'webhook';
      const response = await fetch(
        isWebhookWorkflow
          ? `/api/webhooks/${workflow.webhookPath ?? workflow.id}`
          : `/api/workflows/${workflow.id}/run`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: isWebhookWorkflow ? JSON.stringify({}) : JSON.stringify({ inputPayload: {} }),
        }
      );

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Run could not be started.');
      }

      toast.success(
        isWebhookWorkflow
          ? `Webhook trigger sent for "${workflow.name}"`
          : `Run started for "${workflow.name}"`
      );
      await loadWorkflows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Run could not be started.');
    } finally {
      setRunningId(null);
    }
  };

  const handleCopyWebhook = async (workflow: WorkflowListItem) => {
    if (!workflow.webhookPath) {
      toast.error('Save a webhook trigger workflow before copying its endpoint.');
      return;
    }

    const webhookUrl = `${window.location.origin}/api/webhooks/${workflow.webhookPath}`;
    await navigator.clipboard.writeText(webhookUrl);
    toast.success('Webhook URL copied to clipboard');
    setOpenMenuId(null);
  };

  const handleArchive = async (workflow: WorkflowListItem) => {
    try {
      const response = await fetch(`/api/workflows/${workflow.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'archived',
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Workflow could not be archived.');
      }

      toast.success(`"${workflow.name}" archived`);
      setOpenMenuId(null);
      await loadWorkflows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Workflow could not be archived.');
    }
  };

  const handleDelete = async (workflowIds: string[]) => {
    if (workflowIds.length === 0) {
      return;
    }

    try {
      const response = await fetch('/api/workflows', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: workflowIds,
        }),
      });

      const payload = (await response.json()) as { deletedCount?: number; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Workflow deletion failed.');
      }

      toast.success(
        payload.deletedCount === 1
          ? 'Workflow deleted'
          : `${payload.deletedCount ?? workflowIds.length} workflows deleted`
      );
      setSelectedRows(new Set());
      setOpenMenuId(null);
      await loadWorkflows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Workflow deletion failed.');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown size={11} className="text-zinc-700" />;
    return sortDir === 'asc' ? (
      <ChevronUp size={11} className="text-emerald-400" />
    ) : (
      <ChevronDown size={11} className="text-emerald-400" />
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Workflows</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {workflows.filter((workflow) => workflow.status === 'active').length} active ·{' '}
            {workflows.length} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadWorkflows}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-700 transition-all duration-150 disabled:opacity-50"
          >
            {refreshing ? <Loader2 size={13} className="animate-spin" /> : <Clock size={13} />}
            Refresh
          </button>
          <Link
            href="/workflow-builder"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-150 active:scale-95"
          >
            <Plus size={13} />
            New Workflow
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b border-zinc-800 bg-zinc-900/50 flex-shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search workflows..."
            className="w-full bg-zinc-950 border border-zinc-700 rounded-md pl-7 pr-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300"
            >
              <X size={11} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter size={12} className="text-zinc-600" />
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as WorkflowStatus | 'all');
              setPage(1);
            }}
            className="bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <select
            value={triggerFilter}
            onChange={(event) => {
              setTriggerFilter(event.target.value as TriggerType | 'all');
              setPage(1);
            }}
            className="bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All triggers</option>
            <option value="manual">Manual</option>
            <option value="webhook">Webhook</option>
          </select>
        </div>

        {(statusFilter !== 'all' || triggerFilter !== 'all' || search) && (
          <button
            onClick={() => {
              setStatusFilter('all');
              setTriggerFilter('all');
              setSearch('');
            }}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors"
          >
            <X size={10} /> Clear filters
          </button>
        )}
      </div>

      {selectedRows.size > 0 && (
        <div className="flex items-center gap-3 px-6 py-2 bg-emerald-500/10 border-b border-emerald-500/20 flex-shrink-0">
          <span className="text-xs font-medium text-emerald-400">{selectedRows.size} selected</span>
          <button
            onClick={() => handleDelete(Array.from(selectedRows))}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-red-400 hover:bg-red-500/10 transition-all duration-150"
          >
            <Trash2 size={12} />
            Delete
          </button>
          <button
            onClick={() => setSelectedRows(new Set())}
            className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 z-10">
            <tr>
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedRows.size === paginated.length && paginated.length > 0}
                  onChange={toggleAll}
                  className="rounded border-zinc-700 bg-zinc-950 accent-emerald-500"
                />
              </th>
              {[
                { key: 'name' as SortKey, label: 'Name', width: 'min-w-[220px]' },
                { key: 'status' as SortKey, label: 'Status', width: 'w-24' },
                { key: 'triggerType' as SortKey, label: 'Trigger', width: 'w-24' },
                { key: 'nodeCount' as SortKey, label: 'Nodes', width: 'w-20' },
                { key: 'lastRunStatus' as SortKey, label: 'Last Run', width: 'w-28' },
                { key: 'lastRunAt' as SortKey, label: 'Last Run At', width: 'w-28' },
                { key: 'totalRuns' as SortKey, label: 'Total Runs', width: 'w-24' },
                { key: 'successRate' as SortKey, label: 'Success %', width: 'w-24' },
                { key: 'updatedAt' as SortKey, label: 'Updated', width: 'w-24' },
              ].map((column) => (
                <th
                  key={`th-${column.key}`}
                  onClick={() => toggleSort(column.key)}
                  className={`${column.width} px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors select-none`}
                >
                  <div className="flex items-center gap-1">
                    {column.label}
                    <SortIcon col={column.key} />
                  </div>
                </th>
              ))}
              <th className="w-16 px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-20 text-center">
                  <Zap size={36} className="text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500 text-sm font-medium">No workflows found</p>
                  <p className="text-zinc-700 text-xs mt-1">
                    {search || statusFilter !== 'all' || triggerFilter !== 'all'
                      ? 'Try adjusting your filters'
                      : 'Create your first workflow to get started'}
                  </p>
                  {!search && statusFilter === 'all' && triggerFilter === 'all' && (
                    <Link
                      href="/workflow-builder"
                      className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-150"
                    >
                      <Plus size={12} /> Create Workflow
                    </Link>
                  )}
                </td>
              </tr>
            ) : (
              paginated.map((workflow) => (
                <WorkflowRow
                  key={workflow.id}
                  workflow={workflow}
                  selected={selectedRows.has(workflow.id)}
                  onToggle={() => toggleRow(workflow.id)}
                  isRunning={runningId === workflow.id}
                  onRun={() => handleRun(workflow)}
                  onCopyWebhook={() => handleCopyWebhook(workflow)}
                  onArchive={() => handleArchive(workflow)}
                  onDelete={() => handleDelete([workflow.id])}
                  menuOpen={openMenuId === workflow.id}
                  onMenuToggle={() =>
                    setOpenMenuId((current) => (current === workflow.id ? null : workflow.id))
                  }
                  formatRelativeTime={formatRelativeTime}
                  formatDate={formatDate}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-6 py-3 border-t border-zinc-800 bg-zinc-900 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            Showing {Math.min((page - 1) * perPage + 1, filtered.length)}–
            {Math.min(page * perPage, filtered.length)} of {filtered.length}
          </span>
          <select
            value={perPage}
            onChange={(event) => {
              setPerPage(Number(event.target.value));
              setPage(1);
            }}
            className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-400 focus:outline-none"
          >
            {[10, 20, 50].map((pageSize) => (
              <option key={`pp-${pageSize}`} value={pageSize}>
                {pageSize} / page
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={`page-${pageNumber}`}
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

function WorkflowRow({
  workflow,
  selected,
  onToggle,
  isRunning,
  onRun,
  onCopyWebhook,
  onArchive,
  onDelete,
  menuOpen,
  onMenuToggle,
  formatRelativeTime,
  formatDate,
}: {
  workflow: WorkflowListItem;
  selected: boolean;
  onToggle: () => void;
  isRunning: boolean;
  onRun: () => void;
  onCopyWebhook: () => void;
  onArchive: () => void;
  onDelete: () => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
  formatRelativeTime: (isoString: string | null) => string;
  formatDate: (isoString: string) => string;
}) {
  const router = useRouter();
  const runStatusColor: Record<RunStatus, string> = {
    completed: 'text-emerald-400',
    failed: 'text-red-400',
    running: 'text-blue-400',
    queued: 'text-zinc-400',
    cancelled: 'text-orange-400',
    timed_out: 'text-amber-400',
  };

  const runStatusIcon: Record<RunStatus, React.ElementType> = {
    completed: CheckCircle,
    failed: XCircle,
    running: Loader2,
    queued: Clock,
    cancelled: X,
    timed_out: Clock,
  };

  const LastRunIcon = workflow.lastRunStatus ? runStatusIcon[workflow.lastRunStatus] : null;
  const workflowEditorHref = `/workflow-builder?id=${workflow.id}`;

  const openWorkflow = () => {
    router.push(workflowEditorHref);
  };

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={openWorkflow}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openWorkflow();
        }
      }}
      className={`group transition-colors duration-100 ${
        selected ? 'bg-emerald-500/5' : 'hover:bg-zinc-800/40'
      } cursor-pointer focus:outline-none focus-visible:bg-zinc-800/50`}
    >
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(event) => event.stopPropagation()}
          className="rounded border-zinc-700 bg-zinc-950 accent-emerald-500"
        />
      </td>

      <td className="px-3 py-3">
        <div>
          <Link
            href={workflowEditorHref}
            onClick={(event) => event.stopPropagation()}
            className="block text-sm font-medium text-zinc-100 truncate max-w-[210px] hover:text-emerald-300 transition-colors"
          >
            {workflow.name}
          </Link>
          <p className="text-[11px] text-zinc-600 truncate max-w-[210px] mt-0.5">
            {workflow.description}
          </p>
        </div>
      </td>

      <td className="px-3 py-3">
        <StatusBadge status={workflow.status} />
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          {workflow.triggerType === 'webhook' ? (
            <Globe size={12} className="text-purple-400" />
          ) : (
            <Play size={12} className="text-emerald-400" />
          )}
          <span className="text-xs text-zinc-400 capitalize">{workflow.triggerType}</span>
        </div>
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <GitBranch size={11} className="text-zinc-600" />
          <span className="text-xs font-mono text-zinc-300">{workflow.nodeCount}</span>
        </div>
      </td>

      <td className="px-3 py-3">
        {workflow.lastRunStatus && LastRunIcon ? (
          <div className="flex items-center gap-1.5">
            <LastRunIcon
              size={12}
              className={`${runStatusColor[workflow.lastRunStatus]} ${
                workflow.lastRunStatus === 'running' ? 'animate-spin' : ''
              }`}
            />
            <span className={`text-xs capitalize ${runStatusColor[workflow.lastRunStatus]}`}>
              {workflow.lastRunStatus.replace('_', ' ')}
            </span>
          </div>
        ) : (
          <span className="text-xs text-zinc-700">No runs</span>
        )}
      </td>

      <td className="px-3 py-3">
        <span className="text-xs font-mono text-zinc-500">
          {formatRelativeTime(workflow.lastRunAt)}
        </span>
      </td>

      <td className="px-3 py-3">
        <span className="text-xs font-mono text-zinc-300 tabular-nums">
          {workflow.totalRuns.toLocaleString()}
        </span>
      </td>

      <td className="px-3 py-3">
        {workflow.totalRuns > 0 ? (
          <div className="flex items-center gap-2">
            <div className="w-14 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${workflow.successRate}%`,
                  background:
                    workflow.successRate >= 95
                      ? '#22c55e'
                      : workflow.successRate >= 80
                        ? '#f59e0b'
                        : '#ef4444',
                }}
              />
            </div>
            <span
              className={`text-xs font-mono tabular-nums ${
                workflow.successRate >= 95
                  ? 'text-emerald-400'
                  : workflow.successRate >= 80
                    ? 'text-amber-400'
                    : 'text-red-400'
              }`}
            >
              {workflow.successRate.toFixed(1)}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-zinc-700">—</span>
        )}
      </td>

      <td className="px-3 py-3">
        <span className="text-xs text-zinc-600">{formatDate(workflow.updatedAt)}</span>
      </td>

      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onRun();
            }}
            disabled={isRunning || workflow.status === 'archived'}
            title={workflow.triggerType === 'webhook' ? 'Send webhook trigger' : 'Run workflow'}
            type="button"
            className="p-1.5 rounded-md text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          </button>

          <Link
            href={workflowEditorHref}
            onClick={(event) => event.stopPropagation()}
            title="Edit workflow"
            className="p-1.5 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all duration-150"
          >
            <Edit2 size={13} />
          </Link>

          <div className="relative">
            <button
              onClick={(event) => {
                event.stopPropagation();
                onMenuToggle();
              }}
              type="button"
              className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-all duration-150"
            >
              <MoreHorizontal size={13} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-8 z-20 w-44 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden"
                onClick={(event) => event.stopPropagation()}
              >
                {workflow.triggerType === 'webhook' && (
                  <button
                    onClick={onCopyWebhook}
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors text-left"
                  >
                    <Copy size={12} className="text-zinc-500" />
                    Copy webhook URL
                  </button>
                )}
                <Link
                  href="/execution-dashboard"
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
                >
                  <ExternalLink size={12} className="text-zinc-500" />
                  View run history
                </Link>
                <button
                  onClick={onArchive}
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors text-left"
                >
                  <Archive size={12} className="text-zinc-500" />
                  Archive
                </button>
                <div className="border-t border-zinc-700" />
                <button
                  onClick={onDelete}
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors text-left"
                >
                  <Trash2 size={12} />
                  Delete workflow
                </button>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
