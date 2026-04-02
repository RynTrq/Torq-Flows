# Take-Home Spec Checklist

This checklist maps the take-home requirements to the current implementation.

## Stack

- Frontend: Next.js App Router in [`src/app/layout.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/layout.tsx)
- UI: Tailwind CSS in [`tailwind.config.js`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/tailwind.config.js) and [`src/styles/tailwind.css`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/styles/tailwind.css)
- Canvas: React Flow in [`WorkflowBuilderCanvas.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/WorkflowBuilderCanvas.tsx)
- Backend: FastAPI in [`backend/app/main.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/main.py)
- Orchestration: Temporal Python SDK in [`backend/app/temporal_runtime.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/temporal_runtime.py)
- Persistence: PostgreSQL in [`backend/app/database.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/database.py)

## Frontend Builder

- Add nodes from the palette: [`NodePalette.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/NodePalette.tsx)
- Connect nodes with directed edges and arrowheads: [`WorkflowBuilderCanvas.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/WorkflowBuilderCanvas.tsx)
- Move nodes on the canvas: React Flow editor in [`WorkflowBuilderCanvas.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/WorkflowBuilderCanvas.tsx)
- Delete nodes: toolbar selection delete plus side-panel delete in [`WorkflowBuilderCanvas.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/WorkflowBuilderCanvas.tsx) and [`NodeConfigPanel.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/NodeConfigPanel.tsx)
- Delete edges: selection delete and `onEdgesDelete` handling in [`WorkflowBuilderCanvas.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/WorkflowBuilderCanvas.tsx)
- Configure nodes in a side panel: [`NodeConfigPanel.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/NodeConfigPanel.tsx)
- Save workflows: [`WorkflowBuilderCanvas.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/WorkflowBuilderCanvas.tsx)
- Load workflows: [`workflow-builder/page.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/page.tsx) and [`WorkflowTable.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-management/components/WorkflowTable.tsx)
- Run workflows manually: run modal and execution flow in [`WorkflowBuilderCanvas.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/WorkflowBuilderCanvas.tsx)
- Trigger webhook workflows from the UI against the webhook endpoint: [`WorkflowBuilderCanvas.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/WorkflowBuilderCanvas.tsx) and [`WorkflowTable.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-management/components/WorkflowTable.tsx)
- View run output and logs: [`ExecutionOutputPanel.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/ExecutionOutputPanel.tsx) and [`RunsTable.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/execution-dashboard/components/RunsTable.tsx)
- Canvas summaries for node types: `getNodeSummary()` in [`WorkflowBuilderCanvas.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/WorkflowBuilderCanvas.tsx)
- Distinct TRUE/FALSE decision handles: custom node rendering in [`WorkflowBuilderCanvas.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/WorkflowBuilderCanvas.tsx)

## Node Types

- Manual Trigger: UI payload input in [`NodeConfigPanel.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/NodeConfigPanel.tsx)
- Webhook Trigger: saved webhook URL and proxy endpoint in [`NodeConfigPanel.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/NodeConfigPanel.tsx) and [`src/app/api/webhooks/[path]/route.ts`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/api/webhooks/[path]/route.ts)
- Decision Node: condition groups and supported operators in [`NodeConfigPanel.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/NodeConfigPanel.tsx) and [`backend/app/graph.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/graph.py)
- Wait Node: durable timer configuration in [`NodeConfigPanel.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/NodeConfigPanel.tsx) and durable execution in [`backend/app/temporal_runtime.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/temporal_runtime.py)
- API Call Node: method, URL, headers, body, timeout, and execution output in [`NodeConfigPanel.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/NodeConfigPanel.tsx) and [`backend/app/temporal_runtime.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/temporal_runtime.py)
- End Node: final output selection and terminal completion in [`NodeConfigPanel.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/NodeConfigPanel.tsx) and [`backend/app/temporal_runtime.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/temporal_runtime.py)

## Backend Ownership

- Workflow CRUD: [`backend/app/main.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/main.py) and [`backend/app/service.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/service.py)
- Graph validation: [`backend/app/graph.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/graph.py)
- Graph normalization to `startAt`, `next_node`, `next_nodes`: [`backend/app/graph.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/graph.py)
- Temporal workflow startup and run-time revalidation: [`backend/app/service.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/service.py)
- Webhook-triggered runs: [`backend/app/main.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/main.py) and [`backend/app/service.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/service.py)
- Run status and logs persistence: [`backend/app/database.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/database.py) and [`backend/app/service.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/service.py)
- UI-facing run data: [`backend/app/service.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/service.py) and [`src/lib/server/workflow-service.ts`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/lib/server/workflow-service.ts)

## Validation Rules

- No trigger or more than one trigger: [`backend/app/graph.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/graph.py)
- No end node: [`backend/app/graph.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/graph.py)
- Unreachable nodes: [`backend/app/graph.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/graph.py)
- Cycles: [`backend/app/graph.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/graph.py)
- Missing decision branches: [`backend/app/graph.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/graph.py)
- Incomplete configuration for decision, wait, and API call nodes: [`backend/app/graph.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/graph.py)
- Structured validation errors shown in the UI: [`ValidationPanel.tsx`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/workflow-builder/components/ValidationPanel.tsx) plus Next route error passthrough in [`src/app/api/workflows/route.ts`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/src/app/api/workflows/route.ts)

## Persistence

- Workflows, raw nodes, raw edges, normalized definition: [`backend/app/database.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/database.py)
- Run records and run status: [`backend/app/database.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/database.py)
- Per-node execution logs: [`backend/app/database.py`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/app/database.py)

## Documentation

- Setup instructions: [`README.md`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/README.md)
- Architecture note: [`docs/architecture.md`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/docs/architecture.md)
- Walkthrough video recording script: [`docs/walkthrough-script.md`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/docs/walkthrough-script.md)
- PostgreSQL-backed authentication documented in [`README.md`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/README.md)
