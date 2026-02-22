# Sprint 5 Debug Audit Report

**Auditor:** Expert Debugger
**Date:** 2026-02-23
**Scope:** Campaign system, battle flow, rewards, stage progression, data integrity

---

## Critical Bugs

### C1. Frontend-Backend URL Mismatch for Battle Completion

**Severity:** Critical
**Files:**
- `apps/client/src/app/core/services/battle.service.ts:117`
- `apps/api/src/battles/battles.controller.ts:21`

**Description:** The frontend `BattleService.completeBattle()` posts to `` `/battles/${battleId}/complete` `` (e.g., `/battles/abc-123/complete`), but the backend controller only defines `@Post('complete')`, which maps to `/battles/complete`. There is no `:id` route parameter. The request will hit the NestJS 404 handler, so **no battle can ever be validated or completed**.

**Suggested Fix:** Either:
- Change the frontend to `POST /battles/complete` and pass `battleId` in the body (which it already does in `dto.battleId`), or
- Change the controller to `@Post(':id/complete')` and extract the `@Param('id')`.

---

### C2. Energy Deducted Before Stage Unlock Validation -- Lost Energy on Forbidden Stages

**Severity:** Critical
**File:** `apps/api/src/battles/battles.service.ts:57-78`

**Description:** In `startBattle()`, energy is deducted at line 69 **before** `validateStageUnlocked()` is called at line 77. If the player attempts a locked stage, `validateStageUnlocked()` throws `ForbiddenException` -- but the energy has already been subtracted from the database. The player permanently loses energy without getting a battle.

**Suggested Fix:** Move the `validateStageUnlocked()` call to **before** the energy deduction block (before line 57).

---

### C3. Campaign Progress Stars Can Be Downgraded on Replay

**Severity:** Critical
**File:** `apps/api/src/battles/battles.service.ts:322-337`

**Description:** When updating campaign progress on a completed stage, the upsert uses `stars: { set: starsEarned }` (line 330). If a player replays a stage they previously 3-starred and now only earns 1 star, their progress is **downgraded** from 3 stars to 1 star. In campaign games, the best result should always be preserved.

**Suggested Fix:** Change the update to only set stars if the new value is higher:
```typescript
update: {
  stars: starsEarned > (existingProgress?.stars ?? 0) ? starsEarned : undefined,
  completedAt: new Date(),
},
```
Or use a raw query: `stars = GREATEST(stars, starsEarned)`.

---

### C4. 3-Star Requirement Is Impossible to Achieve

**Severity:** Critical
**File:** `libs/shared/src/constants/game-config.ts:45`

**Description:** `victoryStar3Threshold` is set to `1.0`, meaning **100% of heroes must survive** to earn 3 stars. The survival ratio calculation at `battles.service.ts:264` uses `alivePlayerCount / totalPlayers`. With the threshold at exactly 1.0, a single hero dying means the player can never get 3 stars. Combined with the dodge/crit RNG system, this makes 3 stars almost impossible in later stages. This is a design concern, but with `>=` comparison (line 266) it is technically achievable -- however, any rounding or float precision issue could make `survivalRatio` slightly less than 1.0 even when all heroes survive.

**Suggested Fix:** Use integer comparison instead of floating point: `alivePlayerCount === totalPlayers` for 3 stars.

---

## High Severity Bugs

### H1. Replay Reward Exploitation -- Unlimited Gold and XP from Completed Stages

**Severity:** High
**File:** `apps/api/src/battles/battles.service.ts:252-278`

**Description:** There is no check to prevent replaying already-completed stages for full rewards every time. A player can repeatedly battle stage 1-1 (which is always unlocked) and farm 100 gold + 50 XP per run indefinitely, with no diminishing returns.

**Suggested Fix:** Either:
- Award zero rewards on replay, or
- Award reduced rewards on replay (e.g., 50% gold, 0 XP on replays), or
- Add a daily replay limit per stage.

---

### H2. Energy Not Refunded on Battle Failure / Validation Rejection

**Severity:** High
**File:** `apps/api/src/battles/battles.service.ts:57-73, 280-338`

