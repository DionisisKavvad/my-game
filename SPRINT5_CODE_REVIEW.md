# Sprint 5 Code Review

**Reviewer:** Code Reviewer Agent
**Date:** 2026-02-23
**Scope:** All Sprint 5 code changes (Phase 0 through Phase 6)

---

## 1. Summary

**VERDICT: PASS WITH MINOR ISSUES**

All Sprint 5 deliverables are implemented correctly. The 8 Phase 0 bugs are fixed, the PlayerHeroShard model is properly defined, battle service enhancements (star downgrade fix, bestTimeMs, hero shards) are correct, shared types are added, and the full frontend campaign experience (map, stage detail, routing, post-battle navigation, lobby progress) is complete. The code follows existing patterns and architectural decisions.

**Files Reviewed:** 15 (12 modified + 3 new)
**Issues Found:** 3 minor, 3 suggestions (no blockers)

---

## 2. Phase 0: Bug Fixes Review

### 2.1 C1 -- Frontend URL Fix
**File:** `apps/client/src/app/core/services/battle.service.ts:117`
**Change:** `/battles/${battleId}/complete` -> `/battles/complete`
**Verdict:** CORRECT. Now matches `@Post('complete')` in `battles.controller.ts:21`. The `battleId` is already in the request body.

### 2.2 C2 -- Energy Deduction Order
**File:** `apps/api/src/battles/battles.service.ts:38-81`
**Change:** `validateStageUnlocked()` and team existence check moved before energy deduction.
**Verdict:** CORRECT. New order: (1) validate stage exists [line 41-46], (2) validate stage unlocked [line 49-51], (3) validate team exists [line 53-62], (4) deduct energy [line 64-81]. All validations that can fail now precede the energy deduction. No energy lost on forbidden stages.

### 2.3 C3 -- Star Rating Never Downgrades
**File:** `apps/api/src/battles/battles.service.ts:325-349`
**Change:** Loads existing progress before upsert, uses `Math.max(existingProgress?.stars ?? 0, starsEarned)` in update.
**Verdict:** CORRECT. The `findUnique` on line 325-329 reads the current state inside the transaction, and the `Math.max` on line 343 ensures stars never decrease.

### 2.4 C4 -- 3-Star Threshold Fix
**File:** `apps/api/src/battles/battles.service.ts:268`
**Change:** `survivalRatio >= GAME_CONFIG.rewards.victoryStar3Threshold` -> `alivePlayerCount === totalPlayers`
**Verdict:** CORRECT. Integer comparison eliminates floating-point precision risk entirely.

### 2.5 H4 -- Battle Lock Race Condition
**File:** `apps/api/src/battles/battles.service.ts:83-92`
**Change:** Replaced separate `redis.get` check + `redis.set` with atomic `redis.setNx`.
**Verdict:** CORRECT. Uses `SET ... NX` which is atomic. The `setNx` method in `redis.service.ts:138-152` correctly uses `{ NX: true, EX: ttlSeconds }` which sets and checks in a single Redis command.

### 2.6 H3 -- Redis Cleanup on Error
**File:** `apps/api/src/battles/battles.service.ts:94-204`
**Change:** Wrapped post-lock acquisition code in try/catch that cleans up Redis keys on failure.
**Verdict:** CORRECT. If any operation after lock acquisition fails (template not found, DB error), both the lock key and seed key are cleaned up on line 201-202. The error is re-thrown on line 203.

### 2.7 M5 -- stageId Format Validation
**File:** `apps/api/src/battles/dto/start-battle.dto.ts:6`
**Change:** Added `@Matches(/^\d{1,2}-[1-3]$/)` to stageId.
**Verdict:** CORRECT. Validates format like "1-1", "10-3". Prevents malformed IDs from reaching the parsing logic in `validateStageUnlocked()`.

### 2.8 M4 -- Non-Campaign Reward Constant
**File:** `apps/api/src/battles/battles.service.ts:278`
**Change:** `GAME_CONFIG.player.startingGold` (500) -> hardcoded `50`.
**Verdict:** CORRECT. Non-campaign battles now award 50 gold instead of 500. This eliminates the economic exploit.
**SUGGESTION [S1]:** Consider defining `50` as a named constant (e.g., in `GAME_CONFIG.rewards.nonCampaignGold`) instead of a magic number, for consistency with the existing pattern. Low priority.

