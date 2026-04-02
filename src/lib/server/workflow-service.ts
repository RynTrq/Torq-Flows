import 'server-only';

import type {
  AppShellCounts,
  AuthUser,
  NodeType,
  WorkflowDefinition,
  WorkflowEdgeDefinition,
  WorkflowListItem,
  WorkflowNodeDefinition,
  WorkflowRun,
  WorkflowStatus,
  WorkflowValidationIssue,
} from '@/lib/types';
import { getDefaultNodeConfig, NODE_LABELS } from '@/lib/types';
import { getBackendBaseUrl } from './env';

interface BackendErrorPayload {
  error?: string;
  validationErrors?: WorkflowValidationIssue[];
}

export class BackendApiError extends Error {
  status: number;
  validationErrors: WorkflowValidationIssue[];

  constructor(message: string, status = 500, validationErrors: WorkflowValidationIssue[] = []) {
    super(message);
    this.name = 'BackendApiError';
    this.status = status;
    this.validationErrors = validationErrors;
  }
}

export function getBackendFailureMessage(error: unknown): string | null {
  if (error instanceof BackendApiError) {
    return error.message || 'FastAPI backend request failed.';
  }

  return null;
}

async function backendRequest<T>({
  path,
  userId,
  method = 'GET',
  body,
}: {
  path: string;
  userId?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}): Promise<T> {
  const headers = new Headers({
    Accept: 'application/json',
  });

  if (userId) {
    headers.set('X-User-Id', userId);
  }

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;

  try {
    response = await fetch(`${getBackendBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch (error) {
    throw new BackendApiError(
      error instanceof Error
        ? `FastAPI backend is unreachable: ${error.message}`
        : 'FastAPI backend is unreachable.'
    );
  }

  const rawText = await response.text();
  let payload: (BackendErrorPayload & T) | null = null;

  if (rawText) {
    try {
      payload = JSON.parse(rawText) as BackendErrorPayload & T;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new BackendApiError(
      payload?.error ?? `Backend request failed with status ${response.status}.`,
      response.status,
      payload?.validationErrors ?? []
    );
  }

  return (payload ?? ({} as T)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeNodeType(value: unknown): NodeType {
  switch (value) {
    case 'manual_trigger':
    case 'webhook_trigger':
    case 'decision':
    case 'wait':
    case 'api_call':
    case 'end':
      return value;
    default:
      return 'manual_trigger';
  }
}

function sanitizeWorkflowStatus(value: unknown): WorkflowStatus {
  switch (value) {
    case 'active':
    case 'draft':
    case 'archived':
      return value;
    default:
      return 'active';
  }
}

function sanitizeNodes(value: unknown): WorkflowNodeDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((rawNode, index) => {
    const node = isRecord(rawNode) ? rawNode : {};
    const position = isRecord(node.position) ? node.position : {};
    const nodeType = sanitizeNodeType(node.nodeType);

    return {
      id: typeof node.id === 'string' && node.id ? node.id : `node-${index + 1}`,
      nodeType,
      label:
        typeof node.label === 'string' && node.label.trim().length > 0
          ? node.label
          : NODE_LABELS[nodeType],
      position: {
        x: typeof position.x === 'number' ? position.x : 0,
        y: typeof position.y === 'number' ? position.y : 0,
      },
      config: isRecord(node.config) ? node.config : getDefaultNodeConfig(nodeType),
    };
  });
}

function sanitizeEdges(value: unknown): WorkflowEdgeDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const sanitizedEdges: WorkflowEdgeDefinition[] = [];

  value.forEach((rawEdge, index) => {
    const edge = isRecord(rawEdge) ? rawEdge : {};

    if (typeof edge.source !== 'string' || typeof edge.target !== 'string') {
      return;
    }

    sanitizedEdges.push({
      id: typeof edge.id === 'string' && edge.id ? edge.id : `edge-${index + 1}`,
      source: edge.source,
      target: edge.target,
      sourceHandle: typeof edge.sourceHandle === 'string' ? edge.sourceHandle : null,
      targetHandle: typeof edge.targetHandle === 'string' ? edge.targetHandle : null,
    });
  });

  return sanitizedEdges;
}

export async function getAppShellCounts(userId: string): Promise<AppShellCounts> {
  const payload = await backendRequest<{ counts: AppShellCounts }>({
    path: '/api/dashboard/summary',
    userId,
  });

  return payload.counts;
}

export async function listWorkflows(userId: string): Promise<WorkflowListItem[]> {
  const payload = await backendRequest<{ workflows: WorkflowListItem[] }>({
    path: '/api/workflows',
    userId,
  });

  return payload.workflows ?? [];
}

export async function getWorkflowById(userId: string, workflowId: string) {
  try {
    const payload = await backendRequest<{ workflow: WorkflowDefinition }>({
      path: `/api/workflows/${workflowId}`,
      userId,
    });
    return payload.workflow ?? null;
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function upsertWorkflow({
  userId,
  workflowId,
  name,
  status = 'active',
  nodes,
  edges,
}: {
  userId: string;
  workflowId?: string;
  name: string;
  status?: WorkflowStatus;
  nodes: WorkflowNodeDefinition[];
  edges: WorkflowEdgeDefinition[];
}) {
  const payload = await backendRequest<{ workflow: WorkflowDefinition }>({
    path: workflowId ? `/api/workflows/${workflowId}` : '/api/workflows',
    userId,
    method: workflowId ? 'PATCH' : 'POST',
    body: {
      name,
      status,
      nodes,
      edges,
    },
  });

  return payload.workflow;
}

export async function updateWorkflowStatus(
  userId: string,
  workflowId: string,
  status: WorkflowStatus
) {
  try {
    const payload = await backendRequest<{ workflow: WorkflowDefinition }>({
      path: `/api/workflows/${workflowId}`,
      userId,
      method: 'PATCH',
      body: { status },
    });

    return payload.workflow ?? null;
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function deleteWorkflows(userId: string, workflowIds: string[]) {
  const payload = await backendRequest<{ deletedCount: number }>({
    path: '/api/workflows',
    userId,
    method: 'DELETE',
    body: { ids: workflowIds },
  });

  return payload.deletedCount ?? 0;
}

export async function listRuns(userId: string): Promise<WorkflowRun[]> {
  const payload = await backendRequest<{ runs: WorkflowRun[] }>({
    path: '/api/runs',
    userId,
  });

  return payload.runs ?? [];
}

export async function getRunById(userId: string, runId: string) {
  try {
    const payload = await backendRequest<{ run: WorkflowRun }>({
      path: `/api/runs/${runId}`,
      userId,
    });

    return payload.run ?? null;
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function runWorkflow(userId: string, workflowId: string, inputPayload: unknown) {
  const payload = await backendRequest<{ run: WorkflowRun }>({
    path: `/api/workflows/${workflowId}/run`,
    userId,
    method: 'POST',
    body: {
      inputPayload,
    },
  });

  return payload.run;
}

export async function runWorkflowFromWebhook(workflowId: string, inputPayload: unknown) {
  const payload = await backendRequest<{ run: WorkflowRun }>({
    path: `/api/webhooks/${workflowId}`,
    method: 'POST',
    body: inputPayload,
  });

  return payload.run;
}

export function sanitizeWorkflowInput(value: unknown) {
  const payload = isRecord(value) ? value : {};

  return {
    name: typeof payload.name === 'string' ? payload.name : 'Untitled Workflow',
    status: sanitizeWorkflowStatus(payload.status),
    nodes: sanitizeNodes(payload.nodes),
    edges: sanitizeEdges(payload.edges),
  };
}

export async function getAuthenticatedWorkflowOwner(workflowId: string, user: AuthUser) {
  const workflow = await getWorkflowById(user.id, workflowId);

  if (!workflow) {
    throw new BackendApiError('Workflow not found.', 404);
  }

  return workflow;
}
