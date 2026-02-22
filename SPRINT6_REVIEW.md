# Sprint 6 Plan Review

**Reviewer**: Expert Plan Reviewer (AI)
**Date**: 2026-02-23
**Verdict**: **NEEDS CHANGES** (minor-to-moderate issues; plan is fundamentally sound)

---

## Executive Summary

The Sprint 6 plan is well-structured and covers the three meta systems (Daily Quests completion, Leaderboard, Player Profile) comprehensively. The implementation order is logical, and the integration hooks are correctly identified. However, there are several issues ranging from naming conflicts to missing error handling, performance concerns, and a potential circular dependency that must be addressed before implementation begins.

---

## A. Architectural Consistency

### PASS - NestJS Module Pattern
The plan correctly follows the existing pattern:
- New `LeaderboardModule` mirrors existing `BattlesModule`, `HeroesModule` structure
- Controllers use `@UseGuards(JwtAuthGuard)` consistent with `QuestsController` (line 2, `quests.controller.ts`) and `PlayersController` (line 10, `players.controller.ts`)
- Services inject `PrismaService` and `RedisService` as expected

### PASS - Angular Standalone Component Pattern
- New components follow the lazy-loaded standalone pattern used in `app.routes.ts`
- New Angular services follow the signal-based state pattern matching `CampaignService` (`apps/client/src/app/core/services/campaign.service.ts`)

### ISSUE 1: Existing `DailyQuest` Interface Conflict
**Severity**: Medium
**File**: `libs/shared/src/models/campaign.ts:45-58`

The shared library already exports a `DailyQuest` interface from `campaign.ts`:
```ts
export interface DailyQuest {
  id: string;
  playerId: string;
  questId: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  rewardGold: number;
  rewardXp: number;
  resetDate: Date;
}
```

The plan proposes a **new** `DailyQuestResponse` interface in `libs/shared/src/models/quest.ts`. This is fine as a response type, but:
1. The existing `DailyQuest` interface already has `target`, `name`, `description`, `rewardGold`, `rewardXp` fields that the plan says the DB lacks. This suggests the interface was designed ahead of the DB schema.
2. The new `DailyQuestResponse` interface is very similar but uses `rewardGems` (which the old one lacks) and drops the `id` and `playerId` fields.

**Recommendation**: Either:
- Remove the old `DailyQuest` interface from `campaign.ts` and consolidate into the new `quest.ts` types, or
- Extend the existing interface rather than creating a near-duplicate. Update the old interface to add `rewardGems` and `rewardXp`.

Make sure to also update `libs/shared/src/models/campaign.ts` to remove the `DailyQuest` export so consumers aren't confused by two competing types.

### ISSUE 2: Existing `PlayerStats` Interface Conflict
**Severity**: Low
**File**: `libs/shared/src/models/player.ts:15-20`

The shared library already has a `PlayerStats` interface:
```ts
export interface PlayerStats {
  totalBattles: number;
  wins: number;
  losses: number;
  campaignProgress: number;
}
```

The plan proposes a new `PlayerStatsResponse` in `profile.ts` with more fields. These will coexist but the naming is confusing -- `PlayerStats` vs `PlayerStatsResponse` for different shapes.

**Recommendation**: Either rename the existing `PlayerStats` to something like `PlayerStatsLegacy` or `BasicPlayerStats`, or replace it with the new richer `PlayerStatsResponse` and update any consumers. Check if `PlayerStats` is used anywhere in the codebase -- if unused, simply remove it.

---

## B. API Design

### PASS - Endpoint Consistency
- `GET /leaderboard/:type` follows REST conventions
- `GET /quests` and `POST /quests/:questId/claim` already exist and are consistent
- `GET /players/me` enrichment is backward-compatible (adding fields)

### ISSUE 3: Missing `@Param` Type Validation on Leaderboard Type
**Severity**: Low
**File**: Plan Section C2c

The plan shows:
```ts
@Param('type') type: LeaderboardType
```

But NestJS doesn't automatically validate that `type` is one of `'power' | 'campaign' | 'battles'`. An invalid type like `/leaderboard/invalid` would pass through and potentially hit Redis with a garbage key.

