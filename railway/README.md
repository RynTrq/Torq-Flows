# Railway Deployment

Create one Railway project with four services:

- `Postgres`
- `frontend`
- `api`
- `worker`

For each code service:

- connect the same GitHub repository
- leave the root directory at the repository root
- set the Railway config file path in the service settings:

- `frontend` -> `/railway/frontend.json`
- `api` -> `/railway/api.json`
- `worker` -> `/railway/worker.json`

Generate Railway public domains for:

- `frontend`
- `api`

Set these service variables.

## frontend

```env
BACKEND_API_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}
```

Optional variables:

```env
NEXT_PUBLIC_SITE_URL=https://replace-with-your-frontend-domain.up.railway.app
NEXT_PUBLIC_APP_NAME=Torq Flows
NEXT_PUBLIC_APP_DESCRIPTION=Design, run, and monitor visual workflow automations with a durable execution runtime.
```

If `NEXT_PUBLIC_SITE_URL` is omitted, [Dockerfile.frontend](/Users/raiyaan/Desktop/Padhai%20Likhai/Torq%20Flows/Dockerfile.frontend) falls back to `RAILWAY_PUBLIC_DOMAIN` during the build after a Railway domain exists. Generate the frontend domain first, then redeploy the frontend service.

## api

```env
APP_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
TEMPORAL_ADDRESS=replace-with-your-temporal-endpoint:7233
TEMPORAL_NAMESPACE=replace-with-your-temporal-namespace
TEMPORAL_API_KEY=replace-with-your-temporal-api-key
TEMPORAL_TASK_QUEUE=torq-flows-workflows
API_REQUEST_TIMEOUT_SECONDS=30
```

## worker

```env
APP_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=true
TEMPORAL_ADDRESS=replace-with-your-temporal-endpoint:7233
TEMPORAL_NAMESPACE=replace-with-your-temporal-namespace
TEMPORAL_API_KEY=replace-with-your-temporal-api-key
TEMPORAL_TASK_QUEUE=torq-flows-workflows
API_REQUEST_TIMEOUT_SECONDS=30
```

After all services are configured, deploy the staged changes and verify:

- frontend health: `/api/health`
- backend health: `/health/ready`
- webhook/public API base: the generated public domain on the `api` service
