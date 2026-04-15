'use client';

import React, { useEffect, useRef } from 'react';
import {
  X,
  ChevronDown,
  ChevronUp,
  Terminal,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
} from 'lucide-react';

export type LogLevel = 'info' | 'success' | 'error' | 'warning' | 'system';

export interface ExecutionLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  nodeLabel?: string;
  message: string;
}

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'failed';

interface ExecutionOutputPanelProps {
  status: ExecutionStatus;
  logs: ExecutionLog[];
  runId?: string;
  duration?: number;
  finalOutput?: string | null;
  errorMessage?: string | null;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const LOG_COLORS: Record<LogLevel, string> = {
  info: 'text-zinc-400',
  success: 'text-emerald-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
  system: 'text-blue-400',
};

const LOG_PREFIXES: Record<LogLevel, string> = {
  info: '  ',
  success: '✓ ',
  error: '✗ ',
  warning: '⚠ ',
  system: '» ',
};

const STATUS_CONFIG: Record<
  ExecutionStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  idle: {
    label: 'Idle',
    color: 'text-zinc-500',
    icon: <Terminal size={12} />,
  },
  running: {
    label: 'Running',
    color: 'text-amber-400',
    icon: <Loader2 size={12} className="animate-spin" />,
  },
  success: {
    label: 'Completed',
    color: 'text-emerald-400',
    icon: <CheckCircle2 size={12} />,
  },
  failed: {
    label: 'Failed',
    color: 'text-red-400',
    icon: <XCircle size={12} />,
  },
};

export default function ExecutionOutputPanel({
  status,
  logs,
  runId,
  duration,
  finalOutput,
  errorMessage,
  onClose,
  isCollapsed,
  onToggleCollapse,
}: ExecutionOutputPanelProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isCollapsed) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isCollapsed]);

  const statusCfg = STATUS_CONFIG[status];

  return (
    <div
      className="flex flex-col border-t border-zinc-800 bg-zinc-950 flex-shrink-0 transition-all duration-200"
      style={{ height: isCollapsed ? 36 : 280 }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            {isCollapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            <Terminal size={12} className="text-zinc-500" />
            <span className="text-xs font-semibold text-zinc-300 font-mono">Execution Output</span>
          </button>

          {/* Status badge */}
          <div
            className={`flex items-center gap-1 text-[11px] font-mono font-medium ${statusCfg.color}`}
          >
            {statusCfg.icon}
            <span>{statusCfg.label}</span>
          </div>

          {/* Run ID */}
          {runId && (
            <span className="text-[10px] font-mono text-zinc-600 hidden sm:block">run:{runId}</span>
          )}

          {/* Duration */}
          {duration !== undefined && status !== 'running' && (
            <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-600">
              <Clock size={10} />
              <span>{duration}ms</span>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="text-zinc-600 hover:text-zinc-300 transition-colors p-0.5 rounded"
          title="Close output panel"
        >
          <X size={13} />
        </button>
      </div>

      {/* Logs area */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
          {(errorMessage || finalOutput) && (
            <div className="mb-3 space-y-2">
              {errorMessage && (
                <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                    Run Error
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-red-300">
                    {errorMessage}
                  </pre>
                </div>
              )}

              {finalOutput && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                    Final Output
                  </p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-emerald-300">
                    {finalOutput}
                  </pre>
                </div>
              )}
            </div>
          )}

          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Terminal size={20} className="text-zinc-700 mx-auto mb-2" />
                <p className="text-zinc-600 text-[11px]">
                  No output yet — run the workflow to see execution logs
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 group">
                  <span className="text-zinc-700 flex-shrink-0 select-none">{log.timestamp}</span>
                  {log.nodeLabel && (
                    <span className="text-zinc-600 flex-shrink-0 max-w-[120px] truncate">
                      [{log.nodeLabel}]
                    </span>
                  )}
                  <span className={`${LOG_COLORS[log.level]} flex-shrink-0 select-none`}>
                    {LOG_PREFIXES[log.level]}
                  </span>
                  <pre
                    className={`${LOG_COLORS[log.level]} whitespace-pre-wrap break-words font-mono`}
                  >
                    {log.message}
                  </pre>
                </div>
              ))}
              {status === 'running' && (
                <div className="flex items-center gap-2 text-amber-400/60 mt-1">
                  <span className="text-zinc-700 flex-shrink-0 select-none">
                    {new Date().toLocaleTimeString('en-US', {
                      hour12: false,
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  <Loader2 size={10} className="animate-spin flex-shrink-0" />
                  <span className="text-[11px]">executing...</span>
                </div>
              )}
            </div>
          )}
          <div ref={logsEndRef} />
        </div>
      )}
    </div>
  );
}