**Recommendation**: Add a `ParseEnumPipe` or validation in the controller, or validate in the service. Example:
```ts
@Get(':type')
getLeaderboard(@Param('type', new ParseEnumPipe(LeaderboardTypeEnum)) type: LeaderboardType, ...)
```
Or add a simple guard at the service layer:
```ts
const validTypes = ['power', 'campaign', 'battles'];
if (!validTypes.includes(type)) throw new BadRequestException('Invalid leaderboard type');
```

### ISSUE 4: `claimQuest()` Response Shape Change
**Severity**: Low
**File**: `apps/api/src/quests/quests.service.ts:40`

Current `claimQuest()` returns `{ questId, rewards: { gold, gems } }`. The plan says it will now award XP as well. The response should be updated to `{ questId, rewards: { gold, xp, gems } }`.

**Recommendation**: Make sure the frontend `QuestsService.claimQuest()` expects the new response shape. The plan's frontend service (Section D1a) correctly shows `{ gold: number; xp: number; gems: number }` in the response type, so this is already handled -- just confirm the backend returns it.

---

## C. Database Schema

### PASS - Migration Safety
Adding a `target` column with `@default(1)` is safe for existing rows. No data loss risk.

### ISSUE 5: DailyQuest Composite Key Prevents Re-assignment
**Severity**: High
**File**: `apps/api/prisma/schema.prisma:105-118`

The `DailyQuest` table uses `@@id([playerId, questId])` as its composite primary key. The plan proposes deleting old quests and lazily creating new ones via `ensurePlayerQuests()`. This works, **but** there is a subtlety:

If a player gets quest `win_3_battles` on Day 1, it gets deleted at midnight. On Day 2, `ensurePlayerQuests()` randomly selects quests and might assign `win_3_battles` again -- this is fine since the old row was deleted.

However, if the midnight cron job **hasn't run yet** (e.g., server was down at midnight, or timezone edge case), and the player calls `getPlayerQuests()`, the `ensurePlayerQuests()` method checks "does player have quests for today?" If it checks by `resetDate`, old quests with yesterday's `resetDate` still exist. The method must handle this correctly:
- If quests exist but `resetDate < today`, delete them first, then create new ones.
- Don't rely solely on the midnight cron.

**Recommendation**: In `ensurePlayerQuests()`, explicitly handle the stale-quest case:
```ts
const today = new Date(); today.setUTCHours(0,0,0,0);
// Delete stale quests
await this.prisma.dailyQuest.deleteMany({
  where: { playerId, resetDate: { lt: today } },
});
// Check if quests exist for today
const existing = await this.prisma.dailyQuest.findMany({
  where: { playerId, resetDate: today },
});
if (existing.length > 0) return existing;
// Create new quests...
```

This makes `ensurePlayerQuests()` fully self-healing and not dependent on the cron running.

### ISSUE 6: Missing Index for Battle Stats Aggregation
**Severity**: Medium
**File**: `apps/api/prisma/schema.prisma:73-90`

The player profile will run aggregate queries on the `Battle` table filtering by `playerId` AND `result = 'victory'` AND `validated = true`. The current index is `@@index([playerId, createdAt])`.

For the stats query (`COUNT WHERE playerId = X AND result = 'victory' AND validated = true`), a composite index on `[playerId, validated, result]` would be more efficient.

**Recommendation**: Add to the migration:
```prisma
@@index([playerId, validated, result])
```

Similarly, for `DailyQuest` claiming stats:
```prisma
@@index([playerId, claimed])
```
The existing `@@index([playerId, resetDate])` helps with the daily query but not with the lifetime `claimed=true` count.

---

## D. Module Dependencies

### ISSUE 7: Potential Circular Dependency via AuthModule -> HeroesModule
**Severity**: Medium
**File**: `apps/api/src/auth/auth.module.ts:9`, `apps/api/src/heroes/heroes.module.ts`

The current dependency graph:
- `AuthModule` imports `HeroesModule` (for `HeroesService.assignStarterHeroes()`)

The plan proposes:
- `HeroesModule` imports `QuestsModule` and `LeaderboardModule`

This is fine -- no circular dependency. The chain is:
`AuthModule -> HeroesModule -> QuestsModule` (no backlink).

