# Architecture Note

## High-Level Design

The system is split into three layers:

1. Next.js frontend
2. FastAPI backend
3. Temporal worker

The Next.js app is responsible for the editor UI, auth/session handling, and thin proxy routes used by the browser. The FastAPI backend owns workflow CRUD, validation, normalization, webhook execution, run persistence, and Temporal workflow startup. The Temporal worker executes the normalized workflow definitions durably.

## Why Normalize the Graph

The frontend uses a canvas graph model, but the worker does not execute raw React Flow JSON directly.

Before persistence, the backend:

- validates the raw nodes/edges
- enforces a single explicit start node
- converts linear nodes to `next_node`
- converts decision nodes to `next_nodes`

That produces a backend-owned definition similar to:

```json
{
  "startAt": "trigger_1",
  "nodes": {
    "trigger_1": {
      "id": "trigger_1",
      "type": "trigger",
      "node_type": "manual_trigger",
      "next_node": "decision_1"
    }
  }
}
```

This keeps the worker deterministic and prevents the execution engine from being tightly coupled to the UI library.

## Temporal Execution Model

The FastAPI backend revalidates and renormalizes the stored graph when a run starts, inserts a run record, and then starts a Temporal workflow with:

- run id
- workflow id
- normalized definition
- input payload

Inside Temporal:

- trigger nodes pass the payload forward
- decision nodes evaluate condition groups deterministically
- wait nodes use `workflow.sleep`
- API call nodes execute through activities
- end nodes resolve and store final output

Each executed node writes run logs back to PostgreSQL through activities.

The backend also updates the run record with the actual runtime execution ID returned by `start_workflow`, so the dashboard reflects the real execution identifier instead of the application-side workflow ID placeholder.

## Persistence Model

PostgreSQL stores:

- raw workflow graph (`nodes_json`, `edges_json`)
- normalized definition (`definition_json`)
- workflow metadata
- workflow runs
- per-node execution logs

This supports reloading the editor with raw canvas data while still letting the runtime execute the normalized definition.

## Frontend/Backend Separation

The browser continues to call `/api/...` routes in the Next app, but those routes no longer contain execution logic. They only:

- authenticate the session
- forward the user context
- proxy to FastAPI
- preserve structured validation errors for the UI

That keeps the separation clean without forcing a full frontend rewrite.
