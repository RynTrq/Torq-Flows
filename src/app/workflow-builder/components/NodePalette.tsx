'use client';

import React from 'react';
import { Play, Globe, GitBranch, Clock, Code2, Square, GripVertical } from 'lucide-react';
import { NodeType, NODE_COLORS, NODE_LABELS } from './WorkflowBuilderCanvas';

interface NodePaletteProps {
  onAddNode: (type: NodeType) => void;
}

const paletteItems: { type: NodeType; icon: React.ElementType; description: string }[] = [
  { type: 'manual_trigger', icon: Play, description: 'Start from UI' },
  { type: 'webhook_trigger', icon: Globe, description: 'HTTP POST trigger' },
  { type: 'decision', icon: GitBranch, description: 'IF / ELSE branch' },
  { type: 'wait', icon: Clock, description: 'Durable timer' },
  { type: 'api_call', icon: Code2, description: 'HTTP request' },
  { type: 'end', icon: Square, description: 'Terminal node' },
];

export default function NodePalette({ onAddNode }: NodePaletteProps) {
  return (
    <div className="w-[200px] flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col overflow-y-auto">
      <div className="px-3 py-3 border-b border-zinc-800">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          Node Palette
        </p>
        <p className="text-[10px] text-zinc-700 mt-0.5">Click to add to canvas</p>
      </div>

      <div className="p-2 space-y-1.5 flex-1">
        {paletteItems.map((item) => {
          const colors = NODE_COLORS[item.type];
          const Icon = item.icon;

          return (
            <button
              key={`palette-${item.type}`}
              onClick={() => onAddNode(item.type)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] group"
              style={{
                background: colors.bg,
                borderColor: colors.border,
              }}
            >
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: `${colors.dot}25` }}
              >
                <Icon size={14} style={{ color: colors.text }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate" style={{ color: colors.text }}>
                  {NODE_LABELS[item.type]}
                </p>
                <p className="text-[10px] text-zinc-600 truncate">{item.description}</p>
              </div>
              <GripVertical
                size={12}
                className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              />
            </button>
          );
        })}
      </div>

      {/* Tips */}
      <div className="px-3 py-3 border-t border-zinc-800">
        <p className="text-[10px] text-zinc-700 leading-relaxed">
          <span className="text-zinc-600 font-medium">Delete</span> key removes selected nodes or
          edges.
          <br />
          <span className="text-zinc-600 font-medium">Shift+click</span> for multi-select.
        </p>
      </div>
    </div>
  );
}
