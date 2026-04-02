# Torq Flows Workflow Builder

Torq Flows is a full-stack workflow editor built with:

- Next.js App Router + Tailwind CSS for the frontend
- React Flow for the canvas editor
- FastAPI for backend APIs
- Temporal Python SDK for orchestration
- PostgreSQL for persistence

The frontend keeps the existing editor UX, while the backend owns workflow CRUD, graph validation, normalization, run persistence, webhook execution, and Temporal workflow startup.

## What’s Implemented

- Visual workflow builder with add, move, connect, delete node, and delete edge support
- Node configuration side panel
- Manual trigger, webhook trigger, decision, wait, API call, and end nodes
- Backend graph validation for:
  - exactly one trigger
  - at least one end node
  - unreachable nodes
  - cycles
  - missing decision branches
  - invalid linear connections
  - incomplete wait/API/decision configuration
- Backend normalization from React Flow graph to explicit `startAt` / `nodes` definition
- PostgreSQL persistence for workflows, normalized definitions, runs, and logs
- Manual trigger execution from the builder and workflow list
- Webhook trigger execution at `POST /api/webhooks/{workflow_id}` plus UI support for sending a test webhook payload
- Temporal worker execution with:
  - durable wait nodes via `workflow.sleep`
  - HTTP API call activities
  - run/log persistence back to PostgreSQL
- Run history and execution log inspection in the UI
- Final output and error inspection in both the builder output panel and the run dashboard
- Runtime execution IDs stored with each run record

## Failure Policy

API call failures stop the run.

When an action node fails:

- the node failure is written to run logs,
- the workflow run is marked failed in PostgreSQL,
- the Temporal workflow fails.

## Prerequisites

- Node.js 20+
- Python 3.9+
- PostgreSQL
- Temporal server running locally
- Docker Engine + Docker Compose v2 for the deployment flow below

## Environment

Use [`.env.example`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/.env.example) as the local development template.

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/torqFlows
DATABASE_SSL=false
BACKEND_API_URL=http://127.0.0.1:8000
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=torq-flows-workflows
API_REQUEST_TIMEOUT_SECONDS=30
```

If you use Temporal Cloud instead of the local dev server, add:

```env
TEMPORAL_API_KEY=replace-with-your-temporal-api-key
```

Supabase note:

- Supabase is supported as a PostgreSQL host.
- Use your Supabase Postgres connection string as `DATABASE_URL`.
- No Supabase client SDK is required for this assignment.

For container deployment, use [`.env.production.example`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/.env.production.example).

## Install

Frontend:

```bash
npm install
```

Backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

## Running the App

1. Start PostgreSQL and make sure `DATABASE_URL` is valid.
2. Start the full local stack:

```bash
npm run dev
```

This now starts:

- the Temporal dev server, if one is not already running on `localhost:7233`
- the FastAPI backend on `127.0.0.1:8000`
- the Temporal worker
- the Next.js frontend on `127.0.0.1:4028`

If you want to run pieces individually while debugging, these scripts still work:

```bash
npm run backend:api
npm run backend:worker
npm run frontend:dev
```

Frontend:

- http://127.0.0.1:4028

Backend:

- http://127.0.0.1:8000

Authentication:

- Open `/register` to create the first account.
- After registering, the app creates a PostgreSQL-backed session cookie and redirects into the product.
- Subsequent visits use `/login` until the session expires or you log out.

## Production Deployment

The repo now includes a production-oriented deployment baseline:

- [Dockerfile.frontend](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/Dockerfile.frontend) builds the Next.js app in standalone mode.
- [backend/Dockerfile](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/backend/Dockerfile) builds a reusable FastAPI/worker image.
- [docker-compose.production.yml](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/docker-compose.production.yml) starts PostgreSQL, the backend API, the Temporal worker, and the frontend with health checks.

Important production assumption:

- The production compose stack expects `TEMPORAL_ADDRESS` to point at a managed Temporal namespace or an existing self-hosted Temporal deployment.
- If that managed namespace uses Temporal Cloud API key auth, set `TEMPORAL_API_KEY` too.
- It does not run `temporal server start-dev` inside the production stack.

Deployment steps:

1. Copy `.env.production.example` to `.env.production` and replace every placeholder value.
2. Set `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, and `TEMPORAL_API_KEY` to your real Temporal Cloud values, and keep `BACKEND_API_URL=http://backend-api:8000` for the internal frontend-to-backend hop.
3. Build and start the stack:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

