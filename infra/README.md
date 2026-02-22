# Hero Wars Infrastructure

## Recommended: ECS Fargate (MVP)

For the MVP phase, **ECS Fargate** is the recommended deployment target. The API runs as a long-lived NestJS process behind an Application Load Balancer (ALB).

### Why ECS Fargate over Lambda

| Concern | ECS Fargate | Lambda |
|---------|-------------|--------|
| Cold starts | None (long-running) | 3-8s for NestJS bootstrap |
| @Cron / scheduled tasks | Works natively via `@nestjs/schedule` | Requires separate EventBridge rules + handler functions |
| WebSocket support | Supported directly | Requires API Gateway WebSocket API (added complexity) |
| Cost at low traffic | Predictable ~$80-120/month | $150-200/month (frequent cold starts + API Gateway costs) |
| Deployment complexity | Single Dockerfile | Bundling NestJS for Lambda + managing API Gateway + EventBridge |
| Redis connectivity | Direct VPC connection | Requires VPC Lambda (adds cold start penalty) |

### Architecture

```
Internet -> ALB -> ECS Fargate (NestJS API) -> RDS PostgreSQL
                                            -> ElastiCache Redis
```

### Cost Estimate (MVP)

| Resource | Monthly Cost |
|----------|-------------|
| ECS Fargate (0.5 vCPU, 1GB) | ~$35 |
| ALB | ~$20 |
| RDS db.t4g.micro | ~$15 |
| ElastiCache cache.t4g.micro | ~$12 |
| ECR storage | ~$1 |
| Data transfer | ~$5 |
| **Total** | **~$88/month** |

### Scheduled Tasks

Scheduled tasks (daily quest reset, energy regeneration) use `@nestjs/schedule` with `@Cron` decorators. This works reliably on ECS Fargate since the process is long-running.

If you later need to scale to multiple ECS tasks, use a distributed lock in Redis to ensure only one instance runs each scheduled job.

### Future: Lambda Migration Path

When scaling demands it (thousands of concurrent users, bursty traffic patterns), consider migrating to Lambda:

1. Extract scheduled tasks to EventBridge + dedicated Lambda handlers
2. Bundle the NestJS app with `@vendia/serverless-express` for API Gateway
3. Move WebSocket to API Gateway WebSocket API
4. Use RDS Proxy for connection pooling

This migration makes sense when traffic is highly variable and the cost of always-on Fargate exceeds Lambda's per-request pricing.

### Health Check

The API exposes `GET /health` which returns database and Redis connectivity status with an appropriate HTTP status code (200 for healthy, 503 for degraded). The `docker-compose.yml` healthcheck is configured to use this endpoint.

### Environment Variables

| Variable             | Description                    | Required |
|----------------------|--------------------------------|----------|
| `DATABASE_URL`       | PostgreSQL connection string   | Yes      |
| `REDIS_URL`          | Redis connection string        | Yes      |
| `JWT_SECRET`         | Secret for signing JWTs (min 256-bit) | Yes |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens      | Yes      |
| `JWT_ACCESS_EXPIRY`  | Access token TTL (default 15m) | No       |
| `JWT_REFRESH_TTL`    | Refresh token TTL in seconds (default 2592000) | No |
| `NODE_ENV`           | development / production / test | No      |
| `PORT`               | API port (default 3000)        | No       |

## Local Development

```bash
# Start postgres + redis
docker compose up -d postgres redis

# Start API with live reload
pnpm start:api

# Or run everything including the API container
docker compose up -d
```
