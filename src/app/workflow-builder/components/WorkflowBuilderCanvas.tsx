'use client';

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  MarkerType,
  NodeTypes,
  EdgeTypes,
  type NodeChange,
  type EdgeChange,
  getBezierPath,
  EdgeProps,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toast } from 'sonner';
import {
  Save,
  Play,
  CheckCircle,
  Trash2,
  X,
  Globe,
  GitBranch,
  Clock,
  Code2,
  Square,
  Loader2,
} from 'lucide-react';
import NodeConfigPanel from './NodeConfigPanel';
import NodePalette from './NodePalette';
import ValidationPanel from './ValidationPanel';
import ExecutionOutputPanel, {
  ExecutionLog,
  ExecutionStatus,
  LogLevel,
} from './ExecutionOutputPanel';
import {
  getDefaultNodeConfig,
  NODE_LABELS as SHARED_NODE_LABELS,
  type NodeExecutionStatus,
  type NodeType as SharedNodeType,
  type RunStatus,
  type WorkflowDefinition,
  type WorkflowEdgeDefinition,
  type WorkflowNodeDefinition,
  type WorkflowRun,
  type WorkflowStatus,
  type WorkflowValidationIssue,
} from '@/lib/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type NodeType = SharedNodeType;

export interface NodeData {
  nodeType: NodeType;
  label: string;
  config: Record<string, unknown>;
}

export type ValidationError = WorkflowValidationIssue;

// ─── Node color map ──────────────────────────────────────────────────────────

export const NODE_COLORS: Record<
  NodeType,
  { bg: string; border: string; text: string; dot: string }
> = {
  manual_trigger: { bg: '#052e16', border: '#16a34a', text: '#4ade80', dot: '#22c55e' },
  webhook_trigger: { bg: '#052e16', border: '#16a34a', text: '#4ade80', dot: '#22c55e' },
  decision: { bg: '#1c1100', border: '#d97706', text: '#fbbf24', dot: '#f59e0b' },
  wait: { bg: '#0c1a2e', border: '#2563eb', text: '#60a5fa', dot: '#3b82f6' },
  api_call: { bg: '#1a0a2e', border: '#7c3aed', text: '#a78bfa', dot: '#8b5cf6' },
  end: { bg: '#1a0a0a', border: '#dc2626', text: '#f87171', dot: '#ef4444' },
};

export const NODE_ICONS: Record<NodeType, React.ElementType> = {
  manual_trigger: Play,
  webhook_trigger: Globe,
  decision: GitBranch,
  wait: Clock,
  api_call: Code2,
  end: Square,
};

export const NODE_LABELS = SHARED_NODE_LABELS;
const DECISION_OPERATORS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'in',
  'not_in',
  'is_null',
  'is_not_null',
]);
const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

// ─── Summary helpers ──────────────────────────────────────────────────────────

function getNodeSummary(nodeType: NodeType, config: Record<string, unknown>): string {
  switch (nodeType) {
    case 'manual_trigger':
      return 'Manual start';
    case 'webhook_trigger':
      return 'HTTP POST trigger';
    case 'decision': {
      const groups = (config.conditionGroups as unknown[]) || [];
      const count = groups.reduce((acc: number, g: unknown) => {
        const group = g as { conditions?: unknown[] };
        return acc + (group.conditions?.length || 0);
      }, 0);
      return count > 0 ? `${count} condition${count !== 1 ? 's' : ''}` : 'No conditions';
    }
    case 'wait': {
      const amount = config.amount || '?';
      const unit = config.unit || 'minutes';
      return `${amount} ${unit}`;
    }
    case 'api_call': {
      const method = (config.method as string) || 'GET';
      const url = (config.url as string) || '';
      const shortUrl = url.length > 22 ? url.substring(0, 22) + '…' : url || '(no URL)';
      return `${method} ${shortUrl}`;
    }
    case 'end':
      return 'Terminal node';
    default:
      return '';
  }
}

