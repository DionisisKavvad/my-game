# Consolidated Architecture Review: Hero Wars MVP

**Date**: 2026-02-22
**Document Reviewed**: HeroWars_MVP_Architecture.txt (v1.0)
**Review Panel**: Solution Architect, UI/UX Expert, Security Expert, Devil's Advocate
**Total Findings**: 40+

---

## Executive Summary

The architecture's **concepts are sound** -- shared battle engine, deterministic validation, serverless MVP, Nx monorepo. However, the **implementation has critical security holes** (token storage, economy races, seed exposure), the **battle engine has determinism bugs**, and the **planning has blind spots** (cost, timeline, mobile, operational readiness).

**Verdict**: Fix the 5 critical issues before writing more feature code. Revise cost estimates, timeline, and deployment strategy.

---

## CRITICAL Issues (Fix Before Writing More Code)

### 1. Battle Engine Determinism is Broken
**Flagged by**: Solution Architect, Devil's Advocate

**A) `Array.sort()` with speed ties -- no tiebreaker**
- Location: `libs/battle-engine/src/simulator.ts:34`
- Code: `aliveHeroes.sort((a, b) => b.stats.speed - a.stats.speed)`
- Problem: JavaScript's `Array.sort()` is not guaranteed stable across engines. Two heroes with the same speed value could be ordered differently in Chrome vs Safari vs Node.js. When speed ties occur (and they WILL with integer stats), the battle diverges between client and server.
- Fix: Add a tiebreaker to the comparator:
  ```typescript
  aliveHeroes.sort((a, b) => b.stats.speed - a.stats.speed || a.id.localeCompare(b.id));
  ```

**B) `Date.now()` in deterministic path**
- Location: `libs/battle-engine/src/simulator.ts:28,112`
- Code: `const startTime = Date.now()` ... `durationMs: Date.now() - startTime`
- Problem: `Date.now()` is NOT deterministic. The execution time will ALWAYS differ between client and server. If the server compares the full BattleLog including `durationMs`, every single battle will be flagged as a mismatch.
- Fix: Remove `Date.now()` from the battle engine. Calculate duration from turn count, or exclude `durationMs` from the validation comparison entirely.

### 2. RNG Seed Exposed to Client -- Defeats Anti-Cheat
**Flagged by**: Security Expert, Devil's Advocate

