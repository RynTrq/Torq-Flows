'use client';

import React, { useState, useEffect } from 'react';
import { Node } from 'reactflow';
import { X, Trash2, Plus, Minus, Copy } from 'lucide-react';
import { NodeData, NODE_COLORS, NODE_LABELS, NODE_ICONS } from './WorkflowBuilderCanvas';

interface NodeConfigPanelProps {
  node: Node<NodeData>;
  onUpdate: (nodeId: string, newData: Partial<NodeData>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

const OPERATORS = [
  { value: 'eq', label: '= equals' },
  { value: 'neq', label: '≠ not equals' },
  { value: 'gt', label: '> greater than' },
  { value: 'gte', label: '≥ greater or equal' },
  { value: 'lt', label: '< less than' },
  { value: 'lte', label: '≤ less or equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'in', label: 'in list' },
  { value: 'not_in', label: 'not in list' },
  { value: 'is_null', label: 'is null' },
  { value: 'is_not_null', label: 'is not null' },
];

interface Condition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface ConditionGroup {
  id: string;
  conditions: Condition[];
}

export default function NodeConfigPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
}: NodeConfigPanelProps) {
  const colors = NODE_COLORS[node.data.nodeType];
  const Icon = NODE_ICONS[node.data.nodeType];
  const [label, setLabel] = useState(node.data.label);
  const [config, setConfig] = useState(node.data.config);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setLabel(node.data.label);
    setConfig(node.data.config);
    setShowDeleteConfirm(false);
  }, [node.id, node.data.label, node.data.config]);

  const updateConfig = (key: string, value: unknown) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    onUpdate(node.id, { label, config: newConfig });
  };

  const updateLabel = (val: string) => {
    setLabel(val);
    onUpdate(node.id, { label: val, config });
  };

  return (
    <div className="w-[340px] flex-shrink-0 bg-zinc-900 border-l border-zinc-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-zinc-800"
        style={{ borderLeftWidth: 3, borderLeftColor: colors.border }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ background: `${colors.dot}20` }}
          >
            <Icon size={14} style={{ color: colors.text }} />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-100">{NODE_LABELS[node.data.nodeType]}</p>
            <p className="text-[10px] font-mono text-zinc-600">{node.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
            title="Delete node — this cannot be undone"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-all duration-150"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="mx-3 mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs font-medium text-red-400 mb-2">Delete this node?</p>
          <p className="text-[11px] text-zinc-500 mb-3">
            All connected edges will also be removed.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onDelete(node.id)}
              className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-all duration-150 active:scale-95"
            >
              Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 transition-all duration-150"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Config form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Node label */}
        <div>
          <label className="block text-[11px] font-medium text-zinc-400 mb-1">Node Label</label>
          <input
            value={label}
            onChange={(e) => updateLabel(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors"
            placeholder="Node label..."
          />
        </div>

        {/* Type-specific config */}
        {node.data.nodeType === 'manual_trigger' && (
          <ManualTriggerConfig config={config} updateConfig={updateConfig} />
        )}
        {node.data.nodeType === 'webhook_trigger' && (
          <WebhookTriggerConfig config={config} updateConfig={updateConfig} />
        )}
        {node.data.nodeType === 'decision' && (
          <DecisionConfig config={config} updateConfig={updateConfig} />
        )}
        {node.data.nodeType === 'wait' && (
          <WaitConfig config={config} updateConfig={updateConfig} />
        )}
        {node.data.nodeType === 'api_call' && (
          <ApiCallConfig config={config} updateConfig={updateConfig} />
        )}
        {node.data.nodeType === 'end' && <EndConfig config={config} updateConfig={updateConfig} />}
      </div>
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1">
      <label className="block text-[11px] font-medium text-zinc-400">{label}</label>
      {hint && <p className="text-[10px] text-zinc-600 mt-0.5">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono placeholder:text-zinc-700"
    />
  );
}

function TextArea({
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono resize-none placeholder:text-zinc-700"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors"
    >
      {options.map((opt) => (
        <option key={`opt-${opt.value}`} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ─── Node-specific config components ─────────────────────────────────────────

function ManualTriggerConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (k: string, v: unknown) => void;
}) {
  return (
    <div>
      <FieldLabel
        label="Input Payload (JSON)"
        hint="This JSON will be passed as the initial workflow input when triggered manually."
      />
      <TextArea
        value={(config.inputPayload as string) || '{}'}
        onChange={(v) => updateConfig('inputPayload', v)}
        rows={6}
        placeholder='{"key": "value"}'
      />
    </div>
  );
}

function WebhookTriggerConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (k: string, v: unknown) => void;
}) {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const webhookPath = typeof config.webhookPath === 'string' ? config.webhookPath.trim() : '';
  const webhookUrl = webhookPath
    ? `${origin || ''}/api/webhooks/${webhookPath}`
    : 'Save the workflow to generate a webhook URL.';

  return (
    <div className="space-y-3">
      <div>
        <FieldLabel
          label="Webhook URL"
          hint="POST requests to this URL will trigger the workflow. The request body becomes the input payload."
        />
        <div className="flex items-center gap-1.5">
          <code className="flex-1 bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-[10px] text-emerald-400 font-mono truncate">
            {webhookUrl}
          </code>
          <button
            onClick={() => {
              if (webhookPath) {
                void navigator.clipboard.writeText(webhookUrl);
              }
            }}
            disabled={!webhookPath}
            className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-all duration-150 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            title={webhookPath ? 'Copy webhook URL' : 'Save the workflow first'}
          >
            <Copy size={12} />
          </button>
        </div>
      </div>
      <div>
        <FieldLabel
          label="Expected Payload Schema (optional)"
          hint="Documentation only — not validated at runtime."
        />
        <TextArea
          value={(config.payloadSchema as string) || ''}
          onChange={(v) => updateConfig('payloadSchema', v)}
          rows={4}
          placeholder='{"userId": "string", "event": "string"}'
        />
      </div>
    </div>
  );
}

function DecisionConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (k: string, v: unknown) => void;
}) {
  const groups = (config.conditionGroups as ConditionGroup[]) || [{ id: 'grp-1', conditions: [] }];

  const addGroup = () => {
    const newGroups = [...groups, { id: `grp-${Date.now()}`, conditions: [] }];
    updateConfig('conditionGroups', newGroups);
  };

  const removeGroup = (groupId: string) => {
    updateConfig(
      'conditionGroups',
      groups.filter((g) => g.id !== groupId)
    );
  };

  const addCondition = (groupId: string) => {
    const newGroups = groups.map((g) =>
      g.id === groupId
        ? {
            ...g,
            conditions: [
              ...g.conditions,
              { id: `cond-${Date.now()}`, field: '', operator: 'eq', value: '' },
            ],
          }
        : g
    );
    updateConfig('conditionGroups', newGroups);
  };

  const removeCondition = (groupId: string, condId: string) => {
    const newGroups = groups.map((g) =>
      g.id === groupId ? { ...g, conditions: g.conditions.filter((c) => c.id !== condId) } : g
    );
    updateConfig('conditionGroups', newGroups);
  };

  const updateCondition = (
    groupId: string,
    condId: string,
    key: keyof Condition,
    value: string
  ) => {
    const newGroups = groups.map((g) =>
      g.id === groupId
        ? {
            ...g,
            conditions: g.conditions.map((c) => (c.id === condId ? { ...c, [key]: value } : c)),
          }
        : g
    );
    updateConfig('conditionGroups', newGroups);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <FieldLabel
          label="Conditions"
          hint='Groups are combined with OR. Conditions within a group use AND. Use payload paths like input.amount or literals like 1 or "approved".'
        />
      </div>

      {groups.map((group, gi) => (
        <div key={group.id} className="bg-zinc-950 border border-zinc-700/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              {gi === 0 ? 'Group 1' : `OR — Group ${gi + 1}`}
            </span>
            {groups.length > 1 && (
              <button
                onClick={() => removeGroup(group.id)}
                className="text-zinc-700 hover:text-red-400 transition-colors"
              >
                <X size={11} />
              </button>
            )}
          </div>

          <div className="space-y-2">
            {group.conditions.map((cond, ci) => (
              <div key={cond.id} className="space-y-1.5">
                {ci > 0 && (
                  <p className="text-[9px] font-semibold text-zinc-700 uppercase tracking-widest pl-0.5">
                    AND
                  </p>
                )}
                <div className="flex items-start gap-1">
                  <div className="flex-1 space-y-1">
                    <input
                      value={cond.field}
                      onChange={(e) => updateCondition(group.id, cond.id, 'field', e.target.value)}
                      placeholder='input.amount or 1 or "approved"'
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <select
                      value={cond.operator}
                      onChange={(e) =>
                        updateCondition(group.id, cond.id, 'operator', e.target.value)
                      }
                      className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-emerald-500"
                    >
                      {OPERATORS.map((op) => (
                        <option key={`op-${op.value}`} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                    {!['is_null', 'is_not_null'].includes(cond.operator) && (
                      <input
                        value={cond.value}
                        onChange={(e) =>
                          updateCondition(group.id, cond.id, 'value', e.target.value)
                        }
                        placeholder="value"
                        className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    )}
                  </div>
                  <button
                    onClick={() => removeCondition(group.id, cond.id)}
                    className="mt-1 p-1 text-zinc-700 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    <Minus size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => addCondition(group.id)}
            className="mt-2 flex items-center gap-1 text-[10px] font-medium text-zinc-600 hover:text-emerald-400 transition-colors"
          >
            <Plus size={10} /> Add condition
          </button>
        </div>
      ))}

      <button
        onClick={addGroup}
        className="w-full py-1.5 rounded-md border border-dashed border-zinc-700 text-[11px] font-medium text-zinc-600 hover:text-zinc-300 hover:border-zinc-500 transition-all duration-150"
      >
        + Add OR group
      </button>

      {/* Branch labels reminder */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] text-zinc-500">TRUE — conditions match</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="text-[10px] text-zinc-500">FALSE — no match</span>
        </div>
      </div>
    </div>
  );
}

function WaitConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (k: string, v: unknown) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel
          label="Wait Duration"
          hint="Uses a durable workflow timer so execution stays paused even across worker restarts."
        />
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            value={(config.amount as number) || 5}
            onChange={(e) => updateConfig('amount', parseInt(e.target.value) || 1)}
            className="w-24 bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
          />
          <SelectInput
            value={(config.unit as string) || 'minutes'}
            onChange={(v) => updateConfig('unit', v)}
            options={[
              { value: 'seconds', label: 'Seconds' },
              { value: 'minutes', label: 'Minutes' },
              { value: 'hours', label: 'Hours' },
              { value: 'days', label: 'Days' },
            ]}
          />
        </div>
      </div>
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2.5">
        <p className="text-[11px] text-blue-400">
          <span className="font-semibold">Durable timer</span> — this uses{' '}
          <code className="font-mono">workflow.sleep()</code>, not{' '}
          <code className="font-mono">time.sleep()</code>. The workflow is durably suspended.
        </p>
      </div>
    </div>
  );
}

function ApiCallConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (k: string, v: unknown) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel label="Method" />
        <SelectInput
          value={(config.method as string) || 'GET'}
          onChange={(v) => updateConfig('method', v)}
          options={[
            { value: 'GET', label: 'GET' },
            { value: 'POST', label: 'POST' },
            { value: 'PUT', label: 'PUT' },
            { value: 'PATCH', label: 'PATCH' },
            { value: 'DELETE', label: 'DELETE' },
          ]}
        />
      </div>
      <div>
        <FieldLabel label="URL" hint="Supports template variables: {{input.userId}}" />
        <TextInput
          value={(config.url as string) || ''}
          onChange={(v) => updateConfig('url', v)}
          placeholder="https://api.example.com/endpoint"
        />
      </div>
      <div>
        <FieldLabel label="Headers (JSON)" hint="Key-value pairs sent as HTTP headers." />
        <TextArea
          value={(config.headers as string) || '{}'}
          onChange={(v) => updateConfig('headers', v)}
          rows={3}
          placeholder='{"Authorization": "Bearer {{input.token}}"}'
        />
      </div>
      {(config.method as string) !== 'GET' && (
        <div>
          <FieldLabel
            label="Request Body (JSON)"
            hint="Sent as application/json. Supports template variables."
          />
          <TextArea
            value={(config.body as string) || ''}
            onChange={(v) => updateConfig('body', v)}
            rows={4}
            placeholder='{"userId": "{{input.userId}}"}'
          />
        </div>
      )}
      <div>
        <FieldLabel label="Timeout (seconds)" hint="Request timeout. Defaults to 30s." />
        <input
          type="number"
          min={1}
          max={300}
          value={(config.timeout as number) || 30}
          onChange={(e) => updateConfig('timeout', parseInt(e.target.value) || 30)}
          className="w-24 bg-zinc-950 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
        />
      </div>
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-2.5">
        <p className="text-[11px] text-zinc-500">
          On failure: the node records the error (status code + body) and{' '}
          <span className="text-zinc-400 font-medium">stops the run</span>. This is configurable in
          the backend.
        </p>
      </div>
    </div>
  );
}

function EndConfig({
  config,
  updateConfig,
}: {
  config: Record<string, unknown>;
  updateConfig: (k: string, v: unknown) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <FieldLabel
          label="Final Output Expression (optional)"
          hint="JSONPath expression to extract from the last node's output as the workflow result. Leave empty to use the full last output."
        />
        <TextInput
          value={(config.outputExpression as string) || ''}
          onChange={(v) => updateConfig('outputExpression', v)}
          placeholder="$.data.result"
        />
      </div>
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
        <p className="text-[11px] text-red-400">
          This is a <span className="font-semibold">terminal node</span>. Execution stops here and
          the run is marked <code className="font-mono">completed</code>.
        </p>
      </div>
    </div>
  );
}