**Description:** Energy is deducted at battle start (line 69). If the battle is lost (`result === 'defeat'`) or validation fails (`validated === false`), the energy is **not refunded**. While losing energy on defeat is a common game mechanic, losing energy when validation fails (which indicates a client bug, not a player action) is punishing. At minimum, validation-rejected battles should refund energy.

**Suggested Fix:** In the `completeBattle` transaction, refund energy if `!validated`:
```typescript
if (!validated) {
  await tx.player.update({
    where: { id: playerId },
    data: { energy: { increment: energyCost } },
  });
}
```

---

### H3. Redis Lock/Seed Cleanup Not Guaranteed on Error Paths

**Severity:** High
**File:** `apps/api/src/battles/battles.service.ts:160-172, 341-343`

**Description:** In `startBattle()`, the Redis battle lock is set at line 168 and the seed at line 161. If the `prisma.battle.create()` call at line 175 fails (e.g., DB connection error), the Redis lock remains set with a TTL of `BATTLE_TTL_SECONDS` (300 seconds / 5 minutes). The player is locked out of starting any battle for 5 minutes. Similarly in `completeBattle()`, if the Prisma transaction at line 281 fails, the Redis keys are never cleaned up (cleanup at lines 342-343 only happens after a successful transaction).

**Suggested Fix:** Wrap `startBattle()` in a try/catch that cleans up Redis keys on failure. Consider using `finally` blocks or a Redis-aware error handler.

---

### H4. Battle Lock Race Condition (TOCTOU)

**Severity:** High
**File:** `apps/api/src/battles/battles.service.ts:40-45, 168-172`

**Description:** The battle lock check (line 40-41: `redis.get`) and the lock set (line 168-169: `redis.set`) are not atomic. Two concurrent requests can both pass the check, and both proceed to create battles. This is a classic TOCTOU (time-of-check to time-of-use) race condition. While rare, it allows a player to start two battles simultaneously.

**Suggested Fix:** Use Redis `SET ... NX` (set-if-not-exists) as a single atomic operation to check and acquire the lock:
```typescript
const lockAcquired = await this.redis.setNx(
  `${BATTLE_LOCK_PREFIX}${playerId}`,
  battleId,
  BATTLE_TTL_SECONDS,
);
if (!lockAcquired) {
  throw new ConflictException('A battle is already in progress');
}
```

---

### H5. Seed Exposed to Client -- Determinism Bypass Risk

**Severity:** High
**File:** `apps/api/src/battles/battles.service.ts:197-202`

**Description:** The `startBattle()` response returns the raw `seed` value (line 199) to the client. Since the battle engine is deterministic, a cheating client can:
1. Receive the seed
2. Run the simulator with the seed to preview the result
3. If the result is a loss, simply never call `/battles/complete` (wait for lock TTL to expire)
4. Repeat until getting a win

The `seedHash` (line 200) is also returned but serves no security purpose since the raw seed is already exposed.

**Suggested Fix:** Only send the `seedHash` to the client. The client should generate a local seed for its simulation, and the server uses its own seed. Since the server re-simulates independently, the client seed is irrelevant -- what matters is that the server's simulation with the server's seed produces a valid result.

However, this requires rethinking the validation model: instead of comparing client vs server logs, the server should just simulate and determine the result independently. The current architecture requires the client to know the seed, which is inherently insecure.

---

### H6. Lobby Campaign Card Hardcoded as "Coming in Sprint 2" -- Not Navigable

**Severity:** High
**File:** `apps/client/src/app/features/lobby/lobby.component.ts:30-33`

**Description:** The Campaign card in the lobby has the CSS class `disabled` and shows text "Coming in Sprint 2". There is no `routerLink` to a campaign map view. Even though campaign stages can be accessed via the battle route `/battle/:stageId`, there is no campaign UI for users to browse stages, see their progress, or select stages. The only working battle entry point is the hardcoded `/battle/1-1` link.

**Suggested Fix:** Sprint 5 needs a campaign map component (e.g., `/campaign`) with stage selection. Update the lobby card to link to it.

---

### H7. No `completedAt` Set on Campaign Progress Create

**Severity:** High
**File:** `apps/api/src/battles/battles.service.ts:326-331`

