export type WorkflowStatus = 'active' | 'draft' | 'archived';
export type TriggerType = 'manual' | 'webhook';
export type RunStatus = 'completed' | 'failed' | 'running' | 'queued' | 'cancelled' | 'timed_out';
export type NodeExecutionStatus = 'completed' | 'failed' | 'skipped' | 'running' | 'pending';

export type NodeType =
  | 'manual_trigger'
  | 'webhook_trigger'
  | 'decision'
  | 'wait'
  | 'api_call'
  | 'end';

export interface WorkflowNodeDefinition {
  id: string;
  nodeType: NodeType;
  label: string;
  position: {
    x: number;
    y: number;
  };
  config: Record<string, unknown>;
}

export interface WorkflowEdgeDefinition {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  triggerType: TriggerType;
  webhookPath: string | null;
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowValidationIssue {
  nodeId?: string;
  message: string;
  severity: 'error' | 'warning';
  code?: string;
}

export interface WorkflowListItem {
  id: string;
  name: string;
  status: WorkflowStatus;
  triggerType: TriggerType;
  webhookPath: string | null;
  nodeCount: number;
  edgeCount: number;
  lastRunStatus: RunStatus | null;
  lastRunAt: string | null;
  totalRuns: number;
  successRate: number;
  createdAt: string;
  updatedAt: string;
  description: string;
}

export interface RunLog {
  id: string;
  nodeId: string;
  nodeType: NodeType;
  nodeLabel: string;
  status: NodeExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  output: string;
  error: string | null;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  temporalRunId: string;
  status: RunStatus;
  triggerType: TriggerType;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  nodeCount: number;
  nodesCompleted: number;
  inputPayload: string;
  finalOutput: string | null;
  errorMessage: string | null;
  nodeLogs: RunLog[];
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AppShellCounts {
  workflowCount: number;
  activeRunCount: number;
}

export const NODE_LABELS: Record<NodeType, string> = {
  manual_trigger: 'Manual Trigger',
  webhook_trigger: 'Webhook Trigger',
  decision: 'Decision',
  wait: 'Wait',
  api_call: 'API Call',
  end: 'End',
};

export function getDefaultNodeConfig(nodeType: NodeType): Record<string, unknown> {
  switch (nodeType) {
    case 'manual_trigger':
      return { inputPayload: '{}' };
    case 'webhook_trigger':
      return { webhookPath: '', payloadSchema: '' };
    case 'decision':
      return { conditionGroups: [{ id: 'grp-1', conditions: [] }] };
    case 'wait':
      return { amount: 5, unit: 'minutes' };
    case 'api_call':
      return { method: 'GET', url: '', headers: '{}', body: '', timeout: 30 };
    case 'end':
      return { finalOutput: '', outputExpression: '' };
    default:
      return {};
  }
}

export function inferTriggerType(nodes: WorkflowNodeDefinition[]): TriggerType {
  return nodes.some((node) => node.nodeType === 'webhook_trigger') ? 'webhook' : 'manual';
}

export function inferWebhookPath(nodes: WorkflowNodeDefinition[]): string | null {
  const webhookNode = nodes.find((node) => node.nodeType === 'webhook_trigger');
  const rawPath = webhookNode?.config.webhookPath;

  if (typeof rawPath !== 'string') {
    return null;
  }

  const normalized = rawPath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized.length > 0 ? normalized : null;
}

export function buildWorkflowDescription(
  workflowName: string,
  nodes: WorkflowNodeDefinition[]
): string {
  const triggerType = inferTriggerType(nodes);
  const nodeCount = nodes.length;
  const triggerLabel = triggerType === 'webhook' ? 'Webhook-triggered' : 'Manually triggered';

  if (nodeCount === 0) {
    return `${workflowName} has not been configured yet`;
  }

  return `${triggerLabel} workflow with ${nodeCount} node${nodeCount === 1 ? '' : 's'}`;
}

export function formatJsonPayload(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

export function getUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) {
    return 'U';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}
