from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


WorkflowStatus = Literal["active", "draft", "archived"]
TriggerType = Literal["manual", "webhook"]
RunStatus = Literal["queued", "running", "completed", "failed", "cancelled", "timed_out"]
NodeExecutionStatus = Literal["pending", "running", "completed", "failed", "skipped"]
Severity = Literal["error", "warning"]
NodeType = Literal[
    "manual_trigger",
    "webhook_trigger",
    "decision",
    "wait",
    "api_call",
    "end",
]


class NodePosition(BaseModel):
    x: float = 0
    y: float = 0


class WorkflowNodeDefinition(BaseModel):
    id: str
    nodeType: NodeType
    label: str
    position: NodePosition
    config: Dict[str, Any] = Field(default_factory=dict)


class WorkflowEdgeDefinition(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None


class ValidationIssue(BaseModel):
    nodeId: Optional[str] = None
    message: str
    severity: Severity = "error"
    code: Optional[str] = None


class NormalizedWorkflowNode(BaseModel):
    id: str
    label: str
    type: Literal["trigger", "decision", "action"]
    node_type: NodeType
    trigger_kind: Optional[TriggerType] = None
    action_name: Optional[str] = None
    config: Dict[str, Any] = Field(default_factory=dict)
    next_node: Optional[str] = None
    next_nodes: Dict[str, str] = Field(default_factory=dict)


class NormalizedWorkflowDefinition(BaseModel):
    startAt: str
    nodes: Dict[str, NormalizedWorkflowNode]


class WorkflowUpsertRequest(BaseModel):
    name: str = "Untitled Workflow"
    status: WorkflowStatus = "active"
    nodes: List[WorkflowNodeDefinition] = Field(default_factory=list)
    edges: List[WorkflowEdgeDefinition] = Field(default_factory=list)


class WorkflowDefinitionResponse(BaseModel):
    id: str
    name: str
    description: str
    status: WorkflowStatus
    triggerType: TriggerType
    webhookPath: Optional[str] = None
    nodes: List[WorkflowNodeDefinition] = Field(default_factory=list)
    edges: List[WorkflowEdgeDefinition] = Field(default_factory=list)
    createdAt: str
    updatedAt: str


class WorkflowListItem(BaseModel):
    id: str
    name: str
    status: WorkflowStatus
    triggerType: TriggerType
    webhookPath: Optional[str] = None
    nodeCount: int = 0
    edgeCount: int = 0
    lastRunStatus: Optional[RunStatus] = None
    lastRunAt: Optional[str] = None
    totalRuns: int = 0
    successRate: float = 0
    createdAt: str
    updatedAt: str
    description: str = ""


class RunLog(BaseModel):
    id: str
    nodeId: str
    nodeType: NodeType
    nodeLabel: str
    status: NodeExecutionStatus
    startedAt: str
    completedAt: Optional[str] = None
    durationMs: Optional[int] = None
    output: str = ""
    error: Optional[str] = None


class WorkflowRun(BaseModel):
    id: str
    workflowId: str
    workflowName: str
    temporalRunId: str
    status: RunStatus
    triggerType: TriggerType
    startedAt: str
    completedAt: Optional[str] = None
    durationMs: Optional[int] = None
    nodeCount: int = 0
    nodesCompleted: int = 0
    inputPayload: str = "{}"
    finalOutput: Optional[str] = None
    errorMessage: Optional[str] = None
    nodeLogs: List[RunLog] = Field(default_factory=list)


class AppShellCounts(BaseModel):
    workflowCount: int = 0
    activeRunCount: int = 0


class RunStartRequest(BaseModel):
    inputPayload: Any = Field(default_factory=dict)


class BulkDeleteRequest(BaseModel):
    ids: List[str] = Field(default_factory=list)
