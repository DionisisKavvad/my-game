# Hero Wars MVP - Technical Decisions

This document records all strategic decisions made regarding doc-vs-code inconsistencies and architecture choices. Each decision includes context, rationale, and required actions.

---

## Decision 1: JWT Algorithm (HS256 vs RS256)

- **Context:** Architecture doc specifies RS256 (asymmetric key pairs), but the code uses HS256 (symmetric via `JWT_SECRET`).
- **Decision:** Keep HS256 for MVP. RS256 is needed for microservices where individual services verify tokens independently without sharing secrets. For a monolithic NestJS API, HS256 is simpler and sufficient.
- **Action:** Update architecture doc to reflect HS256. Plan RS256 migration when/if moving to microservices.

## Decision 2: Starting Gold & Gems

- **Context:** Architecture doc says 1000 gold / 50 gems. Code uses 500 gold / 100 gems.
- **Decision:** Use 500 gold / 100 gems (current code values). 100 gems gives new players enough for one premium action, which hooks engagement. 500 gold is enough for initial upgrades without inflating the economy.
- **Action:** Update architecture doc to match code values (500 gold / 100 gems).

## Decision 3: Hero Template ID Format

- **Context:** Architecture doc says VARCHAR(32) with human-readable IDs (e.g., `"warrior_blade"`). Code uses UUID with `@default(uuid())`.
- **Decision:** Switch to human-readable string IDs. They make seeding, debugging, config files, and game design iteration much easier. UUIDs add no value for a fixed content catalog.
- **Action:** Update Prisma schema -- change `HeroTemplate.id` to `String @id` (remove `@default(uuid())`), use human-readable slugs like `"warrior_blade"`. Update `seed.ts` accordingly.

## Decision 4: rng_seed Type

- **Context:** Architecture doc says BIGINT, code uses `Int` (32-bit).
- **Decision:** Keep `Int` (32-bit). The Mulberry32 PRNG algorithm operates on 32-bit integers, so BIGINT adds no benefit and wastes storage.
- **Action:** Update architecture doc to reflect Int/32-bit.

## Decision 5: Deployment Strategy

- **Context:** Lambda requires EventBridge rewrites for `@Cron` decorators, has 2-5s cold starts on NestJS bootstrap, and costs more at low DAU.
- **Decision:** Use ECS Fargate for MVP. Single task, ~$80-120/month. `@Cron` works natively with `@nestjs/schedule`. No cold starts. Docker gives local-dev parity. Migrate to Lambda only when scaling demands it (>5K DAU).
- **Action:** Implement ECS Fargate deployment configuration.

## Decision 6: Cost Estimate

- **Context:** Architecture doc claims $70/month. Realistic estimate is $150-200/month (Lambda) or $80-120/month (ECS Fargate).
- **Decision:** Revise to $100/month target using ECS Fargate:
  - ~$35 Fargate (0.25 vCPU, 0.5 GB)
  - ~$15 RDS t4g.micro
  - ~$15 ElastiCache t4g.micro
  - ~$20 CloudFront + S3
  - ~$15 misc (CloudWatch, Secrets Manager, data transfer)
- **Action:** Update architecture doc with realistic cost breakdown.

## Decision 7: Timeline

- **Context:** The 14-week estimate for a single developer is unrealistic given MVP scope.
- **Decision:** MVP scope cut to 12 weeks:
  - Sprint 1-2: Foundation + Auth (3 weeks)
  - Sprint 3-4: Battle Engine + Basic UI (4 weeks)
  - Sprint 5-6: Campaign + Heroes (3 weeks)
  - Sprint 7: Polish + Deploy (2 weeks)
  - **Phase 2 (post-MVP):** Daily quests, leaderboard, advanced campaign
- **Action:** Create a revised timeline in the architecture doc.

## Decision 8: Mobile Support

- **Context:** Hero Wars clones are primarily mobile games. No mobile support in current architecture.
- **Decision:** Desktop-first MVP. Add viewport meta tag and `Phaser.Scale.FIT` for basic responsiveness, but full mobile optimization is Phase 2. Core game mechanics and balance need to be proven on desktop first.
- **Action:** Add viewport meta tag to `index.html`. Configure Phaser scale mode.

---

## Security Notes

- `.env` is listed in `.gitignore` and has never been committed to git history (verified).
- JWT uses HS256 with a `JWT_SECRET` environment variable. Ensure the secret is cryptographically strong (min 256-bit) in production.
