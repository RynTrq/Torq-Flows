'use client';

import React from 'react';
import { AlertTriangle, X, Info, AlertCircle } from 'lucide-react';
import { ValidationError } from './WorkflowBuilderCanvas';

interface ValidationPanelProps {
  errors: ValidationError[];
  onClose: () => void;
  onNodeFocus: (nodeId: string) => void;
}

export default function ValidationPanel({ errors, onClose, onNodeFocus }: ValidationPanelProps) {
  const errorCount = errors.filter((e) => e.severity === 'error').length;
  const warningCount = errors.filter((e) => e.severity === 'warning').length;

  return (
    <div className="flex-shrink-0 bg-zinc-900/80 border-b border-zinc-800 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          {errorCount > 0 ? (
            <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
          ) : (
            <Info size={14} className="text-amber-400 flex-shrink-0" />
          )}
          <span className="text-xs font-semibold text-zinc-300">
            {errorCount > 0
              ? `${errorCount} error${errorCount !== 1 ? 's' : ''}${warningCount > 0 ? `, ${warningCount} warning${warningCount !== 1 ? 's' : ''}` : ''}`
              : `${warningCount} warning${warningCount !== 1 ? 's' : ''}`}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 flex-1">
          {errors.map((err, i) => (
            <button
              key={`valerr-${i}`}
              onClick={() => err.nodeId && onNodeFocus(err.nodeId)}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-all duration-150 ${
                err.severity === 'error'
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
              } ${err.nodeId ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {err.severity === 'error' ? <AlertCircle size={10} /> : <AlertTriangle size={10} />}
              {err.message}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