### 2.9 L4 -- @IsIn Fix
**File:** `apps/api/src/battles/dto/complete-battle.dto.ts:78`
**Change:** `@IsEnum(['victory', 'defeat', 'timeout'])` -> `@IsIn(['victory', 'defeat', 'timeout'])`
**Verdict:** CORRECT. `@IsIn` is the correct class-validator decorator for array-based value validation. Import updated from `IsEnum` to `IsIn` on line 5.

---

## 3. Phase 1-2: Backend Enhancements Review

### 3.1 PlayerHeroShard Model
**File:** `apps/api/prisma/schema.prisma:120-130`
**Verdict:** CORRECT.
- Composite PK: `@@id([playerId, templateId])` -- matches existing pattern (CampaignProgress, DailyQuest)
- Column mapping: `@map("player_id")`, `@map("template_id")` -- correct snake_case mapping
- Table mapping: `@@map("player_hero_shards")` -- follows existing naming convention
- Relations: `onDelete: Cascade` on Player relation -- correct
- Relation on Player model (line 29): `heroShards PlayerHeroShard[]` -- correct
- Relation on HeroTemplate model (line 48): `shards PlayerHeroShard[]` -- correct
- `count` field defaults to 0 -- correct

**NOTE:** No migration file was generated. The developer should run `npx prisma migrate dev --name add-hero-shards` before deployment.

### 3.2 Star Rating Downgrade Fix
**File:** `apps/api/src/battles/battles.service.ts:325-349`
**Verdict:** CORRECT. Already covered in Phase 0 review (C3). The `findUnique` + `Math.max` pattern is clean.

### 3.3 bestTimeMs Tracking
**File:** `apps/api/src/battles/battles.service.ts:339-346`
**Verdict:** CORRECT.
- Create: `bestTimeMs: clientLog.durationMs` (line 339) -- sets initial time
- Update: `Math.min(existingProgress.bestTimeMs, clientLog.durationMs)` (line 345) -- keeps best (lowest) time
- Guard: `existingProgress?.bestTimeMs ? Math.min(...) : clientLog.durationMs` (line 344-346) -- handles first-time case where bestTimeMs is 0 (default)

**MINOR ISSUE [M1]:** When `existingProgress.bestTimeMs` is `0` (the Prisma default), the condition `existingProgress?.bestTimeMs` evaluates to falsy (0 is falsy in JS). This means the first replay will always overwrite with the new time rather than using `Math.min(0, newTime)`. This is actually **correct behavior** since 0ms is not a real battle time -- it means "never recorded". If it were a real time (e.g., 0ms), `Math.min(0, newTime)` would always return 0. The falsy check is intentionally correct here.

### 3.4 Hero Shard Granting
**File:** `apps/api/src/battles/battles.service.ts:351-362`
**Verdict:** CORRECT.
- Inside the `$transaction` block -- atomic with other rewards
- Uses `upsert` with `playerId_templateId` composite key -- correct
- Create: sets initial count -- correct
- Update: `{ increment: count }` -- accumulates shards on replay
- Only triggers when `stage?.rewards.heroShards` exists -- correct conditional
- `getStage(battle.stageId)` is called again on line 352, but `stage` was already fetched on line 255. This is a **redundant lookup**.

**MINOR ISSUE [M2]:** The `stage` variable is already defined and populated at line 255 (`const stage = getStage(battle.stageId)`) and used for reward calculation. At line 352, `getStage` is called again unnecessarily. The outer `stage` variable could be reused here. This is a minor performance issue (linear search of 30 items) but represents a code duplication that could diverge. The `if (stage)` guard on line 256 already ensures stage exists for the reward block.

### 3.5 completedAt Explicitly Set
**File:** `apps/api/src/battles/battles.service.ts:340`
**Verdict:** CORRECT. `completedAt: new Date()` is now explicitly set in both the `create` (line 340) and `update` (line 347) clauses, as recommended in the review.