4. Confirm readiness:

- Frontend health: `http://<host>:<FRONTEND_PORT>/api/health`
- Backend health: `http://<host>:<BACKEND_PUBLIC_PORT>/health/ready`

5. Redeploy updates with the same `docker compose ... up -d --build` command.

Operational notes:

- The frontend image bakes in `NEXT_PUBLIC_*` values at build time, so changing branding or `NEXT_PUBLIC_SITE_URL` requires rebuilding the frontend image.
- The frontend depends on the backend readiness endpoint, and the backend depends on both PostgreSQL and Temporal connectivity before it reports healthy.
- The backend and worker containers share one image, which keeps the API and Temporal worker on the same application version.
- The example env files intentionally include only the baseline variables for the default API-key setup. Add `TEMPORAL_TLS_*` variables only if you switch to mTLS.

## Railway Deployment

The clean Railway setup for this repo is:

- one Railway web service for the Next.js frontend
- one Railway web service for the FastAPI backend API
- one Railway worker service for the Temporal worker
- one Railway PostgreSQL service
- Temporal Cloud or another existing Temporal deployment for orchestration

Use the Railway service config files in [`railway/README.md`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/railway/README.md):

- [`railway/frontend.json`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/railway/frontend.json)
- [`railway/api.json`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/railway/api.json)
- [`railway/worker.json`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/railway/worker.json)

Important notes:

- The backend and worker support Temporal Cloud credentials through `TEMPORAL_API_KEY`.
- The frontend Docker build now understands Railway's `RAILWAY_PUBLIC_DOMAIN` build variable, so `NEXT_PUBLIC_SITE_URL` can be derived automatically after a Railway domain exists.
- Railway service variables are available during Docker builds, but Dockerfiles must declare them with `ARG` before use.

Railway flow:

1. Push the repo to GitHub.
2. Create a Railway project and add a PostgreSQL service.
3. Add `frontend`, `api`, and `worker` services from the same GitHub repo.
4. Set each service's Railway config file path as documented in [`railway/README.md`](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/railway/README.md).
5. Generate public domains for the `frontend` and `api` services.
6. Add the required service variables, especially `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `DATABASE_SSL=true`, and `BACKEND_API_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}` on the frontend service.
7. Deploy the staged changes and confirm the frontend `/api/health/live` endpoint, the frontend `/api/health` diagnostic endpoint, and the backend `/health/ready` endpoint report healthy.

## Helpful Endpoints

- `GET /api/health`
- `GET /api/health/live`
- `GET /health/live`
- `GET /health/ready`
- `GET /api/workflows`
- `POST /api/workflows`
- `PUT /api/workflows/{id}`
- `PATCH /api/workflows/{id}`
- `POST /api/workflows/{id}/run`
- `GET /api/runs`
- `GET /api/runs/{run_id}`
- `POST /api/webhooks/{workflow_id}`

## Notes

- The Next.js API routes are now a thin authenticated proxy/BFF layer.
- The FastAPI backend is the system of record for workflow CRUD, validation, normalization, and run execution.
- Authentication is always enabled and uses PostgreSQL-backed users plus hashed-password sessions.
- The Next.js-side PostgreSQL schema is now limited to users and sessions; workflow and run tables are owned by the FastAPI backend.

## Architecture

See [docs/architecture.md](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/docs/architecture.md).

## Requirement Mapping

See [docs/spec-checklist.md](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/docs/spec-checklist.md) for a requirement-by-requirement implementation checklist.

## Walkthrough Video Script

See [docs/walkthrough-script.md](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/docs/walkthrough-script.md) for a concise recording script that covers the required demo flow.