**However**, if in the future `QuestsModule` needs `AuthModule` (e.g., for login quest triggers), this would create a cycle: `AuthModule -> HeroesModule -> QuestsModule -> AuthModule`.

The plan wisely avoids this by having the login quest auto-complete inside `ensurePlayerQuests()` rather than hooking into `AuthService`. This is good. Just a note for implementers: **do NOT inject AuthService into QuestsService**.

### PASS - No Circular Dependencies
With the plan as written:
- `BattlesModule` imports `QuestsModule`, `LeaderboardModule` (no backlinks)
- `HeroesModule` imports `QuestsModule`, `LeaderboardModule` (no backlinks)
- `QuestsModule` imports nothing extra (uses global PrismaService)
- `LeaderboardModule` imports `RedisModule`, `PrismaModule` (both global)

### ISSUE 8: LeaderboardModule Imports Unnecessary
**Severity**: Low
**File**: Plan Section C2d

The plan says `LeaderboardModule` imports `[RedisModule, PrismaModule]`. Both `RedisModule` and `PrismaModule` are `@Global()` modules (verified in `redis.module.ts:1` and `prisma.module.ts:1`), so they don't need to be explicitly imported.

**Recommendation**: Remove the imports array or leave it empty:
```ts
@Module({
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
```
This matches the pattern used by `QuestsModule`, `BattlesModule`, and `HeroesModule`, none of which explicitly import `PrismaModule` or `RedisModule`.

---

## E. Frontend State Management

### PASS - Signal Pattern
All three new Angular services (`QuestsService`, `LeaderboardService`, `PlayerService`) use the signal-based pattern matching the existing `CampaignService`:
- `signal()` for state
- `loading` signal
- RxJS `tap()` to update signals from API responses

### ISSUE 9: Missing Error Handling in Angular Services
**Severity**: Medium
**File**: Plan Section D1a, D2a, D3a

None of the proposed Angular services handle errors. If the API call fails, `loading` stays `true` forever. The existing `CampaignService` has the same issue, but since this is a new plan, it's worth fixing.

**Recommendation**: Add `catchError` or `finalize` to reset loading state:
```ts
loadQuests(): Observable<DailyQuestResponse[]> {
  this.loading.set(true);
  return this.api.get<DailyQuestResponse[]>('/quests').pipe(
    tap((quests) => this.quests.set(quests)),
    finalize(() => this.loading.set(false)),
  );
}
```

### ISSUE 10: PlayerService Conflicts with AuthService Player Data
**Severity**: Medium
**File**: Plan Section D3a, `apps/client/src/app/core/services/auth.service.ts`

The `AuthService` already stores player data in `this.player` signal (basic fields: id, username, level, gold, gems, energy, etc.). The new `PlayerService` proposes a separate `profile` signal with `PlayerProfileResponse` (which includes the same basic fields plus `stats`).

This creates two sources of truth for player data. After claiming a quest (which awards gold/gems/xp), the `AuthService.player` signal won't update, but the `PlayerService.profile` would be stale too unless re-fetched.

**Recommendation**: Either:
1. Have `PlayerService` extend/replace the player data in `AuthService`, or
2. Have the `profile` signal only store the `stats` portion, not duplicate basic player data, or
3. After quest claims or battles, trigger a refresh of both `AuthService.player` and `PlayerService.profile`.

The simplest approach: when `GET /players/me` returns the enriched `PlayerProfileResponse`, also update `AuthService.player` with the basic fields.

---

## F. Integration Completeness

### PASS - Quest Progress Hooks
The integration table (Section E1) correctly identifies all quest progress triggers:
- Battle won -> `win_battles`
- Campaign completed -> `complete_campaign`
- Hero upgrade -> `upgrade_hero`
- Energy spent -> `spend_energy`
- Login -> auto-completed on `ensurePlayerQuests()`

### ISSUE 11: `spend_energy` Hook Location
**Severity**: Medium
**File**: `apps/api/src/battles/battles.service.ts:65-81`