**Description:** When creating a new `campaignProgress` record (first-time completion), the `create` block (line 326-331) does not set `completedAt`. Looking at the Prisma schema (`schema.prisma:95`), `completedAt` has `@default(now())` so it gets a value. However, the `update` block (line 332-335) explicitly sets `completedAt: new Date()`. This inconsistency is minor but the `create` block's `completedAt` will be the DB insert timestamp, not the battle completion time. This is acceptable but should be explicitly documented.

---

## Medium Severity Bugs

### M1. Stage Data Uses 4-Star Enemies but `maxStars` in `GAME_CONFIG` is 7

**Severity:** Medium
**File:** `libs/shared/src/constants/campaign-stages.ts:425-448`

**Description:** Chapter 10 enemies use `stars: 4` (e.g., line 425, 428, 441-445). The `GAME_CONFIG.hero.maxStars` is 7. The `calculateHeroStats()` function applies a star multiplier of `1 + (stars - 1) * 0.15`. At 4 stars this gives 1.45x multiplier. While this is technically valid, there is no validation anywhere that `CampaignEnemy.stars` doesn't exceed the configured `maxStars`. A typo in stage data (e.g., `stars: 40`) would create impossibly strong enemies with no error.

**Suggested Fix:** Add validation in `campaignEnemyToBattleHero()` or a stage data validation function that asserts enemy levels and stars are within bounds.

---

### M2. `selectDamageTarget` RNG Consumption Is Inconsistent

**Severity:** Medium
**File:** `libs/battle-engine/src/ai.ts:107-123`

**Description:** The `selectDamageTarget` function always consumes one RNG value for the random-target check (line 111). When `isRandom === true`, it also consumes a second RNG value via `rng.pick(enemies)` (line 114). When `isRandom === false`, it only consumes the one value. This means the RNG state diverges based on the random target roll, which is intentional. However, this is **different** from the `calculateDamage` function (damage.ts:27-30) which explicitly consumes all 3 RNG values regardless of the dodge outcome ("B1 blocker fix"). The inconsistency is not a bug per se (the engine is deterministic either way), but the different RNG consumption patterns could cause confusion during debugging.

**Suggested Fix:** Document this as intentional, or normalize RNG consumption to always consume the same number of values.

---

### M3. `CompleteBattleDto` Missing `durationMs` Field

**Severity:** Medium
**File:** `apps/api/src/battles/dto/complete-battle.dto.ts:88-95`

**Description:** The `CompleteBattleDto` class does not include a `durationMs` field. The frontend sends `durationMs` as part of the request body (`battle.service.ts:118`), but the DTO only validates `battleId` and `clientLog`. The `durationMs` in the DTO's `BattleLogDto` (line 85) is inside `clientLog`, not at the top level. However, the controller passes `dto.clientLog` (which includes `durationMs` inside it) to the service. The service then uses `clientLog.durationMs` (line 296). This works but the top-level `durationMs` sent by the frontend is silently ignored.

**Suggested Fix:** Either remove the `durationMs` from the frontend's request body (since it's already in `clientLog.durationMs`), or add it to `CompleteBattleDto` and use it explicitly.

---

### M4. Non-Campaign Victory Gives `startingGold` (500) as Reward

**Severity:** Medium
**File:** `apps/api/src/battles/battles.service.ts:274-278`

**Description:** When a non-campaign battle is won (no `stageId`), the reward is `GAME_CONFIG.player.startingGold` (500 gold) and 50 XP (line 276-277). This uses `startingGold` as a reward constant, which seems like a copy-paste error. The starting gold (500) is much higher than typical stage rewards (100-200 gold for early stages). This creates a perverse incentive to fight non-campaign battles instead of campaign stages.

**Suggested Fix:** Define a proper `nonCampaignBattleReward` constant in `GAME_CONFIG` instead of reusing `startingGold`.

---

### M5. `stageId` Format Validation Missing

**Severity:** Medium
**Files:**
- `apps/api/src/battles/dto/start-battle.dto.ts:3-7`
- `apps/api/src/battles/battles.service.ts:375`