---

## 4. Phase 3-4: Shared Types & Campaign API Review

### 4.1 CampaignStageResponse Type
**File:** `libs/shared/src/models/campaign.ts:24-28`
**Verdict:** CORRECT.
- Extends `CampaignStage` -- inherits all stage fields
- Adds `stars: number`, `completed: boolean`, `unlocked: boolean` -- matches what `campaign.service.ts:getStages()` returns
- Properly exported, available via `@hero-wars/shared`

### 4.2 HeroShardProgress Type
**File:** `libs/shared/src/models/campaign.ts:30-35`
**Verdict:** CORRECT. Defines the interface for future shard display. Not yet used in any component but available for future use.

### 4.3 Campaign API Response Shape
**File:** `apps/api/src/campaign/campaign.service.ts`
**Verdict:** CORRECT. The existing `getStages()` already returns the correct shape matching `CampaignStageResponse` (spreading `CampaignStage` fields + adding `stars`, `completed`, `unlocked`). No changes were needed, which matches the review's simplified recommendation. Energy is read from `AuthService` on the frontend.

---

## 5. Phase 5: Frontend Campaign Feature Review

### 5.1 CampaignService
**File:** `apps/client/src/app/core/services/campaign.service.ts`
**Verdict:** CORRECT.
- `providedIn: 'root'` -- singleton service, correct
- Signal-based state: `stages`, `loading` -- matches `HeroesService` pattern
- `loadStages()` returns Observable, uses `tap` to update signals -- correct pattern
- Uses `ApiService.get<CampaignStageResponse[]>('/campaign/stages')` -- correct endpoint
- Loading state management: sets `true` before request, `false` in tap -- correct

**MINOR ISSUE [M3]:** `loading` is never set back to `false` on error. If the API call fails, `loading` will remain `true` indefinitely. The `HeroesService` has the same pattern (no error handling in `tap`), so this is consistent with existing code, but for a better UX, a `catchError`/`finalize` would be appropriate.

### 5.2 CampaignMapComponent
**File:** `apps/client/src/app/features/campaign/campaign-map.component.ts`
**Verdict:** CORRECT.
- Standalone component with `CommonModule`, `StageDetailPanelComponent` -- correct
- Uses `computed()` to group stages by chapter -- clean reactive approach
- `currentEnergy` computed from `authService.player()` -- follows review recommendation (no energy in campaign API)
- `ngOnInit` calls `campaignService.loadStages().subscribe()` -- correct
- `selectStage()` guards against locked stages -- correct
- `onStartBattle()` navigates to `/battle/:stageId` -- correct
- `goBack()` navigates to `/lobby` -- correct
- Chapter grouping and sorting by chapter number -- correct
- Star display with filled/unfilled stars -- correct
- Lock icon for locked stages -- correct
- CSS classes for star counts (`.stars-1`, `.stars-2`, `.stars-3`) -- correct
- Connector lines between stages with completed state -- correct
- Dark theme matching existing lobby/battle styling -- correct

### 5.3 StageDetailPanelComponent
**File:** `apps/client/src/app/features/campaign/stage-detail-panel.component.ts`
**Verdict:** CORRECT.
- Standalone component with `CommonModule` -- correct
- Uses `@Input({ required: true })` for `stage` and `currentEnergy` -- correct
- Uses `@Output()` for `startBattle` and `close` events -- correct
- Displays: stage name, chapter/stage label, stars, difficulty, energy cost, enemy count, rewards (gold, xp, hero shards) -- all present
- Energy cost shown with insufficient highlighting (`[class.insufficient]`) -- correct
- Start Battle button disabled when energy insufficient -- correct
- Button text changes to "Not Enough Energy" when disabled -- correct
- Hero shard display shows templateId and count -- correct
- Modal pattern: backdrop click closes panel -- correct

**SUGGESTION [S2]:** The hero shard display (line 45) shows the raw `templateId` (e.g., "warrior_bold"). For a better UX, this could resolve to the hero name using `HeroesService.templates()`. However, since this was acknowledged as acceptable in the plan (Task 12 specified using HeroesService but MVP is fine with template IDs), this is non-blocking.