The plan says to hook `spend_energy` in `BattlesService.startBattle()` after energy deduction. But the energy deduction happens inside a conditional block (`if (stageId)` at line 65), and the quest progress call should happen **after** the energy is successfully deducted (line 77-80), but **before** the battle lock acquisition (line 84-88).

The problem: if the battle lock acquisition fails (line 90-92: "A battle is already in progress"), the energy has already been deducted but the player got no battle. This is an existing bug unrelated to Sprint 6, but the quest progress increment for `spend_energy` would fire even though no battle actually started.

**Recommendation**: The `spend_energy` quest increment should happen in `completeBattle()` instead, alongside the `win_battles` increment. This way, energy spending is only tracked when a battle actually completes. Alternatively, if you want to track energy spent regardless of battle outcome, keep it in `startBattle()` but be aware of the edge case.

### ISSUE 12: Missing `complete_campaign` Distinction
**Severity**: Medium
**File**: Plan Section C1c, `apps/api/src/battles/battles.service.ts:254`

The plan says: "If `battle.stageId` exists: `questsService.incrementQuestProgress(playerId, 'complete_campaign', 1)`"

But `stageId` existing just means it's a campaign battle. The quest should only trigger on **victory**, not on defeat. The plan places it in `completeBattle()` but doesn't specify the condition clearly.

Looking at the code, the validated victory check is at line 254: `if (validated && result === 'victory' && battle.stageId)`. The quest hooks should be placed **after** this check, inside the transaction or right after it.

**Recommendation**: Clarify in the plan that quest progress increments should be placed after the `prisma.$transaction()` block (after line 365), inside a `if (validated && result === 'victory')` check:
```ts
// After the transaction succeeds:
if (validated && result === 'victory') {
  await this.questsService.incrementQuestProgress(playerId, 'win_battles', 1);
  if (battle.stageId) {
    await this.questsService.incrementQuestProgress(playerId, 'complete_campaign', 1);
  }
}
```

### ISSUE 13: Leaderboard Update Should Be Non-Blocking
**Severity**: Medium
**File**: Plan Section C2f

The plan calls `await this.leaderboardService.refreshPlayerScores(playerId)` after battle completion. This involves multiple Redis writes and Prisma aggregate queries. If Redis is slow or temporarily unavailable, it would block the battle completion response.