**Description:** The `StartBattleDto` only validates that `stageId` is an optional string. The `stageId` format is expected to be `"chapter-stage"` (e.g., "1-1", "10-3"), which is parsed via `split('-')` in `validateStageUnlocked()`. If a malformed stageId like `"abc"`, `"1-"`, or `"1-2-3"` is passed, the parsing produces `NaN` or unexpected values. While `getStage()` returns `undefined` for unknown IDs, the `validateStageUnlocked()` code would parse garbage and generate invalid `prevStageId` values.

**Suggested Fix:** Add a regex validation to `StartBattleDto`:
```typescript
@Matches(/^\d{1,2}-[1-3]$/)
stageId?: string;
```

---

### M6. Campaign Progress `bestTimeMs` Never Updated

**Severity:** Medium
**Files:**
- `apps/api/src/battles/battles.service.ts:322-337`
- `apps/api/prisma/schema.prisma:94`

**Description:** The `campaign_progress` table has a `bestTimeMs` column (`schema.prisma:94`), and the `CampaignProgress` model in `libs/shared/src/models/campaign.ts:28` defines it. However, the upsert in `completeBattle()` never sets or updates `bestTimeMs`. It always remains at the default value of 0.

**Suggested Fix:** Track and update `bestTimeMs` in the upsert, using `Math.min(existingBestTime, currentDuration)`.

---

### M7. `heroShards` Rewards Defined but Never Granted

**Severity:** Medium
**Files:**
- `libs/shared/src/constants/campaign-stages.ts` (lines 83, 168, 212, 256, 303, 350, 397, 431, 447)
- `apps/api/src/battles/battles.service.ts:252-278`

**Description:** Several stages define `heroShards` in their rewards (e.g., stage 2-3: `heroShards: { templateId: 'warrior_bold', count: 3 }`). However, the `completeBattle()` reward-granting code only handles `gold` and `xp` (lines 255-256). Hero shards are never awarded to the player. There is also no database table or mechanism for storing hero shards.

**Suggested Fix:** This is likely a Phase 2 feature. Either:
- Remove `heroShards` from stage definitions to avoid confusion, or
- Implement shard storage and granting in the reward flow.

---

### M8. Cooldown Decremented After Action Instead of Before

**Severity:** Medium
**File:** `libs/battle-engine/src/simulator.ts:131-135`

**Description:** In the simulator's turn loop, skill cooldowns are decremented **after** the hero acts (lines 131-135). This means a skill used on turn 1 with `cooldown: 3` will be put on cooldown 3 at line 105, then immediately decremented to 2 at line 133 within the same turn. The effective cooldown is therefore `cooldown - 1` turns. If a skill has `cooldown: 1`, it can be used every single turn (set to 1, decremented to 0 immediately).

**Suggested Fix:** Either decrement cooldowns at the **start** of the hero's turn (before the decision phase), or adjust skill cooldown values to account for this off-by-one.

---

## Low Severity Bugs

### L1. Campaign Stage Unlock Logic Hardcodes 3 Stages Per Chapter

**Severity:** Low
**File:** `apps/api/src/campaign/campaign.service.ts:66-69` and `apps/api/src/battles/battles.service.ts:381-383`

**Description:** Both `isStageUnlocked()` functions hardcode `prevStageId = \`${chapter - 1}-3\`` when `stageNum === 1`. This assumes every chapter has exactly 3 stages. If a chapter is later expanded to 4+ stages, the unlock logic breaks.

**Suggested Fix:** Look up the actual last stage of the previous chapter from `CAMPAIGN_STAGES` instead of hardcoding `-3`.

---

### L2. Duplicate Stage Unlock Logic in Two Services

**Severity:** Low
**Files:**
- `apps/api/src/campaign/campaign.service.ts:55-74`
- `apps/api/src/battles/battles.service.ts:367-399`

**Description:** The stage unlock logic is implemented twice -- once in `CampaignService.isStageUnlocked()` and once in `BattlesService.validateStageUnlocked()`. They use slightly different implementations (one uses a `Map`, the other queries the DB directly). This violates DRY and creates a risk that one is updated without the other.

**Suggested Fix:** Extract stage unlock logic into a shared utility or have `BattlesService` delegate to `CampaignService`.

---

### L3. Battle Record Created with `result: 'pending'` -- Not in Schema Validation