### 5.4 Campaign Route
**File:** `apps/client/src/app/app.routes.ts:40-46`
**Verdict:** CORRECT.
- Path: `'campaign'` -- correct
- Lazy-loaded: `loadComponent` with dynamic import -- correct pattern
- Auth guard: `canActivate: [authGuard]` -- correct
- Placed before the battle route and wildcard -- correct order

### 5.5 Lobby Campaign Card
**File:** `apps/client/src/app/features/lobby/lobby.component.ts:30-35`
**Verdict:** CORRECT.
- Changed from `class="menu-card disabled"` to `class="menu-card" routerLink="/campaign"` -- correct
- Text changed from "Coming in Sprint 2" to "Conquer the world stage by stage" -- correct
- Added campaign progress display: `{{ completedStages() }}/30` -- correct

---

## 6. Phase 6: Post-Battle Navigation & Lobby Progress Review

### 6.1 BattleEventBus stageId
**File:** `apps/client/src/app/features/battle/services/battle-event-bus.ts:8`
**Change:** Added `stageId: string | null` to `BattleData` interface.
**Verdict:** CORRECT. Non-breaking addition to the interface.

### 6.2 BattleComponent stageId Pass-through
**File:** `apps/client/src/app/features/battle/battle.component.ts:281`
**Change:** `this.eventBus.setBattleData({ playerTeam, enemyTeam, battleLog, stageId })`
**Verdict:** CORRECT. The `stageId` from the route parameter is passed through to the event bus.

### 6.3 ResultScene Conditional Navigation
**File:** `apps/client/src/app/features/battle/scenes/ResultScene.ts:156-158`
**Change:** `eventBus.emitNavigate('lobby')` -> `eventBus.emitNavigate(battleData.stageId ? 'campaign' : 'lobby')`
**Verdict:** CORRECT. Gets battle data from event bus, checks for `stageId`, navigates to `campaign` for campaign battles and `lobby` for non-campaign battles.

### 6.4 Lobby Campaign Progress
**File:** `apps/client/src/app/features/lobby/lobby.component.ts:153-165`
**Change:** Added `CampaignService` dependency, `completedStages` computed signal, `ngOnInit` to load stages.
**Verdict:** CORRECT.
- `completedStages` is a computed signal that counts stages where `s.completed === true` -- correct
- `ngOnInit` loads stages to populate the signal -- correct
- Display shows `{{ completedStages() }}/30` -- correct

**SUGGESTION [S3]:** The lobby now implements `OnInit` and loads campaign stages on every lobby visit. This is a lightweight call (30 stages from DB + static data), but it could be optimized by checking if stages are already loaded. Since the plan's Decision 4 explicitly chose re-fetching for simplicity, this is acceptable for MVP.

---

## 7. Cross-Cutting Concerns

### 7.1 TypeScript Type Safety
- All new types properly use existing interfaces via `extends`
- `CampaignStageResponse` extends `CampaignStage` -- type-safe
- `BattleData.stageId` is `string | null` -- matches the nullable pattern
- `@Input({ required: true })` used correctly in the stage detail panel

### 7.2 Security
- Auth guard on campaign route -- correct
- stageId validation with regex -- prevents injection of malformed IDs
- Battle lock uses atomic SET NX -- prevents race condition
- Redis cleanup on error -- prevents lock-out after failures
- No new user inputs without validation