- Battle flow (doc line 337-338): `POST /battles/start` returns `{ battle_id, rng_seed, enemy_config }`
- Problem: The client receives the seed BEFORE the battle. A cheater can:
  1. Receive the seed and enemy config
  2. Run the battle engine locally (it's readable JavaScript) with different strategies
  3. Pre-compute every dodge, crit, and optimal action sequence
  4. Submit only the winning battle log that matches the server's expected output
- Impact: The anti-cheat is "theater" -- prevents casual reward modification but is trivially defeated by anyone who can read JavaScript.
- Fix options:
  - **Option A (Recommended)**: Commit-reveal scheme. Server generates `SHA256(seed)` and sends the hash. Client uses a temporary random seed for visuals. After battle submission, server reveals actual seed and validates.
  - **Option B**: Don't send seed at all. Client submits player actions (attack choices, skill targets). Server resolves outcomes and returns results for animation. This changes the architecture to require more server round-trips.
  - **Option C (Minimum)**: Rate-limit battle starts, monitor win rates for statistical anomalies, obfuscate battle engine code.

### 3. Refresh Tokens in localStorage, NOT HttpOnly Cookies
**Flagged by**: Security Expert

- Document (line 564): States "HttpOnly Cookie for refresh token (not localStorage)"
- Actual implementation (`apps/client/src/app/core/services/auth.service.ts:113-114`):
  ```typescript
  localStorage.setItem(this.TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(this.REFRESH_KEY, tokens.refreshToken);
  ```
- Impact: Refresh tokens in `localStorage` are vulnerable to XSS attacks. Any XSS vulnerability allows an attacker to steal the refresh token and maintain long-term access (30 days). This is a direct contradiction of the architecture's security design.
- Fix: Return the refresh token as an `HttpOnly; Secure; SameSite=Strict` cookie from the server. The client should NOT have JavaScript access to it. When migrating to cookies, also implement CSRF protection.

### 4. No Transactional Integrity on Economy Operations
**Flagged by**: Security Expert

- Problem: No database transactions wrap reward grants. Concurrent requests can exploit:
  - `POST /battles/:id/complete` -- validate + grant rewards is not atomic
  - `POST /quests/:id/claim` -- read `claimed=false` + grant is not atomic
- Attack: Send 10 simultaneous claim requests. Without transactional locking, all 10 may succeed, granting 10x rewards.
- Fix:
  - Use Prisma `$transaction` to atomically: validate battle + set `validated=true` + grant rewards
  - Use `UPDATE ... WHERE claimed = false RETURNING *` for atomic quest claims
  - Add database-level CHECK constraints: `CHECK (gold >= 0)`, `CHECK (gems >= 0)`, `CHECK (energy >= 0)`

### 5. `@Cron` Doesn't Work in Lambda
**Flagged by**: Solution Architect, Devil's Advocate

- Document (section 2.2, line 61): Mentions "NestJS Schedule (@Cron) for daily resets, energy regen"
- Problem: Cron decorators require a long-running process. Lambda functions are ephemeral -- there is no persistent process to schedule cron. Daily resets and energy regen will silently never run.
- Fix:
  - **Option A**: Use AWS EventBridge Scheduled Rules triggering dedicated Lambda functions for cron jobs
  - **Option B**: Switch from Lambda to ECS/Fargate or EC2 where NestJS runs as a long-lived process and `@Cron` works natively

---

## SERIOUS Warnings (Fix Before Launch)

### Architecture & Infrastructure

#### 6. $70/month Cost Estimate is Unrealistic
**Flagged by**: Devil's Advocate

Missing line items from the cost table:
| Item | Estimated Cost |
|------|---------------|
| RDS Proxy (2 vCPUs) | ~$22/month |
| NAT Gateway (Lambda in VPC) | ~$35-45/month |
| Data Transfer (CloudFront, API GW) | ~$5-15/month |
| WAF (with rules) | ~$10-15/month |
| Provisioned Concurrency (auth) | ~$12-15/month |
| Secrets Manager | ~$2-4/month |
| CloudWatch Logs storage | ~$5-10/month |

**Realistic estimate for < 1000 DAU**: $150-200/month (2-3x the documented estimate)

#### 7. NestJS-to-Lambda Deployment Gap
**Flagged by**: Solution Architect

- The current `main.ts` bootstraps NestJS with `NestFactory.create()` -- a standard HTTP server
- This does NOT work on Lambda out of the box
- Fix: Use `@codegenie/serverless-adapter` or `@nestjs/platform-express` with a Lambda handler wrapper

#### 8. No CDK Infrastructure Code Exists
**Flagged by**: Solution Architect

- The document shows CDK code examples but there is no `infra/` directory in the codebase
- Infrastructure as code is documented but not implemented
- Must be prioritized before any deployment

#### 9. Missing Database Indexes
**Flagged by**: Solution Architect

The architecture document specifies indexes that are NOT in the Prisma schema:
```prisma
@@index([playerId])           // player_heroes
@@index([playerId, createdAt]) // battles
@@index([playerId])           // campaign_progress
@@index([playerId, resetDate]) // daily_quests
```
These will cause performance issues as data grows.

#### 10. Lambda Cold Starts Degrade Game UX
**Flagged by**: All 4 Experts

- NestJS + Prisma on Lambda = 2-5 second cold starts
- With < 1000 DAU, Lambdas will be cold most of the time
- Provisioned Concurrency only covers auth-service, not battle endpoints
- Consider: Single EC2 t4g.small ($12/month) with Docker eliminates cold starts entirely

#### 11. In-Memory ThrottlerModule Useless Across Lambda Instances
**Flagged by**: Security Expert

- NestJS `ThrottlerModule` uses in-memory storage by default
- With Lambda (multiple instances), each instance has its own counter
- Rate limiting is effectively broken in a Lambda deployment
- Fix: Use Redis-backed throttle store (`@nestjs/throttler-storage-redis`)

#### 12. 14-Week Timeline is Unrealistic
**Flagged by**: Devil's Advocate

Sprint-by-sprint reality check:
| Sprint | Planned | Realistic |
|--------|---------|-----------|
| Sprint 1 (Foundation) | 2 weeks | 3-4 weeks |
| Sprint 3 (Battle Engine) | 2 weeks | 4 weeks |
| Sprint 4 (Phaser UI) | 2 weeks | 3-4 weeks |
| Sprint 7 (Polish) | 2 weeks | 3-4 weeks |

**Honest estimate: 24-30 weeks** for one developer. Alternative: Cut scope to auth + heroes + battle engine + 5 campaign stages (drop daily quests and leaderboard to Phase 2) and ship in 10-12 weeks.

### Security

#### 13. Doc Says RS256, Code Uses HS256
**Flagged by**: Security Expert

- Document (line 561): Claims "JWT, RS256 (asymmetric)"
- Implementation: Uses `secret: config.get('JWT_SECRET')` -- symmetric HMAC (HS256)
- RS256 requires a public/private key pair; the code uses a single secret string
- Fix: Either update the doc to say HS256 (acceptable for monolithic API) or refactor to RS256

#### 14. Refresh Token Rotation Has Race Condition
**Flagged by**: Security Expert, Solution Architect

- The refresh flow reads, validates, deletes, then generates -- NOT atomically
- Two concurrent refresh requests with the same token can both succeed
- Fix: Use Redis `GETDEL` or Lua script for atomic read-and-delete

#### 15. No Per-Account Login Lockout
**Flagged by**: Security Expert

- Rate limit is 10 login attempts per minute per IP
- An attacker rotating IPs bypasses this entirely
- Fix: Implement per-username lockout in Redis: `login_failures:{username}`, lock after 5 failures for 15-30 minutes

#### 16. No Audit Logging
**Flagged by**: Security Expert, Solution Architect

Missing structured logging for:
- Login successes/failures
- Token refresh events
- Battle validation failures (potential cheating)
- Currency modifications
- Account changes

#### 17. `.env` May Contain Committed Secrets
**Flagged by**: Security Expert

- `.env` exists with JWT secrets (`dev-jwt-secret-hero-wars-2024`)
- Verify it is in `.gitignore`. If ever committed, rotate ALL secrets immediately
- Production should use AWS Secrets Manager, not environment variables

#### 18. Redis Has No Authentication or TLS
**Flagged by**: Security Expert

- `REDIS_URL=redis://localhost:6379` -- no password, no TLS
- Production ElastiCache must have AUTH enabled and use `rediss://` (TLS)

#### 19. Battle Lock TTL Mismatch
**Flagged by**: Security Expert

- `battle:lock:{player_id}` TTL: 30 seconds
- `GAME_CONFIG.battle.baseTimeout`: 300,000ms (5 minutes)
- A legitimate battle exceeding 30 seconds allows a second concurrent battle start
- Fix: Set lock TTL >= battle timeout (300s)

### UX / Player Experience

#### 20. Mobile is Completely Ignored
**Flagged by**: UI/UX Expert, Devil's Advocate

- Hero Wars and its clones are primarily mobile games
- No mention of mobile support, responsive design, touch events, viewport meta tags
- Hardcoded 960x540 canvas will not work on mobile viewports
- No PWA support mentioned
- Fix: Either explicitly declare "desktop-only MVP" or add responsive design. If targeting the Hero Wars audience, mobile-first is essential.

#### 21. No Onboarding, Tutorial, or FTUE
**Flagged by**: UI/UX Expert

- A new player registers, logs in, and has zero guidance
- No explanation of heroes, team composition, or battle mechanics
- No introductory narrative or world-building
- Fix: Design at minimum a 3-step guided tutorial for the first battle

#### 22. No Loading/Splash Screen
**Flagged by**: UI/UX Expert

- App component is a bare `<router-outlet />`
- No loading indicator during initial bootstrap, auth check, or asset loading
- Users see blank screen during Lambda cold starts
- Fix: Add app-level loading/splash screen with game logo while checking auth and preloading assets

#### 23. No Audio System
**Flagged by**: UI/UX Expert

- A game without audio is not a game
- No sound manager, no mute/volume controls, no background music, no SFX
- No audio preloading strategy
- Fix: Implement Phaser-based audio manager with at minimum: battle BGM, attack SFX, UI click sounds, victory/defeat jingles

#### 24. No Asset Loading UX
**Flagged by**: UI/UX Expert

- No loading indicator, progress bar, or loading screen for game assets
- No strategy for preloading vs lazy loading
- No fallback for failed asset loads
- Fix: Implement branded loading screen with progress bar in `PreloadScene`, use `this.load.on('progress', callback)`

#### 25. Canvas Hardcoded at 960x540, No Scaling
**Flagged by**: UI/UX Expert

- On 4K monitors, the canvas is tiny; on 1366x768 laptops, it leaves minimal room
- No `Phaser.Scale` mode configured
- Fix: Use `Phaser.Scale.FIT` or `Phaser.Scale.RESIZE` with min/max bounds

#### 26. Battle Validation Failure UX Undefined
**Flagged by**: UI/UX Expert, Solution Architect

- Player sees victory animation and perceived rewards locally
- If server rejects, what does the player see? Retroactive "invalidated" message?
- Fix: Show "Syncing results..." spinner between battle end and reward display. Only show rewards after server confirmation.

#### 27. No Reward Animations or Engagement Feedback
**Flagged by**: UI/UX Expert

- Hero Wars clones are known for satisfying reward loops: chest animations, hero reveals, loot showers
- Post-battle screen needs at minimum: star rating, XP bar fill animation, gold/item drops
- No quest progress UI or claim celebration

### Operational Readiness

#### 28. No Error Handling Strategy
**Flagged by**: Solution Architect, Devil's Advocate

- No global exception filter in NestJS
- No structured error response format
- No error boundary in Angular
- Fix: Implement global `ExceptionFilter` returning `{ error, code, statusCode }`

#### 29. No Monitoring or Observability
**Flagged by**: Solution Architect, Devil's Advocate

Missing entirely:
- APM (AWS X-Ray, Datadog, or similar)
- Structured logging (only `console.log`)
- Custom CloudWatch metrics (battle completion rate, validation failures, economy health)
- Alerting rules (error rate, latency thresholds)
- Game KPI dashboard (DAU, retention, battle counts)

#### 30. No Admin Panel
**Flagged by**: Devil's Advocate

- No way to: ban cheaters, grant compensation, inspect player data, fix corrupted records
- Will require raw SQL against production database without one

#### 31. No Analytics
**Flagged by**: Devil's Advocate

- No way to measure: retention rate, stage drop-off, hero balance, player engagement
- Building a game with no way to know if anyone is having fun

#### 32. No Graceful Degradation
**Flagged by**: Devil's Advocate

- `RedisService` has no error handling
- If Redis goes down, the entire NestJS app crashes
- Fix: Add try/catch with fallback behavior for non-critical Redis operations

---

## Moderate Warnings

#### 33. EventBus Between Angular and Phaser is Underspecified
**Flagged by**: UI/UX Expert

- A single RxJS Subject is insufficient for complex game UI
- Need typed, multi-channel events: battle state, animations, user input, asset loading, errors
- Phaser 60fps updates triggering Angular change detection = performance issues
- Fix: Use `NgZone.runOutsideAngular()` for Phaser, `OnPush` on all battle overlay components

#### 34. NgRx Signals May Be Overkill for MVP
**Flagged by**: UI/UX Expert

- Code uses plain Angular `signal()` and `computed()`, not NgRx Signal Store
- For MVP state surface, plain signals + services may be sufficient
- Keep battle state entirely within Phaser during combat; sync only final results to Angular

#### 35. No API Versioning
**Flagged by**: Solution Architect, Security Expert

- No `/api/v1/` prefix
- Breaking changes become painful once clients are deployed
- Recommend adding versioning from the start

#### 36. CORS Too Permissive for Production
**Flagged by**: Security Expert

- Currently only allows `localhost:4200`
- No production origin configured; needs environment-based CORS

#### 37. No Email Verification or Password Reset
**Flagged by**: Solution Architect

- Players can register with any email, no verification
- No "forgot password" flow exists

#### 38. No Design System / Design Tokens
**Flagged by**: UI/UX Expert

- Color palette hardcoded in multiple components
- No shared CSS custom properties between Angular UI and Phaser canvas
- Tailwind declared in architecture but not used in code

#### 39. No Offline or Reconnection Handling
**Flagged by**: UI/UX Expert

- No service worker, no offline detection
- If connection drops during battle, client simulation completes but server submission fails silently

#### 40. No Accessibility Considerations
**Flagged by**: UI/UX Expert

- No ARIA labels, keyboard navigation, color contrast compliance
- Basic considerations should be present even in MVP

---

## What's Good (Confirmed by Multiple Experts)

| Decision | Verdict | Experts |
|----------|---------|---------|
| Shared battle engine in monorepo | Strongest architectural decision | All 4 |
| Tech stack (Angular + Phaser + NestJS + PG + Redis) | Well-matched to team skills | Architect, Devil's Advocate |
| Prisma with parameterized queries | Solid SQL injection protection | Architect, Security |
| bcrypt-12 for password hashing | Strong, ~250ms per hash | Security |
| Redis Sorted Sets for leaderboard | O(log N), scales to millions | Architect |
| Input validation (class-validator + whitelist + forbidNonWhitelisted) | Excellent | Security |
| Mulberry32 RNG algorithm | Correct choice for game determinism | Architect, Security |
| Helmet middleware for security headers | Good baseline | Security |
| Generic error messages on login failure | Prevents username enumeration | Security |
| `ON DELETE CASCADE` on foreign keys | Clean data cleanup | Architect |
| Nx monorepo with apps/ + libs/ structure | Textbook separation | Architect |
| ARM64/Graviton Lambda choice | 20% cheaper, 15% faster | Architect |

---

## Document vs Code Inconsistencies

| Item | Document Says | Code Says |
|------|--------------|-----------|
| JWT Algorithm | RS256 (asymmetric) | HS256 (symmetric) |
| Starting Gold | 1000 | 500 |
| Starting Gems | 50 | 100 |
| Refresh Token Storage | HttpOnly Cookie | localStorage |
| `rng_seed` Type | BIGINT | Int (32-bit) |
| Hero Template ID | VARCHAR(32) human-readable (e.g., "warrior_blade") | UUID auto-generated |
| ORM | "TypeORM or Prisma" (undecided) | Prisma (already implemented) |
| `last_login` field | Present in SQL schema | Missing from Prisma schema (`updatedAt` instead) |

---

## Attack Vectors Identified (Security Expert)

| # | Attack | Severity | Status |
|---|--------|----------|--------|
| 1 | XSS + Token Theft from localStorage | Critical | Unmitigated |
| 2 | Battle Seed Pre-computation | High | Unmitigated |
| 3 | Economy Double-Claim via Race Conditions | Critical | Unmitigated |
| 4 | Credential Brute Force (IP rotation) | High | Partially mitigated (IP rate limit only) |
| 5 | Refresh Token Replay (race condition) | High | Unmitigated |
| 6 | Data Exfiltration via IDOR | Medium | Low risk currently |
| 7 | Redis Poisoning / Session Hijacking | High | Depends on VPC config |
| 8 | DDoS via Battle Start Spam | Medium | Partially mitigated (energy cost) |
| 9 | Leaderboard Score Manipulation | Medium | Depends on implementation |
| 10 | Supply Chain Attack via Dependencies | Low | Standard risk |

---

## Top 10 Priority Actions

| # | Action | Severity | Effort | Owner |
|---|--------|----------|--------|-------|
| 1 | Fix sort tiebreaker + remove `Date.now()` from battle engine | Critical | 1 hour | Developer |
| 2 | Move refresh tokens to HttpOnly cookies | Critical | 1 day | Developer |
| 3 | Redesign battle flow -- don't expose RNG seed to client | Critical | 2-3 days | Architect + Developer |
| 4 | Wrap all economy mutations in DB transactions | Critical | 1 day | Developer |
| 5 | Replace `@Cron` with EventBridge or switch to ECS/EC2 | Critical | 1-2 days | Architect + Developer |
| 6 | Add Prisma `@@index` for all documented indexes | Serious | 2 hours | Developer |
| 7 | Implement per-account login lockout in Redis | Serious | 4 hours | Developer |
| 8 | Recalculate AWS costs honestly ($150-200/month) | Serious | 1 hour | Architect |
| 9 | Revise timeline to 24-30 weeks or cut scope in half | Serious | 1 day | Product Owner |
| 10 | Add global error handling + structured logging | Serious | 1 day | Developer |

---

## Deployment Strategy Recommendation

The Devil's Advocate and Solution Architect both raised concerns about Lambda for this use case. Consider:

| Factor | Lambda (Current Plan) | EC2/Fargate (Alternative) |
|--------|----------------------|--------------------------|
| Cold starts | 2-5s with NestJS+Prisma | None |
| Monthly cost (< 1K DAU) | ~$150-200 | ~$80-120 |
| Cron jobs | Requires EventBridge rewrite | Native `@Cron` works |
| Complexity | 10+ AWS services | 3-4 AWS services |
| Scaling | Automatic | Manual/Auto Scaling Groups |
| Local dev parity | Low | High (Docker) |

**Recommendation**: For MVP with < 1000 DAU, a single ECS Fargate task or EC2 instance is simpler, cheaper, and eliminates the cold start problem. Move to Lambda/serverless when you need the scaling characteristics.

---

## Conclusion

The Hero Wars MVP architecture demonstrates strong foundational thinking -- the shared battle engine, monorepo structure, and tech stack choices are all sound. However, the gap between the architecture document and the implementation reveals critical security vulnerabilities, determinism bugs, and operational blind spots that must be addressed before the project can move forward safely.

The most impactful immediate action is fixing the 5 critical issues listed above. The most impactful strategic action is honestly reassessing the timeline, cost, and deployment strategy.

---

*Review conducted on 2026-02-22 by a panel of 4 AI expert agents.*
*Solution Architect | UI/UX Expert | Security Expert | Devil's Advocate*