**Severity:** Low
**File:** `apps/api/src/battles/battles.service.ts:181`

**Description:** The battle record is created with `result: 'pending'` (line 181), but the Prisma schema defines `result` as a plain `String` (schema.prisma:76) with no enum validation. The `CompleteBattleDto` validates results as `['victory', 'defeat', 'timeout']` (complete-battle.dto.ts:78), which does not include `'pending'`. This means the DB can contain battles stuck in `'pending'` state if the player never completes them (e.g., closes browser). There is no cleanup mechanism for stale pending battles.

**Suggested Fix:** Add a scheduled job to clean up or mark as `'abandoned'` any battles older than `baseTimeout` that are still in `'pending'` state.

---

### L4. `BattleLogDto` Validates `@IsEnum` with Array Instead of Enum

**Severity:** Low
**File:** `apps/api/src/battles/dto/complete-battle.dto.ts:78`

**Description:** The `result` field uses `@IsEnum(['victory', 'defeat', 'timeout'])`. The `class-validator` `@IsEnum` decorator expects an enum object, not an array. While this may work with arrays in some versions, the correct usage is:
```typescript
enum BattleResult { victory = 'victory', defeat = 'defeat', timeout = 'timeout' }
@IsEnum(BattleResult)
```
Or use `@IsIn(['victory', 'defeat', 'timeout'])`.

**Suggested Fix:** Change to `@IsIn(['victory', 'defeat', 'timeout'])`.

---

### L5. `DailyQuest` Schema Missing `resetDate` Default Type

**Severity:** Low
**File:** `apps/api/prisma/schema.prisma:109`

**Description:** The `resetDate` field is `DateTime` but has no `@default(...)` in the Prisma schema. The architecture doc shows `DEFAULT CURRENT_DATE` for the SQL schema. Every `DailyQuest` creation must explicitly provide `resetDate`, or it will fail.

**Suggested Fix:** Add `@default(now())` or handle explicitly in service code.

---

### L6. `HeroesService.addXp()` Does Not Auto-Level

**Severity:** Low
**File:** `apps/api/src/heroes/heroes.service.ts:155-177`

**Description:** The `addXp()` method increments hero XP but does not check if the hero has enough XP to level up. Similarly, the battle reward flow (battles.service.ts:314-318) grants hero XP via `updateMany` without checking for level-up thresholds. Heroes can accumulate arbitrarily high XP without ever leveling up automatically.

**Suggested Fix:** This may be by design (manual level-up via gold cost). If so, document it. If auto-leveling is desired, add a check.

---

### L7. Frontend Error Handling Swallows `completeBattle` Failures

**Severity:** Low
**File:** `apps/client/src/app/features/battle/battle.component.ts:273-278`

**Description:** The `completeBattle()` promise's `.catch()` handler (line 276) is empty -- it silently swallows any errors from battle completion. If the completion fails (network error, validation error, etc.), the user sees no feedback. The `ResultScene` handles this with a polling mechanism, but it gives up after 10 seconds with just "Validation unavailable".

**Suggested Fix:** Log the error and provide user feedback. Consider adding a retry mechanism.

---

### L8. `getStage()` Linear Search on Every Call

**Severity:** Low
**File:** `libs/shared/src/constants/campaign-stages.ts:454-456`

**Description:** `getStage()` uses `Array.find()` to search `CAMPAIGN_STAGES` by ID. With 30 stages this is negligible, but if stages grow significantly, this becomes inefficient. Multiple calls per battle flow (start + complete) compound this.

**Suggested Fix:** Build a `Map<string, CampaignStage>` at module load time for O(1) lookups.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 4     |
| High     | 7     |
| Medium   | 8     |
| Low      | 8     |
| **Total**| **27**|

### Top Priority Fixes (Before Sprint 5 Ship)
1. **C1** - Fix frontend/backend URL mismatch for battle completion (battles are non-functional)
2. **C2** - Move stage unlock validation before energy deduction
3. **C3** - Preserve best star rating on campaign progress
4. **C4** - Fix 3-star calculation to use integer comparison
5. **H4** - Fix battle lock race condition with atomic SET NX
6. **H5** - Stop exposing raw seed to client
7. **H1** - Add replay reward limits