### 7.3 Consistent Code Style
- New frontend files follow existing standalone component pattern
- Signal-based state matches existing services
- Import ordering is consistent
- CSS follows the existing dark theme with same color palette (#1a1a2e, #0f3460, #e94560, #ffd700)
- Naming conventions match existing patterns (PascalCase components, camelCase methods)

### 7.4 Transaction Safety
- Star rating update: inside `$transaction` -- correct
- bestTimeMs update: inside `$transaction` -- correct
- Hero shard upsert: inside `$transaction` -- correct
- All campaign progress updates are atomic with reward granting

---

## 8. Issues Summary

### Minor Issues

| # | File | Description | Severity |
|---|------|-------------|----------|
| M1 | `battles.service.ts:344` | bestTimeMs falsy check for 0 -- actually correct behavior (0 is "never recorded") | Non-issue (verified) |
| M2 | `battles.service.ts:352` | Redundant `getStage()` call inside transaction -- stage was already loaded at line 255 | Minor (perf) |
| M3 | `campaign.service.ts:14-19` | `loading` signal never set to `false` on API error | Minor (UX) |

### Suggestions

| # | File | Description | Priority |
|---|------|-------------|----------|
| S1 | `battles.service.ts:278` | Extract non-campaign reward `50` gold into a named constant in GAME_CONFIG | Low |
| S2 | `stage-detail-panel.component.ts:45` | Resolve hero shard `templateId` to hero name for better UX | Low |
| S3 | `lobby.component.ts:164` | Consider caching campaign stages to avoid re-fetching on every lobby visit | Low |

---

## 9. Bug Fix Verification Checklist

| # | Bug | Fixed? | Verification |
|---|-----|--------|--------------|
| C1 | Frontend-Backend URL mismatch | YES | `battle.service.ts:117` now posts to `/battles/complete` |
| C2 | Energy deducted before stage unlock validation | YES | `validateStageUnlocked` at line 49-51, energy deduction at line 64-81 |
| C3 | Star rating downgrade on replay | YES | `Math.max` on line 343 preserves best rating |
| C4 | 3-star float comparison | YES | Integer comparison `alivePlayerCount === totalPlayers` on line 268 |
| H3 | Redis lock/seed cleanup on error | YES | try/catch on lines 94-204 with cleanup on lines 201-202 |
| H4 | Battle lock TOCTOU race condition | YES | Atomic `setNx` on lines 85-89, old `redis.get` check removed |
| M4 | Non-campaign reward uses startingGold | YES | Hardcoded `50` on line 278 |
| M5 | stageId format validation | YES | `@Matches(/^\d{1,2}-[1-3]$/)` on `start-battle.dto.ts:6` |
| L4 | @IsEnum with array | YES | Changed to `@IsIn` on `complete-battle.dto.ts:78` |

---

## 10. Feature Verification Checklist

| # | Feature | Implemented? | Verification |
|---|---------|-------------|--------------|
| 1 | PlayerHeroShard model (composite PK, relations) | YES | `schema.prisma:120-130` |
| 2 | Star rating never downgrades | YES | `Math.max` in upsert update |
| 3 | bestTimeMs tracked with Math.min | YES | Create + Math.min update |
| 4 | Hero shards granted with upsert | YES | Inside $transaction, lines 351-362 |
| 5 | CampaignStageResponse shared type | YES | `campaign.ts:24-28` |
| 6 | HeroShardProgress shared type | YES | `campaign.ts:30-35` |
| 7 | Frontend CampaignService | YES | Signal-based, matching HeroesService pattern |
| 8 | Campaign map with chapters/stages | YES | Grouped by chapter, star display, lock/unlock |
| 9 | Stage detail panel | YES | Shows all info, energy check, start button |
| 10 | Campaign route with lazy loading + auth guard | YES | `app.routes.ts:40-46` |
| 11 | Lobby campaign card active | YES | `routerLink="/campaign"`, progress display |
| 12 | Post-battle navigation to campaign | YES | `stageId` through EventBus, conditional navigate |
| 13 | Campaign progress in lobby (X/30) | YES | Computed signal from CampaignService |

---

## 11. Conclusion

All Sprint 5 deliverables are complete and correctly implemented. The code quality is high, following existing patterns and architectural conventions. The 3 minor issues identified are non-blocking and can be addressed in a future iteration. The implementation is ready for testing.

**Recommended next steps:**
1. Run `npx prisma migrate dev --name add-hero-shards` to generate the migration
2. Address M2 (redundant `getStage` call) and M3 (error handling for loading state)
3. Test the full flow: Lobby -> Campaign Map -> Stage Detail -> Battle -> Result -> Campaign Map