**Recommendation**: Make leaderboard updates fire-and-forget (don't await), or catch errors silently:
```ts
// Fire-and-forget: don't delay the battle response
this.leaderboardService.refreshPlayerScores(playerId).catch(err =>
  StructuredLogger.error('leaderboard.refresh.failed', { playerId, error: err.message })
);
```

---

## G. Security

### ISSUE 14: Quest Progress Anti-Cheat
**Severity**: Medium

The `incrementQuestProgress()` method is called server-side from validated battle completions and hero upgrades, so it inherits the anti-cheat protection from battle validation. This is good.

However, there is no rate-limiting on `POST /quests/:questId/claim`. A player could spam the claim endpoint. While the `claimed` flag prevents double-claiming, the repeated DB transactions are wasteful.

**Recommendation**: Consider adding the `@Throttle()` decorator to the claim endpoint:
```ts
@Throttle({ default: { limit: 10, ttl: 60000 } })
@Post(':questId/claim')
claimQuest(...)
```

### ISSUE 15: Leaderboard Score Tampering
**Severity**: Low

Since leaderboard scores are calculated server-side from validated data (Prisma queries on validated battles, actual hero stats), there's no direct tampering risk. The Redis sorted sets are only written by the server. This is well-designed.

### PASS - No Client-Side Quest Progress
The plan correctly avoids any client-side quest progress reporting. All progress comes from server-side hooks in validated code paths.

---

## H. Performance

### ISSUE 16: `refreshPlayerScores()` Is Expensive
**Severity**: High
**File**: Plan Section C2b

`refreshPlayerScores()` recalculates ALL three leaderboard scores every time a battle completes. This involves:
1. **Power score**: Fetch all `PlayerHero` records with templates, compute `calculateHeroStats()` for each, sum them.
2. **Campaign score**: `SUM(stars)` from `CampaignProgress`.
3. **Battle score**: `COUNT(*)` from `Battle` where validated victory.

Running all three after every battle is wasteful. After a battle, only the `battles` and `campaign` scores change; `power` doesn't change.

**Recommendation**: Use targeted updates instead of full recalculation:
- After battle: only update `battles` and `campaign` scores
- After hero upgrade: only update `power` score
- Provide `refreshPlayerScores()` as a fallback for rare full recalculation (e.g., cron job)

```ts
// In BattlesService.completeBattle():
await this.leaderboardService.updateScore(playerId, 'battles', await this.leaderboardService.calculateBattleScore(playerId));
if (battle.stageId) {
  await this.leaderboardService.updateScore(playerId, 'campaign', await this.leaderboardService.calculateCampaignScore(playerId));
}

// In HeroesService.levelUpHero() / starUpHero():
await this.leaderboardService.updateScore(playerId, 'power', await this.leaderboardService.calculatePowerScore(playerId));
```

The plan actually mentions this in section E2 under "Update strategy" but then contradicts itself by calling `refreshPlayerScores()` (all three) after battles. Clarify this.

### ISSUE 17: Player Profile Stats Query N+1 Problem
**Severity**: Medium
**File**: Plan Section C3a

The power score calculation requires loading ALL player heroes with their templates, then computing stats for each. For a player with many heroes, this could be slow.

Current `HeroesService.mapPlayerHero()` already does this per-hero, but the profile endpoint would need to do it for ALL heroes at once.

**Recommendation**: Use `Promise.all()` for the aggregate queries (as the plan suggests) and consider caching the power score in Redis (since it only changes on hero upgrades). This way, `getDetailedProfile()` just reads the cached score from Redis instead of recalculating.

### ISSUE 18: `getPlayerQuests()` Calls `ensurePlayerQuests()` Every Time
**Severity**: Low

Every `GET /quests` call will run `ensurePlayerQuests()`, which checks the DB for existing quests. After the first call of the day, subsequent calls will find existing quests and return early, but there's still one extra query per request.

**Recommendation**: This is acceptable for now. The `findMany` query with the `[playerId, resetDate]` index is fast. If it becomes a bottleneck, add a short Redis cache.

---

## I. Missing Items

### ISSUE 19: Missing `rewardGems` in `claimQuest()` XP Award
**Severity**: Medium
**File**: `apps/api/src/quests/quests.service.ts:25-30`

The current `claimQuest()` awards `gold` and `gems` to the player but does NOT award `xp`. The plan says it will award gold, xp, AND gems. Make sure the updated `claimQuest()` also calls:
```ts
await tx.player.update({
  where: { id: playerId },
  data: {
    gold: { increment: rewardGold },
    xp: { increment: rewardXp },
    gems: { increment: rewardGems },
  },
});
```

And handle player level-up from XP (if that's a feature). Currently, `xp` is stored on the player but there's no auto-level-up logic when XP exceeds the threshold. This might be intentional (level-up could be handled elsewhere or manually), but it should be documented.

### ISSUE 20: Missing Player Level-Up Check
**Severity**: Low

When awarding XP to a player (from quest claim or battle), there's no automatic level-up logic. `GAME_CONFIG.xp.playerXpPerLevel(level)` exists, but no code checks if `player.xp >= xpRequired` and increments the level. This is an existing gap, not Sprint 6-specific, but since quests now award XP, it becomes more relevant.

**Recommendation**: Either add auto-level-up logic in Sprint 6 or document it as a known limitation for a future sprint.

### ISSUE 21: Lobby Grid Layout Needs Adjustment
**Severity**: Low
**File**: `apps/client/src/app/features/lobby/lobby.component.ts:109-112`

The current lobby has a 2x2 grid (`grid-template-columns: repeat(2, 1fr)`). The plan proposes 6 cards. A 2-column layout with 6 cards results in 3 rows, which works fine visually. The plan mentions "2x3 or 3x2 layout" -- the existing CSS handles this automatically with `repeat(2, 1fr)`.

No change needed, but consider if 3 columns would look better for 6 cards.

### ISSUE 22: Missing Leaderboard Cache / Rate Limiting
**Severity**: Medium

The `GET /leaderboard/:type` endpoint reads from Redis sorted sets, which is fast. However, without rate limiting, a client could spam the endpoint and overwhelm Redis.

**Recommendation**: Apply the existing global `ThrottlerModule` (already configured at 60 req/min in `app.module.ts:32`). This should be sufficient. If more granular control is needed, add `@Throttle()` to the leaderboard controller.

### ISSUE 23: Leaderboard Username Resolution
**Severity**: Medium
**File**: Plan Section C2b

Redis sorted sets store `{ score, member }` where `member` is `playerId`. The `LeaderboardResponse` needs `username` and `level`. This means `getLeaderboard()` must:
1. Get player IDs from Redis sorted set
2. Query Prisma for player details (username, level) for those IDs

This is a two-step process. For the top 50 entries, that's a single `WHERE id IN (...)` Prisma query, which is fine.

**Recommendation**: Make sure the implementation does a batch lookup, not N individual queries:
```ts
const playerIds = entries.map(e => e.value);
const players = await this.prisma.player.findMany({
  where: { id: { in: playerIds } },
  select: { id: true, username: true, level: true },
});
```

### ISSUE 24: No Seeding / Initial Leaderboard Population
**Severity**: Low

When the leaderboard feature launches, Redis sorted sets will be empty. Existing players won't appear on the leaderboard until they complete a new action (battle, hero upgrade).

**Recommendation**: Add a one-time migration script or admin endpoint to backfill leaderboard scores for all existing players. This could be a cron job that runs once:
```ts
@Cron('0 1 * * *') // Run once after deployment
async backfillLeaderboard() { ... }
```

---

## Summary of Issues

| # | Severity | Issue | Section |
|---|----------|-------|---------|
| 1 | Medium | `DailyQuest` interface conflict in `campaign.ts` | A |
| 2 | Low | `PlayerStats` interface conflict in `player.ts` | A |
| 3 | Low | Missing enum validation on leaderboard type param | B |
| 4 | Low | `claimQuest()` response shape needs XP | B |
| 5 | **High** | `ensurePlayerQuests()` must handle stale quests self-healingly | C |
| 6 | Medium | Missing DB index for battle stats aggregation | C |
| 7 | Medium | Document: never inject AuthService into QuestsService | D |
| 8 | Low | LeaderboardModule should not import global modules | D |
| 9 | Medium | Missing error handling in Angular services (loading stuck) | E |
| 10 | Medium | Dual player data in AuthService vs PlayerService | E |
| 11 | Medium | `spend_energy` hook fires even if battle fails to start | F |
| 12 | Medium | `complete_campaign` must be gated on validated victory | F |
| 13 | Medium | Leaderboard update should be non-blocking | F |
| 14 | Medium | Missing rate-limit on quest claim endpoint | G |
| 15 | Low | (No issue - leaderboard security is good) | G |
| 16 | **High** | `refreshPlayerScores()` recalculates all 3 boards needlessly | H |
| 17 | Medium | Power score should be cached, not recalculated on profile view | H |
| 18 | Low | `ensurePlayerQuests()` extra query per request (acceptable) | H |
| 19 | Medium | `claimQuest()` must award XP in addition to gold/gems | I |
| 20 | Low | No auto player level-up from XP (pre-existing gap) | I |
| 21 | Low | Lobby grid layout works but 3-column may be better | I |
| 22 | Medium | Confirm global throttle covers leaderboard endpoint | I |
| 23 | Medium | Leaderboard needs batch player lookup, not N+1 | I |
| 24 | Low | Missing initial leaderboard backfill for existing players | I |

**High severity (must fix)**: Issues #5, #16
**Medium severity (should fix)**: Issues #1, #6, #9, #10, #11, #12, #13, #14, #17, #19, #22, #23
**Low severity (nice to have)**: Issues #2, #3, #4, #7, #8, #18, #20, #21, #24

---

## Verdict: NEEDS CHANGES

The plan is architecturally sound and follows existing patterns well. The two high-severity issues (#5: stale quest self-healing, #16: targeted leaderboard updates) should be fixed before implementation. The medium-severity issues are important for production quality but won't block development.

**The plan can proceed to implementation once issues #5 and #16 are addressed in the plan text.** The remaining issues can be addressed during implementation.