function parseJsonCandidate(raw: string) {
  const candidate = raw.replace(TEMPLATE_VARIABLE_PATTERN, '__template__');

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

// ─── Custom Node Component ────────────────────────────────────────────────────

function WorkflowNode({ data, selected }: { data: NodeData; selected: boolean }) {
  const colors = NODE_COLORS[data.nodeType];
  const Icon = NODE_ICONS[data.nodeType];
  const summary = getNodeSummary(data.nodeType, data.config);
  const isDecision = data.nodeType === 'decision';
  const isTrigger = data.nodeType === 'manual_trigger' || data.nodeType === 'webhook_trigger';
  const isEnd = data.nodeType === 'end';

  return (
    <div
      className="node-enter"
      style={{
        background: colors.bg,
        border: `1.5px solid ${selected ? '#34d399' : colors.border}`,
        borderRadius: 10,
        minWidth: 180,
        maxWidth: 220,
        boxShadow: selected
          ? `0 0 0 2px #34d39940, 0 4px 24px ${colors.dot}30`
          : `0 2px 12px ${colors.dot}20`,
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      {/* Top handle — input (not for triggers) */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          style={{
            background: colors.dot,
            border: `2px solid ${colors.border}`,
            width: 10,
            height: 10,
            top: -6,
          }}
        />
      )}

      <div className="px-3 py-2.5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: `${colors.dot}20` }}
          >
            <Icon size={13} style={{ color: colors.text }} />
          </div>
          <span className="text-xs font-semibold truncate" style={{ color: colors.text }}>
            {data.label || NODE_LABELS[data.nodeType]}
          </span>
        </div>

        {/* Summary */}
        <p className="text-[10px] text-zinc-500 font-mono truncate leading-tight">{summary}</p>
      </div>

      {/* Decision: TRUE / FALSE handles */}
      {isDecision ? (
        <>
          <div
            style={{
              position: 'absolute',
              bottom: -22,
              left: '25%',
              transform: 'translateX(-50%)',
              fontSize: 9,
              color: '#4ade80',
              fontFamily: 'IBM Plex Mono, monospace',
              fontWeight: 600,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            TRUE
          </div>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            style={{
              background: '#22c55e',
              border: '2px solid #16a34a',
              width: 10,
              height: 10,
              bottom: -6,
              left: '25%',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: -22,
              left: '75%',
              transform: 'translateX(-50%)',
              fontSize: 9,
              color: '#f87171',
              fontFamily: 'IBM Plex Mono, monospace',
              fontWeight: 600,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            FALSE
          </div>
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            style={{
              background: '#ef4444',
              border: '2px solid #dc2626',
              width: 10,
              height: 10,
              bottom: -6,
              left: '75%',
            }}
          />
        </>
      ) : !isEnd ? (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{
            background: colors.dot,
            border: `2px solid ${colors.border}`,
            width: 10,
            height: 10,
            bottom: -6,
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Custom Edge ──────────────────────────────────────────────────────────────

function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const label = (data as { label?: string } | undefined)?.label;

  return (
    <>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        style={{
          stroke: selected ? '#34d399' : '#3f3f46',
          strokeWidth: selected ? 2.5 : 1.5,
          fill: 'none',
        }}
        markerEnd={markerEnd}
      />
      {label && (
        <foreignObject x={labelX - 22} y={labelY - 10} width={44} height={20}>
          <div className="flex items-center justify-center h-full">
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded font-mono"
              style={{
                background: label === 'true' ? '#052e16' : '#1a0a0a',
                color: label === 'true' ? '#4ade80' : '#f87171',
                border: `1px solid ${label === 'true' ? '#16a34a' : '#dc2626'}`,
              }}
            >
              {label.toUpperCase()}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  );
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialNodes: Node<NodeData>[] = [];

const initialEdges: Edge[] = [];

function createReactFlowNodes(workflowNodes: WorkflowNodeDefinition[]): Node<NodeData>[] {
  return workflowNodes.map((node) => ({
    id: node.id,
    type: 'workflowNode',
    position: node.position,
    data: {
      nodeType: node.nodeType,
      label: node.label,
      config: node.config,
    },
  }));
}

function createReactFlowEdges(workflowEdges: WorkflowEdgeDefinition[]): Edge[] {
  return workflowEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
    type: 'workflowEdge',
    data: {
      label: edge.sourceHandle ?? undefined,
    },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#3f3f46', width: 16, height: 16 },
  }));
}

function serializeWorkflowNodes(nodes: Node<NodeData>[]): WorkflowNodeDefinition[] {
  return nodes.map((node) => ({
    id: node.id,
    nodeType: node.data.nodeType,
    label: node.data.label,
    position: node.position,
    config: node.data.config,
  }));
}

function serializeWorkflowEdges(edges: Edge[]): WorkflowEdgeDefinition[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? null,
    targetHandle: edge.targetHandle ?? null,
  }));
}

function getNextNodeCounter(workflowNodes: WorkflowNodeDefinition[]) {
  return workflowNodes.reduce((nextCounter, node) => {
    const match = node.id.match(/(\d+)(?!.*\d)/);

    if (!match) {
      return nextCounter;
    }

    return Math.max(nextCounter, Number(match[1]) + 1);
  }, 2);
}

function formatExecutionTimestamp(isoString: string | null) {
  return new Date(isoString ?? Date.now()).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getLogLevelFromNodeStatus(status: NodeExecutionStatus): LogLevel {
  switch (status) {
    case 'failed':
      return 'error';
    case 'running':
      return 'warning';
    case 'pending':
    case 'skipped':
      return 'info';
    case 'completed':
    default:
      return 'success';
  }
}

function getExecutionStatusFromRunStatus(status: RunStatus): ExecutionStatus {
  switch (status) {
    case 'failed':
    case 'cancelled':
    case 'timed_out':
      return 'failed';
    case 'running':
    case 'queued':
      return 'running';
    case 'completed':
    default:
      return 'success';
  }
}

function buildExecutionLogsFromRun(run: WorkflowRun): ExecutionLog[] {
  const logs: ExecutionLog[] = [
    {
      id: `${run.id}-start`,
      timestamp: formatExecutionTimestamp(run.startedAt),
      level: 'system',
      message: `Starting workflow "${run.workflowName}" — ${run.id}`,
    },
    {
      id: `${run.id}-input`,
      timestamp: formatExecutionTimestamp(run.startedAt),
      level: 'info',
      message: `Input payload: ${run.inputPayload}`,
    },
  ];

  for (const log of run.nodeLogs) {
    logs.push({
      id: log.id,
      timestamp: formatExecutionTimestamp(log.startedAt),
      level: getLogLevelFromNodeStatus(log.status),
      nodeLabel: log.nodeLabel,
      message: (log.error ?? log.output) || log.status,
    });
  }

  if (run.status === 'queued') {
    logs.push({
      id: `${run.id}-queued`,
      timestamp: formatExecutionTimestamp(run.startedAt),
      level: 'system',
      message: 'Workflow queued in the execution runtime.',
    });
  } else if (run.status === 'running') {
    logs.push({
      id: `${run.id}-running`,
      timestamp: formatExecutionTimestamp(run.startedAt),
      level: 'system',
      message: 'Workflow is running.',
    });
  } else {
    logs.push({
      id: `${run.id}-end`,
      timestamp: formatExecutionTimestamp(run.completedAt ?? run.startedAt),
      level: run.status === 'completed' ? 'system' : 'error',
      message:
        run.status === 'completed'
          ? `Workflow completed in ${run.durationMs ?? 0}ms`
          : (run.errorMessage ?? 'Workflow execution failed'),
    });
  }

  return logs;
}

function isTerminalRunStatus(status: RunStatus) {
  return ['completed', 'failed', 'cancelled', 'timed_out'].includes(status);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasMeaningfulNodeChanges(changes: NodeChange[]) {
  return changes.some((change) => change.type !== 'select' && change.type !== 'dimensions');
}

function hasMeaningfulEdgeChanges(changes: EdgeChange[]) {
  return changes.some((change) => change.type !== 'select');
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface WorkflowBuilderCanvasProps {
  initialWorkflow: WorkflowDefinition | null;
}

export default function WorkflowBuilderCanvas({ initialWorkflow }: WorkflowBuilderCanvasProps) {
  const router = useRouter();
  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      workflowNode: WorkflowNode as unknown as NodeTypes['workflowNode'],
    }),
    []
  );
  const edgeTypes = useMemo<EdgeTypes>(
    () => ({
      workflowEdge: WorkflowEdge as unknown as EdgeTypes['workflowEdge'],
    }),
    []
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<NodeData>(
    initialWorkflow ? createReactFlowNodes(initialWorkflow.nodes) : initialNodes
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialWorkflow ? createReactFlowEdges(initialWorkflow.edges) : initialEdges
  );
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(initialWorkflow?.id ?? null);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>(
    initialWorkflow?.status ?? 'active'
  );
  const [workflowName, setWorkflowName] = useState(initialWorkflow?.name ?? 'Untitled Workflow');
  const [editingName, setEditingName] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showValidation, setShowValidation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const nodeIdCounter = useRef(getNextNodeCounter(initialWorkflow?.nodes ?? []));
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // ─── Execution output state ────────────────────────────────────────────────
  const [showOutputPanel, setShowOutputPanel] = useState(false);
  const [outputCollapsed, setOutputCollapsed] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>('idle');
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [executionRunId, setExecutionRunId] = useState<string | undefined>();
  const [executionDuration, setExecutionDuration] = useState<number | undefined>();
  const [executionFinalOutput, setExecutionFinalOutput] = useState<string | null>(null);
  const [executionErrorMessage, setExecutionErrorMessage] = useState<string | null>(null);
  const logCounterRef = useRef(0);
  const selectedNodes = useMemo(() => nodes.filter((node) => node.selected), [nodes]);
  const selectedEdges = useMemo(() => edges.filter((edge) => edge.selected), [edges]);
  const selectedNodeCount = selectedNodes.length;
  const selectedItemCount = selectedNodeCount + selectedEdges.length;
  const triggerNode = useMemo(
    () =>
      nodes.find(
        (node) =>
          node.data.nodeType === 'manual_trigger' || node.data.nodeType === 'webhook_trigger'
      ),
    [nodes]
  );

  const applyPersistedWorkflow = useCallback(
    (workflow: WorkflowDefinition | null) => {
      if (!workflow) {
        setWorkflowId(null);
        setWorkflowStatus('active');
        setWorkflowName('Untitled Workflow');
        setNodes([]);
        setEdges([]);
        nodeIdCounter.current = 2;
      } else {
        setWorkflowId(workflow.id);
        setWorkflowStatus(workflow.status);
        setWorkflowName(workflow.name);
        setNodes(createReactFlowNodes(workflow.nodes));
        setEdges(createReactFlowEdges(workflow.edges));
        nodeIdCounter.current = getNextNodeCounter(workflow.nodes);
      }

      setSelectedNode(null);
      setValidationErrors([]);
      setShowValidation(false);
      setIsDirty(false);
    },
    [setEdges, setNodes]
  );

  useEffect(() => {
    applyPersistedWorkflow(initialWorkflow);
  }, [applyPersistedWorkflow, initialWorkflow]);

  const appendLog = useCallback(
    (level: ExecutionLog['level'], message: string, nodeLabel?: string) => {
      const now = new Date();
      const ts = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setExecutionLogs((prev) => [
        ...prev,
        { id: `log-${logCounterRef.current++}`, timestamp: ts, level, message, nodeLabel },
      ]);
    },
    []
  );

  const isValidConnection = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return false;
      }

      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);

      if (!sourceNode || !targetNode) {
        return false;
      }

      if (
        targetNode.data.nodeType === 'manual_trigger' ||
        targetNode.data.nodeType === 'webhook_trigger'
      ) {
        return false;
      }

      if (sourceNode.data.nodeType === 'end') {
        return false;
      }

      const duplicateEdge = edges.some(
        (edge) =>
          edge.source === connection.source &&
          edge.target === connection.target &&
          (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null)
      );

      if (duplicateEdge) {
        return false;
      }

      if (sourceNode.data.nodeType === 'decision') {
        if (connection.sourceHandle !== 'true' && connection.sourceHandle !== 'false') {
          return false;
        }

        const handleAlreadyUsed = edges.some(
          (edge) =>
            edge.source === connection.source && edge.sourceHandle === connection.sourceHandle
        );

        return !handleAlreadyUsed;
      }

      if (connection.sourceHandle) {
        return false;
      }

      const hasOutgoingEdge = edges.some((edge) => edge.source === connection.source);
      return !hasOutgoingEdge;
    },
    [edges, nodes]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!isValidConnection(connection)) {
        return;
      }

      const sourceNode = nodes.find((n) => n.id === connection.source);
      const isDecision = sourceNode?.data.nodeType === 'decision';
      const edgeLabel = isDecision ? (connection.sourceHandle ?? undefined) : undefined;

      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: 'workflowEdge',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#3f3f46', width: 16, height: 16 },
            data: { label: edgeLabel },
          },
          eds
        )
      );
      setIsDirty(true);
    },
    [isValidConnection, nodes, setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<NodeData>) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onSelectionChange = useCallback(({ nodes: nextSelectedNodes }: { nodes: Node[] }) => {
    if (nextSelectedNodes.length === 1) {
      setSelectedNode(nextSelectedNodes[0] as Node<NodeData>);
      return;
    }

    setSelectedNode(null);
  }, []);

  const onNodeUpdate = useCallback(
    (nodeId: string, newData: Partial<NodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n))
      );
      setSelectedNode((prev) =>
        prev && prev.id === nodeId ? { ...prev, data: { ...prev.data, ...newData } } : prev
      );
      setIsDirty(true);
    },
    [setNodes]
  );

  const deleteNodesById = useCallback(
    (nodeIds: string[], options?: { toast?: boolean }) => {
      if (nodeIds.length === 0) return;

      const nodeIdSet = new Set(nodeIds);

      setNodes((nds) => nds.filter((node) => !nodeIdSet.has(node.id)));
      setEdges((eds) =>
        eds.filter((edge) => !nodeIdSet.has(edge.source) && !nodeIdSet.has(edge.target))
      );
      setValidationErrors((prev) =>
        prev.filter((error) => !error.nodeId || !nodeIdSet.has(error.nodeId))
      );
      setSelectedNode((prev) => (prev && nodeIdSet.has(prev.id) ? null : prev));
      setIsDirty(true);

      if (options?.toast !== false) {
        toast.success(nodeIds.length === 1 ? 'Node deleted' : `${nodeIds.length} nodes deleted`);
      }
    },
    [setNodes, setEdges]
  );

  const deleteEdgesById = useCallback(
    (edgeIds: string[], options?: { toast?: boolean }) => {
      if (edgeIds.length === 0) return;

      const edgeIdSet = new Set(edgeIds);

      setEdges((eds) => eds.filter((edge) => !edgeIdSet.has(edge.id)));
      setIsDirty(true);

      if (options?.toast !== false) {
        toast.success(edgeIds.length === 1 ? 'Edge deleted' : `${edgeIds.length} edges deleted`);
      }
    },
    [setEdges]
  );

  const onDeleteNode = useCallback(
    (nodeId: string) => {
      deleteNodesById([nodeId]);
    },
    [deleteNodesById]
  );

  const onDeleteSelectedItems = useCallback(() => {
    const nodeIds = selectedNodes.map((node) => node.id);
    const edgeIds = selectedEdges
      .filter((edge) => !nodeIds.includes(edge.source) && !nodeIds.includes(edge.target))
      .map((edge) => edge.id);

    if (nodeIds.length > 0) {
      deleteNodesById(nodeIds, { toast: false });
    }

    if (edgeIds.length > 0) {
      deleteEdgesById(edgeIds, { toast: false });
    }

    if (nodeIds.length > 0 || edgeIds.length > 0) {
      toast.success(
        `${nodeIds.length + edgeIds.length} selected item${
          nodeIds.length + edgeIds.length === 1 ? '' : 's'
        } deleted`
      );
    }
  }, [deleteEdgesById, deleteNodesById, selectedEdges, selectedNodes]);

  const onNodesDelete = useCallback((deletedNodes: Node[]) => {
    if (deletedNodes.length === 0) return;

    const deletedNodeIds = new Set(deletedNodes.map((node) => node.id));

    setValidationErrors((prev) =>
      prev.filter((error) => !error.nodeId || !deletedNodeIds.has(error.nodeId))
    );
    setSelectedNode((prev) => (prev && deletedNodeIds.has(prev.id) ? null : prev));
    setIsDirty(true);

    toast.success(
      deletedNodes.length === 1 ? 'Node deleted' : `${deletedNodes.length} nodes deleted`
    );
  }, []);

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      if (deletedEdges.length === 0) return;

      deleteEdgesById(
        deletedEdges.map((edge) => edge.id),
        { toast: false }
      );
      toast.success(
        deletedEdges.length === 1 ? 'Edge deleted' : `${deletedEdges.length} edges deleted`
      );
    },
    [deleteEdgesById]
  );

  const addNode = useCallback(
    (nodeType: NodeType) => {
      const id = `node-${nodeType}-${nodeIdCounter.current++}`;

      const newNode: Node<NodeData> = {
        id,
        type: 'workflowNode',
        position: {
          x: 200 + Math.floor(Math.random() * 200),
          y: 200 + Math.floor(Math.random() * 200),
        },
        data: {
          nodeType,
          label: NODE_LABELS[nodeType],
          config: getDefaultNodeConfig(nodeType),
        },
      };

      setNodes((nds) => [...nds, newNode]);
      setSelectedNode(newNode);
      setIsDirty(true);
    },
    [setNodes]
  );

  // ─── Validation ────────────────────────────────────────────────────────────

  const validate = useCallback((): ValidationError[] => {
    const errors: ValidationError[] = [];
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const triggerNodes = nodes.filter(
      (node) => node.data.nodeType === 'manual_trigger' || node.data.nodeType === 'webhook_trigger'
    );
    const endNodes = nodes.filter((node) => node.data.nodeType === 'end');

    if (triggerNodes.length === 0) {
      errors.push({
        message: 'Workflow must have exactly one trigger node',
        severity: 'error',
      });
    }

    if (triggerNodes.length > 1) {
      errors.push({ message: 'Only one trigger node is allowed', severity: 'error' });
    }

    if (endNodes.length === 0) {
      errors.push({ message: 'Workflow must have at least one End node', severity: 'error' });
    }

    edges.forEach((edge) => {
      if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
        errors.push({
          message: 'One or more edges reference missing nodes',
          severity: 'error',
        });
      }
    });

    nodes.forEach((node) => {
      const outgoing = edges.filter((edge) => edge.source === node.id);
      const incoming = edges.filter((edge) => edge.target === node.id);

      if (
        (node.data.nodeType === 'manual_trigger' || node.data.nodeType === 'webhook_trigger') &&
        incoming.length > 0
      ) {
        errors.push({
          nodeId: node.id,
          message: `Trigger "${node.data.label}" cannot have incoming connections`,
          severity: 'error',
        });
      }

      if (node.data.nodeType === 'decision') {
        const trueBranches = outgoing.filter((edge) => edge.sourceHandle === 'true');
        const falseBranches = outgoing.filter((edge) => edge.sourceHandle === 'false');
        const unlabeledBranches = outgoing.filter(
          (edge) => edge.sourceHandle !== 'true' && edge.sourceHandle !== 'false'
        );

        if (trueBranches.length !== 1) {
          errors.push({
            nodeId: node.id,
            message: `Decision "${node.data.label}": exactly one TRUE branch is required`,
            severity: 'error',
          });
        }

        if (falseBranches.length !== 1) {
          errors.push({
            nodeId: node.id,
            message: `Decision "${node.data.label}": exactly one FALSE branch is required`,
            severity: 'error',
          });
        }

        if (unlabeledBranches.length > 0) {
          errors.push({
            nodeId: node.id,
            message: `Decision "${node.data.label}": branches must use the TRUE/FALSE handles`,
            severity: 'error',
          });
        }

        const groups = Array.isArray(node.data.config.conditionGroups)
          ? node.data.config.conditionGroups
          : [];

        if (groups.length === 0) {
          errors.push({
            nodeId: node.id,
            message: `Decision "${node.data.label}": add at least one condition group`,
            severity: 'error',
          });
        }
      } else if (node.data.nodeType === 'end') {
        if (outgoing.length > 0) {
          errors.push({
            nodeId: node.id,
            message: `End node "${node.data.label}" cannot have outgoing connections`,
            severity: 'error',
          });
        }
      } else {
        if (outgoing.length === 0) {
          errors.push({
            nodeId: node.id,
            message: `Node "${node.data.label}" must connect to a next node`,
            severity: 'error',
          });
        }

        if (outgoing.length > 1) {
          errors.push({
            nodeId: node.id,
            message: `Node "${node.data.label}" can only connect to one next node`,
            severity: 'error',
          });
        }
      }

      if (node.data.nodeType === 'wait') {
        const amount = Number(node.data.config.amount);
        const unit = String(node.data.config.unit ?? 'minutes');

        if (!Number.isFinite(amount) || amount < 1) {
          errors.push({
            nodeId: node.id,
            message: `Wait node "${node.data.label}" must use a positive duration`,
            severity: 'error',
          });
        }

        if (!['seconds', 'minutes', 'hours', 'days'].includes(unit)) {
          errors.push({
            nodeId: node.id,
            message: `Wait node "${node.data.label}" must use a supported duration unit`,
            severity: 'error',
          });
        }
      }

      if (node.data.nodeType === 'manual_trigger') {
        const inputPayload =
          typeof node.data.config.inputPayload === 'string' ? node.data.config.inputPayload : '{}';

        try {
          JSON.parse(inputPayload || '{}');
        } catch {
          errors.push({
            nodeId: node.id,
            message: `Manual Trigger "${node.data.label}": input payload must be valid JSON`,
            severity: 'error',
          });
        }
      }

      if (node.data.nodeType === 'api_call') {
        const method = String(node.data.config.method ?? 'GET').toUpperCase();
        const url = node.data.config.url as string;
        const headers = String(node.data.config.headers ?? '{}');
        const body = String(node.data.config.body ?? '');

        if (!url || url.trim() === '') {
          errors.push({
            nodeId: node.id,
            message: `API Call "${node.data.label}": URL is required`,
            severity: 'error',
          });
        }

        if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
          errors.push({
            nodeId: node.id,
            message: `API Call "${node.data.label}": method must be supported`,
            severity: 'error',
          });
        }

        const parsedHeaders = parseJsonCandidate(headers);
        if (!parsedHeaders || Array.isArray(parsedHeaders) || typeof parsedHeaders !== 'object') {
          errors.push({
            nodeId: node.id,
            message: `API Call "${node.data.label}": headers must be valid JSON`,
            severity: 'error',
          });
        }

        if (method !== 'GET' && body.trim()) {
          const parsedBody = parseJsonCandidate(body);

          if (parsedBody === null) {
            errors.push({
              nodeId: node.id,
              message: `API Call "${node.data.label}": request body must be valid JSON`,
              severity: 'error',
            });
          }
        }
      }

      if (node.data.nodeType === 'decision') {
        const groups = Array.isArray(node.data.config.conditionGroups)
          ? node.data.config.conditionGroups
          : [];

        groups.forEach((group) => {
          const conditions =
            typeof group === 'object' &&
            group !== null &&
            Array.isArray((group as { conditions?: unknown[] }).conditions)
              ? (group as { conditions: unknown[] }).conditions
              : [];

          if (conditions.length === 0) {
            errors.push({
              nodeId: node.id,
              message: `Decision "${node.data.label}": each group needs at least one condition`,
              severity: 'error',
            });
            return;
          }

          conditions.forEach((condition) => {
            if (!condition || typeof condition !== 'object') {
              errors.push({
                nodeId: node.id,
                message: `Decision "${node.data.label}": conditions must be valid objects`,
                severity: 'error',
              });
              return;
            }

            const typedCondition = condition as {
              field?: unknown;
              operator?: unknown;
              value?: unknown;
            };
            const field = String(typedCondition.field ?? '').trim();
            const operator = String(typedCondition.operator ?? 'eq');
            const value = String(typedCondition.value ?? '');

            if (!field) {
              errors.push({
                nodeId: node.id,
                message: `Decision "${node.data.label}": each condition needs a field path`,
                severity: 'error',
              });
            }

            if (!DECISION_OPERATORS.has(operator)) {
              errors.push({
                nodeId: node.id,
                message: `Decision "${node.data.label}": each condition needs a supported operator`,
                severity: 'error',
              });
            }

            if (!['is_null', 'is_not_null'].includes(operator) && value.trim() === '') {
              errors.push({
                nodeId: node.id,
                message: `Decision "${node.data.label}": each condition needs a comparison value`,
                severity: 'error',
              });
            }
          });
        });
      }
    });

    if (triggerNodes.length === 1) {
      const adjacency = new Map<string, string[]>();
      nodes.forEach((node) => adjacency.set(node.id, []));
      edges.forEach((edge) => {
        if (adjacency.has(edge.source) && adjacency.has(edge.target)) {
          adjacency.get(edge.source)?.push(edge.target);
        }
      });

      const reachable = new Set<string>();
      const queue = [triggerNodes[0].id];

      while (queue.length > 0) {
        const current = queue.shift();

        if (!current || reachable.has(current)) {
          continue;
        }

        reachable.add(current);
        queue.push(...(adjacency.get(current) ?? []));
      }

      nodes.forEach((node) => {
        if (!reachable.has(node.id)) {
          errors.push({
            nodeId: node.id,
            message: `Node "${node.data.label}" is unreachable`,
            severity: 'error',
          });
        }
      });

      const visited = new Set<string>();
      const activeStack = new Set<string>();

      const visit = (nodeId: string): boolean => {
        visited.add(nodeId);
        activeStack.add(nodeId);

        for (const neighbor of adjacency.get(nodeId) ?? []) {
          if (!visited.has(neighbor) && visit(neighbor)) {
            return true;
          }

          if (activeStack.has(neighbor)) {
            return true;
          }
        }

        activeStack.delete(nodeId);
        return false;
      };

      if (visit(triggerNodes[0].id)) {
        errors.push({
          message: 'Workflow contains a cycle. Remove circular connections before saving.',
          severity: 'error',
        });
      }
    }

    return errors;
  }, [nodes, edges]);

  const handleValidate = useCallback(() => {
    const errors = validate();
    setValidationErrors(errors);
    setShowValidation(true);
    if (errors.filter((e) => e.severity === 'error').length === 0) {
      toast.success('Workflow is valid — ready to run');
    } else {
      toast.error(
        `Found ${errors.filter((e) => e.severity === 'error').length} validation error(s)`
      );
    }
  }, [validate]);

  const applyBackendValidationErrors = useCallback(
    (issues: WorkflowValidationIssue[]) => {
      if (issues.length === 0) {
        return;
      }

      setValidationErrors(issues);
      setShowValidation(true);
    },
    [setValidationErrors]
  );

  const syncExecutionFromRun = useCallback((run: WorkflowRun) => {
    setExecutionRunId(run.id);
    setExecutionDuration(run.durationMs ?? undefined);
    setExecutionStatus(getExecutionStatusFromRunStatus(run.status));
    setExecutionFinalOutput(run.finalOutput ?? null);
    setExecutionErrorMessage(run.errorMessage ?? null);
    setExecutionLogs(buildExecutionLogsFromRun(run));
  }, []);

  const pollRunUntilSettled = useCallback(
    async (runId: string) => {
      for (let attempt = 0; attempt < 7200; attempt += 1) {
        await wait(2000);

        const response = await fetch(`/api/runs/${runId}`, {
          cache: 'no-store',
        });
        const payload = (await response.json()) as {
          run?: WorkflowRun;
          error?: string;
        };

        if (!response.ok || !payload.run) {
          throw new Error(payload.error ?? 'Could not load workflow run.');
        }

        syncExecutionFromRun(payload.run);

        if (isTerminalRunStatus(payload.run.status)) {
          return payload.run;
        }
      }

      appendLog(
        'system',
        'Run is still active. Keep this panel open or use the execution dashboard for long waits.'
      );
      return null;
    },
    [appendLog, syncExecutionFromRun]
  );

  // ─── Save ──────────────────────────────────────────────────────────────────

  const saveWorkflow = useCallback(
    async (options?: { silent?: boolean }) => {
      const errors = validate();
      if (errors.filter((e) => e.severity === 'error').length > 0) {
        setValidationErrors(errors);
        setShowValidation(true);
        if (!options?.silent) {
          toast.error('Fix validation errors before saving');
        }
        return null;
      }

      setIsSaving(true);
      try {
        const response = await fetch(
          workflowId ? `/api/workflows/${workflowId}` : '/api/workflows',
          {
            method: workflowId ? 'PATCH' : 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: workflowName,
              status: workflowStatus,
              nodes: serializeWorkflowNodes(nodes),
              edges: serializeWorkflowEdges(edges),
            }),
          }
        );

        const payload = (await response.json()) as {
          workflow?: WorkflowDefinition;
          error?: string;
          validationErrors?: WorkflowValidationIssue[];
        };

        if (!response.ok || !payload.workflow) {
          applyBackendValidationErrors(payload.validationErrors ?? []);
          throw new Error(payload.error ?? 'Workflow could not be saved.');
        }

        applyPersistedWorkflow(payload.workflow);
        router.replace(`/workflow-builder?id=${payload.workflow.id}`);

        if (!options?.silent) {
          toast.success(`"${payload.workflow.name}" saved successfully`);
        }

        return payload.workflow;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Workflow could not be saved.';
        toast.error(message);
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [
      applyBackendValidationErrors,
      applyPersistedWorkflow,
      edges,
      nodes,
      router,
      validate,
      workflowId,
      workflowName,
      workflowStatus,
    ]
  );

  const handleSave = useCallback(async () => {
    await saveWorkflow();
  }, [saveWorkflow]);

  // ─── Run ───────────────────────────────────────────────────────────────────

  const handleRun = useCallback(async () => {
    const errors = validate();
    if (errors.filter((e) => e.severity === 'error').length > 0) {
      setValidationErrors(errors);
      setShowValidation(true);
      toast.error('Fix validation errors before running');
      return;
    }
    setShowRunModal(true);
  }, [validate]);

  const executeWorkflow = useCallback(
    async (payload: string) => {
      let parsedPayload: unknown = {};

      try {
        parsedPayload = payload.trim() ? JSON.parse(payload) : {};
      } catch {
        setExecutionStatus('failed');
        setExecutionFinalOutput(null);
        setExecutionErrorMessage('Input payload must be valid JSON before running the workflow.');
        setExecutionLogs([
          {
            id: 'invalid-payload',
            timestamp: formatExecutionTimestamp(new Date().toISOString()),
            level: 'error',
            message: 'Input payload must be valid JSON before running the workflow.',
          },
        ]);
        setShowOutputPanel(true);
        setOutputCollapsed(false);
        setIsRunning(false);
        toast.error('Input payload must be valid JSON.');
        return;
      }

      logCounterRef.current = 0;
      setExecutionRunId(undefined);
      setExecutionLogs([]);
      setExecutionDuration(undefined);
      setExecutionFinalOutput(null);
      setExecutionErrorMessage(null);
      setExecutionStatus('running');
      setShowOutputPanel(true);
      setOutputCollapsed(false);
      appendLog('system', `Preparing workflow "${workflowName}" for execution...`);

      let targetWorkflowId = workflowId;
      let persistedWorkflow: WorkflowDefinition | null = null;

      if (!targetWorkflowId || isDirty) {
        persistedWorkflow = await saveWorkflow({ silent: true });

        if (!persistedWorkflow) {
          setExecutionStatus('failed');
          setIsRunning(false);
          return;
        }

        targetWorkflowId = persistedWorkflow.id;
      }

      try {
        const triggerType =
          persistedWorkflow?.triggerType ??
          (triggerNode?.data.nodeType === 'webhook_trigger' ? 'webhook' : 'manual');
        const endpoint =
          triggerType === 'webhook'
            ? `/api/webhooks/${targetWorkflowId}`
            : `/api/workflows/${targetWorkflowId}/run`;

        appendLog(
          'system',
          triggerType === 'webhook'
            ? `Dispatching webhook trigger to ${endpoint}`
            : `Starting manual trigger run via ${endpoint}`
        );

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body:
            triggerType === 'webhook'
              ? JSON.stringify(parsedPayload)
              : JSON.stringify({
                  inputPayload: parsedPayload,
                }),
        });

        const result = (await response.json()) as {
          run?: WorkflowRun;
          error?: string;
          validationErrors?: WorkflowValidationIssue[];
        };

        if (!response.ok || !result.run) {
          applyBackendValidationErrors(result.validationErrors ?? []);
          throw new Error(result.error ?? 'Workflow run failed.');
        }

        syncExecutionFromRun(result.run);

        if (isTerminalRunStatus(result.run.status)) {
          if (result.run.status === 'completed') {
            toast.success('Workflow run completed successfully');
          } else {
            toast.error(result.run.errorMessage ?? `Workflow run ${result.run.status}.`);
          }
        } else {
          toast.success('Workflow run started');
          const finalRun = await pollRunUntilSettled(result.run.id);

          if (finalRun?.status === 'completed') {
            toast.success('Workflow run completed successfully');
          } else if (finalRun) {
            toast.error(finalRun.errorMessage ?? `Workflow run ${finalRun.status}.`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Workflow run failed.';
        setExecutionStatus('failed');
        setExecutionFinalOutput(null);
        setExecutionErrorMessage(message);
        setExecutionLogs([
          {
            id: 'run-failed',
            timestamp: formatExecutionTimestamp(new Date().toISOString()),
            level: 'error',
            message,
          },
        ]);
        toast.error(message);
      } finally {
        setIsRunning(false);
      }
    },
    [
      appendLog,
      applyBackendValidationErrors,
      isDirty,
      pollRunUntilSettled,
      saveWorkflow,
      syncExecutionFromRun,
      triggerNode,
      workflowId,
      workflowName,
    ]
  );

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-zinc-800 bg-zinc-900 flex-shrink-0 gap-4">
        {/* Workflow name */}
        <div className="flex items-center gap-3 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={workflowName}
              onChange={(e) => {
                setWorkflowName(e.target.value);
                setIsDirty(true);
              }}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
              className="bg-zinc-800 border border-zinc-600 rounded-md px-2 py-1 text-sm text-zinc-100 font-medium focus:outline-none focus:border-emerald-500 w-52"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100 hover:text-emerald-400 transition-colors truncate max-w-[200px]"
            >
              {workflowName}
              {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
            </button>
          )}
          <span className="text-xs text-zinc-600 font-mono hidden sm:block">workflow-builder</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onDeleteSelectedItems}
            disabled={selectedItemCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200"
            title={
              selectedItemCount > 0
                ? `Delete ${selectedItemCount} selected item${selectedItemCount > 1 ? 's' : ''}`
                : 'Select nodes or edges to delete'
            }
          >
            <Trash2 size={13} />
            {selectedItemCount > 1 ? `Delete Selected (${selectedItemCount})` : 'Delete'}
          </button>

          <button
            onClick={handleValidate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 border border-zinc-700 transition-all duration-150 active:scale-95"
          >
            <CheckCircle size={13} />
            Validate
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700 transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-w-[80px] justify-center"
          >
            {isSaving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <>
                <Save size={13} />
                Save
              </>
            )}
          </button>

          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-w-[80px] justify-center"
          >
            {isRunning ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <>
                <Play size={13} />
                Run
              </>
            )}
          </button>
        </div>
      </div>

      {/* Validation banner */}
      {showValidation && validationErrors.length > 0 && (
        <ValidationPanel
          errors={validationErrors}
          onClose={() => setShowValidation(false)}
          onNodeFocus={(nodeId) => {
            const node = nodes.find((n) => n.id === nodeId);
            if (node) setSelectedNode(node);
          }}
        />
      )}

      {/* Main editor area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Node palette */}
        <NodePalette onAddNode={addNode} />

        {/* Canvas + output panel column */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Canvas */}
          <div className="flex-1 relative" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={(changes) => {
                onNodesChange(changes);
                if (hasMeaningfulNodeChanges(changes)) {
                  setIsDirty(true);
                }
              }}
              onEdgesChange={(changes) => {
                onEdgesChange(changes);
                if (hasMeaningfulEdgeChanges(changes)) {
                  setIsDirty(true);
                }
              }}
              onNodesDelete={onNodesDelete}
              onEdgesDelete={onEdgesDelete}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onSelectionChange={onSelectionChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              deleteKeyCode="Delete"
              multiSelectionKeyCode="Shift"
              className="bg-zinc-950"
              defaultEdgeOptions={{
                type: 'workflowEdge',
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#3f3f46',
                  width: 16,
                  height: 16,
                },
              }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor={(node) => {
                  const n = node as Node<NodeData>;
                  return NODE_COLORS[n.data?.nodeType]?.dot || '#52525b';
                }}
                maskColor="#09090bcc"
                style={{ background: '#18181b' }}
              />
            </ReactFlow>

            {/* Empty state overlay */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <GitBranch size={48} className="text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500 text-sm font-medium">No nodes yet</p>
                  <p className="text-zinc-700 text-xs mt-1">
                    Click a node in the palette to get started
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Execution output panel */}
          {showOutputPanel && (
            <ExecutionOutputPanel
              status={executionStatus}
              logs={executionLogs}
              runId={executionRunId}
              duration={executionDuration}
              finalOutput={executionFinalOutput}
              errorMessage={executionErrorMessage}
              onClose={() => setShowOutputPanel(false)}
              isCollapsed={outputCollapsed}
              onToggleCollapse={() => setOutputCollapsed((c) => !c)}
            />
          )}
        </div>

        {/* Config panel */}
        {selectedNode && (
          <NodeConfigPanel
            node={selectedNode}
            onUpdate={onNodeUpdate}
            onDelete={onDeleteNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Run modal */}
      {showRunModal && (
        <RunModal
          workflowName={workflowName}
          workflowId={workflowId}
          triggerNode={triggerNode}
          onClose={() => setShowRunModal(false)}
          onConfirm={async (payload) => {
            setShowRunModal(false);
            setIsRunning(true);
            await executeWorkflow(payload);
          }}
        />
      )}
    </div>
  );
}

// ─── Run Modal ────────────────────────────────────────────────────────────────

function RunModal({
  workflowName,
  workflowId,
  triggerNode,
  onClose,
  onConfirm,
}: {
  workflowName: string;
  workflowId?: string | null;
  triggerNode?: Node<NodeData>;
  onClose: () => void;
  onConfirm: (payload: string) => Promise<void>;
}) {
  const [payload, setPayload] = useState((triggerNode?.data.config.inputPayload as string) || '{}');
  const [running, setRunning] = useState(false);
  const [origin, setOrigin] = useState('');
  const isWebhookTrigger = triggerNode?.data.nodeType === 'webhook_trigger';
  const savedWebhookPath =
    typeof triggerNode?.data.config.webhookPath === 'string' && triggerNode.data.config.webhookPath
      ? triggerNode.data.config.webhookPath
      : (workflowId ?? '');
  const webhookUrl =
    isWebhookTrigger && savedWebhookPath && origin
      ? `${origin}/api/webhooks/${savedWebhookPath}`
      : 'The workflow will be saved first to generate the webhook URL.';

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              {isWebhookTrigger ? 'Send Webhook Trigger' : 'Run Workflow'}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">{workflowName}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {isWebhookTrigger && (
            <div className="mb-3 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-400">
                Webhook Endpoint
              </p>
              <code className="mt-1 block break-all text-[11px] font-mono text-blue-200">
                {webhookUrl}
              </code>
            </div>
          )}
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Input Payload (JSON)
          </label>
          <p className="text-[11px] text-zinc-600 mb-2">
            {isWebhookTrigger
              ? 'This JSON will be POSTed to the workflow webhook endpoint.'
              : 'This JSON will be passed as the initial input to the workflow.'}
          </p>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={6}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs font-mono text-zinc-300 focus:outline-none focus:border-emerald-500 resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-all duration-150"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              setRunning(true);
              await onConfirm(payload);
              setRunning(false);
            }}
            disabled={running}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all duration-150 active:scale-95 disabled:opacity-50 min-w-[80px] justify-center"
          >
            {running ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <>
                <Play size={12} /> {isWebhookTrigger ? 'Send Webhook' : 'Start Run'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
