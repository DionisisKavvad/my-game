# Sprint 5 -- Consolidated Review

**Reviewer:** Expert Plan Reviewer
**Date:** 2026-02-23
**Documents Reviewed:**
- `HeroWars_MVP_Architecture.txt` (Architecture Blueprint)
- `SPRINT5_PLAN.md` (Implementation Plan by Senior Developer)
- `SPRINT5_DEBUG_REPORT.md` (Debug Audit by Expert Debugger)

**Source Files Verified:**
- `apps/api/src/battles/battles.service.ts`
- `apps/api/src/battles/battles.controller.ts`
- `apps/api/src/battles/dto/start-battle.dto.ts`
- `apps/api/src/battles/dto/complete-battle.dto.ts`
- `apps/api/src/campaign/campaign.service.ts`
- `apps/api/src/campaign/campaign.controller.ts`
- `apps/client/src/app/features/lobby/lobby.component.ts`
- `apps/client/src/app/core/services/battle.service.ts`
- `apps/client/src/app/app.routes.ts`
- `libs/shared/src/models/campaign.ts`
- `libs/shared/src/constants/campaign-stages.ts`
- `libs/shared/src/constants/game-config.ts`
- `apps/api/prisma/schema.prisma`

---

## 1. Executive Summary

**VERDICT: CONDITIONAL PASS**

The Sprint 5 plan is thorough, well-structured, and covers the core deliverables (stage definitions, campaign map, progress tracking, rewards). The debug report is comprehensive and accurately identifies real issues in the codebase. However, there are several inaccuracies, missing bug integrations, and ordering issues that must be corrected before implementation begins.

**Conditions for passing:**
1. Fix the **C1 critical bug** (frontend-backend URL mismatch) -- this is not mentioned in the plan at all and blocks ALL battle completion
2. Fix the **C2 critical bug** (energy deducted before stage unlock validation) -- not mentioned in the plan
3. Fix the **C4 critical bug** (floating-point comparison for 3-star threshold) -- not mentioned in the plan
4. Address the **H4 high bug** (battle lock TOCTOU race condition) -- not mentioned in the plan
5. Correct the plan's inaccuracies about line numbers and existing code behavior (detailed below)

---

## 2. Accuracy Verification -- Plan vs. Actual Source Code

### 2.1 Confirmed Accurate Claims

| Plan Claim | Verified |
|------------|----------|
| Campaign stages: 10 chapters x 3 stages = 30 stages fully defined | YES -- `campaign-stages.ts` has exactly 30 stages |
| Campaign data models complete in `libs/shared/src/models/campaign.ts` | YES -- CampaignStage, CampaignEnemy, StageRewards, CampaignProgress all present |
| CampaignProgress Prisma model with composite PK | YES -- `schema.prisma:90-101` has `@@id([playerId, stageId])` |
| `GET /campaign/stages` and `GET /campaign/stages/:id` endpoints exist | YES -- `campaign.controller.ts:10-25` |
| Energy deduction exists in `startBattle` | YES -- `battles.service.ts:57-73` |
| Star calculation uses `resultHp` from last turn | YES -- `battles.service.ts:260-272` |
| Lobby campaign card is disabled with "Coming in Sprint 2" | YES -- `lobby.component.ts:30-33` |
| No `/campaign` route exists in `app.routes.ts` | YES -- only login, register, lobby, heroes, battle routes |
| `heroShards` defined in stage rewards but never granted | YES -- `completeBattle` only handles gold/xp (lines 255-256) |
| `bestTimeMs` never updated | YES -- upsert at lines 322-337 does not set `bestTimeMs` |
| Stars set unconditionally (`{ set: starsEarned }`) | YES -- `battles.service.ts:333` |
| Stage unlock logic hardcodes 3 stages per chapter | YES -- both `campaign.service.ts:67` and `battles.service.ts:383` |
| Duplicate stage unlock logic in two services | YES -- CampaignService and BattlesService have separate implementations |

### 2.2 Inaccuracies in the Plan

**Inaccuracy 1: Line number references are approximate, not exact**
The plan references "line ~337" for the campaign progress upsert. The actual upsert is at lines 322-337. The plan also says "energyCost at line 56-73" which is correct. Minor issue but implementers should refer to actual source, not plan line numbers.

**Inaccuracy 2: Plan says `bestTimeMs` "defaults to 0"**
This is correct -- `schema.prisma:94` shows `@default(0)`. However, the plan says `completedAt` is missing from the `create` block. Looking at the actual upsert (lines 327-331), `completedAt` is indeed missing from the `create`, but the Prisma schema has `@default(now())` at line 95, so it gets a value. The debug report (H7) correctly identifies this as a minor inconsistency. The plan does not mention this.

**Inaccuracy 3: Plan says BattleEventBus already carries battle data**
The plan (Task 11) claims "The BattleEventBus already carries battle data" and proposes adding `stageId` to `BattleData`. This should be verified -- I did not have access to the EventBus file but this claim should be validated during implementation.

**Inaccuracy 4: Plan's Task 3 mentions `existingBestTime` variable**
The plan shows code using `existingBestTime` but does not show where this value comes from. It adds a note "Need to load existing progress before the upsert" but does not provide the actual code for the `findUnique` query. The implementer will need to add this.

### 2.3 Inaccuracies in the Debug Report

**All critical and high bugs verified as accurate.** Specifically:

- **C1 (URL mismatch):** CONFIRMED. Frontend posts to `` `/battles/${battleId}/complete` `` (`battle.service.ts:117`), but backend controller defines `@Post('complete')` at `battles.controller.ts:21`. The backend route resolves to `/battles/complete`, not `/battles/:id/complete`. This is a **showstopper bug** -- battle completion is broken.

- **C2 (energy before unlock validation):** CONFIRMED. `battles.service.ts:57-73` deducts energy, then line 77 validates stage unlock. If validation fails, energy is lost.

- **C3 (star downgrade):** CONFIRMED. `battles.service.ts:333` uses `stars: { set: starsEarned }`.

- **C4 (3-star threshold):** CONFIRMED. `game-config.ts:45` sets threshold to 1.0, and `battles.service.ts:264-266` uses `>=` floating-point comparison. Float precision risk is real.

- **H4 (TOCTOU):** CONFIRMED. Lock check at line 40 is separate from lock set at line 168. Not atomic.

- **H5 (seed exposure):** CONFIRMED. `battles.service.ts:199` returns raw `seed` value. However, the debug report's suggested fix (decouple client/server seeds) is a significant architecture change. For Sprint 5 MVP, this is acknowledged but deferred.

- **M4 (non-campaign reward uses startingGold):** CONFIRMED. `battles.service.ts:276` uses `GAME_CONFIG.player.startingGold` (500 gold) for non-campaign rewards, which is excessive.

---

## 3. Completeness Check -- Sprint 5 Deliverables

The architecture doc (Section 12) defines Sprint 5 as: **"Stage definitions, campaign map, progress tracking, rewards"**

| Deliverable | Covered in Plan? | Status |
|-------------|-----------------|--------|
| Stage definitions | Already implemented (30 stages) | DONE |
| Campaign map UI | Task 7, 8, 9 | PLANNED |
| Progress tracking | Task 3 (bestTimeMs), Task 13 (profile display) | PLANNED |
| Rewards: gold/xp | Already implemented | DONE |
| Rewards: hero shards | Task 1, 2, 12 | PLANNED |
| Star rating system | Already implemented (with bug fix in Task 3) | NEEDS FIX |
| Campaign route + lobby integration | Task 9, 10 | PLANNED |
| Post-battle navigation back to campaign | Task 11 | PLANNED |

**ASSESSMENT: All four Sprint 5 deliverables are covered.** The plan correctly identifies what exists and what needs to be built. The frontend campaign UI (the main missing piece) is well-specified in Tasks 6-10.

---

## 4. Critical Bug Fixes NOT in the Plan

The following bugs from the debug report are **not addressed** in the Sprint 5 plan but **must** be fixed:

### MUST FIX (Blocks functionality)

| Bug | Severity | Why It Must Be in Sprint 5 |
|-----|----------|---------------------------|
| **C1: Frontend-Backend URL mismatch** | Critical | Battle completion is completely broken. No battle can be validated or return rewards. This blocks ALL campaign functionality. |
| **C2: Energy deducted before stage unlock validation** | Critical | Players lose energy when attempting locked stages. Directly impacts campaign progression UX. |
| **C4: 3-star float comparison** | Critical | Players may be unable to achieve 3 stars even with all heroes surviving. Undermines the star system. |
| **H4: Battle lock TOCTOU** | High | Allows concurrent battles, bypassing energy validation. Directly exploitable. |

### SHOULD FIX (Improve quality)

| Bug | Severity | Rationale |
|-----|----------|-----------|
| **H3: Redis lock/seed cleanup on error** | High | Player gets locked out for 5 minutes if battle creation fails. Poor UX. |
| **M4: Non-campaign reward uses startingGold** | Medium | 500 gold per non-campaign battle is an economic exploit. |
| **M5: stageId format validation** | Medium | Malformed stageIds could cause unexpected behavior in unlock logic. |
| **L4: @IsEnum with array** | Low | Incorrect validator usage, may cause validation bypass. |

### DEFER (Out of Sprint 5 scope)

| Bug | Severity | Rationale |
|-----|----------|-----------|
| **H1: Replay reward exploitation** | High | Plan explicitly decided to allow farming, with energy as limiter. This is a design decision, not a bug. Acceptable for MVP. |
| **H2: Energy refund on validation failure** | High | Rare edge case (requires client bug). Acceptable for MVP. |
| **H5: Seed exposure** | High | Requires architecture redesign. Too large for Sprint 5. Document for Phase 2. |
| **M1: Enemy stars validation** | Medium | Data is hand-authored and correct. Nice-to-have validation. |
| **M2: RNG consumption inconsistency** | Medium | Not a bug, just inconsistent style. Engine is deterministic. |
| **M3: durationMs DTO mismatch** | Medium | Works correctly despite structural oddity. |
| **M8: Cooldown off-by-one** | Medium | Battle engine is working and tested. Changing this now risks breaking determinism. |
| **L1: Hardcoded 3 stages per chapter** | Low | All 10 chapters have exactly 3 stages. No near-term risk. |
| **L2: Duplicate unlock logic** | Low | Acknowledged but refactoring during feature work is risky. |
| **L3: Pending battle cleanup** | Low | Sprint 6 (scheduled jobs). |
| **L5: DailyQuest resetDate** | Low | Sprint 6 scope. |
| **L6: HeroesService.addXp auto-level** | Low | By design (manual level-up). |
| **L7: Error handling swallows failures** | Low | ResultScene has polling fallback. Acceptable for MVP. |
| **L8: getStage linear search** | Low | 30 stages, negligible performance impact. |

---

## 5. Architecture Alignment

### 5.1 Patterns Followed (Good)

- **Monorepo structure**: New shared types in `libs/shared` -- correct
- **Standalone Angular components**: Campaign map as standalone component -- correct
- **Signal-based state**: Frontend CampaignService using signals -- matches HeroesService pattern
- **Lazy loading routes**: Campaign route uses `loadComponent` -- correct
- **Prisma composite PK**: PlayerHeroShard model uses `@@id([playerId, templateId])` -- matches existing CampaignProgress and DailyQuest patterns
- **JWT auth guard**: Campaign route protected by `authGuard` -- correct

### 5.2 Architecture Concerns

**Concern 1: Campaign map as Angular-only (no Phaser) -- APPROVED**
The plan's Decision 2 is correct. The architecture doc (Section 8.1) shows `campaign/` under `features/` as "Map, stage selection" -- a UI concern. Phaser is reserved for battle visualization per Section 8.2. This is the right call.

**Concern 2: Stage detail as inline panel (not separate route) -- APPROVED**
Decision 3 keeps navigation simple. The user stays on the campaign map and sees stage details in context. This avoids route juggling.

**Concern 3: Re-fetch on return from battle -- APPROVED**
Decision 4 (re-fetch `GET /campaign/stages` after battle) is simple and reliable. The endpoint is lightweight. No need for client-side optimistic updates at MVP.

**Concern 4: Hero shard system -- MINOR CONCERN**
The plan creates a `player_hero_shards` table and grants shards, but the architecture doc's Phase 2 includes "Gacha / Shop" which is where hero unlocking typically lives. The plan correctly scopes Sprint 5 to "accumulation and display only" (no hero unlocking). This is acceptable.

**Concern 5: No Phaser dependency leak -- VERIFIED**
The plan does not introduce Phaser into the campaign map component. Good separation.

---

## 6. Dependency Order Review

### 6.1 Plan's Dependency Graph -- Corrections Needed

The plan's dependency graph has one issue:

**Issue: Tasks 2 and 3 both modify `battles.service.ts` -- the plan says they can be done in parallel.**
This is technically possible if done carefully (different sections), but both modify the `completeBattle` method and the campaign progress upsert block. **Recommendation: Do Task 3 first (smaller change, bestTimeMs), then Task 2 (adds hero shard logic after the upsert).** This avoids merge conflicts.

**Issue: Bug fixes are not in the dependency graph at all.**
The critical bug fixes (C1, C2, C4, H4) should be at the TOP of the dependency graph, before any new feature work. C1 in particular blocks all testing of the battle/reward flow.

### 6.2 Missing from Dependency Graph

- Bug fix C1 (URL mismatch) -- should be Task 0, done FIRST
- Bug fix C2 (energy order) -- should be done with backend tasks
- Bug fix C4 (star threshold) -- should be done with Task 3
- Bug fix H4 (lock race condition) -- should be done early

---

## 7. Edge Cases Review

### 7.1 Covered (Good)
- Energy validation (client + server)
- Stage unlock enforcement (dual validation)
- Concurrent battle prevention (battle lock)
- Atomic reward granting (Prisma transaction)
- Star rating calculation
- Replay farming (design decision: allow with energy limiter)

### 7.2 Not Covered (Gaps)

**Gap 1: What happens if the player starts a campaign battle but has no team?**
The `startBattle` method checks `playerHeroes.length === 0` at line 87-89 and throws `ConflictException`. However, energy has already been deducted at lines 69-72. If the player somehow has no team (cleared between API calls), they lose energy. This is similar to C2 but for a different validation failure. **Recommendation:** Move all validations (stage unlock, team existence) BEFORE energy deduction.

**Gap 2: What if the player's team changes between `startBattle` and `completeBattle`?**
The server stores the team snapshot in `battleLog.initialState` at battle creation (line 183-186) and re-simulates from that snapshot (line 230). So changing the team mid-battle does not affect validation. This is correctly handled.

**Gap 3: What if a hero template referenced in campaign-stages.ts does not exist in the database?**
The `startBattle` method loads templates at lines 127-129 and throws `NotFoundException` at line 135 if missing. This is handled, but energy has already been deducted. Same pattern as Gap 1.

**Gap 4: Campaign map with no internet connection / API failure**
The plan's frontend CampaignService sets `loading` signal but does not specify error handling behavior. Recommendation: Add a simple error signal and retry button for the campaign map.

---

## 8. Frontend UX Review

### 8.1 Campaign Map Specification -- ADEQUATE

The plan specifies:
- Vertical scrollable chapter list with stage nodes
- Star rating display per stage
- Lock icon for locked stages
- Stage detail panel as inline overlay
- Energy display in header
- "Start Battle" button with energy check
- Navigation back to lobby

This covers the essential campaign map UX. The dark theme matching (mentioned in Task 7) is appropriate.

### 8.2 Missing UX Details (Non-blocking)

- **Loading state**: The plan mentions `loading` signal but no skeleton/spinner UI
- **Empty state**: What shows if the API call fails? No error UI specified
- **Chapter headers**: No specification for chapter name/theme display
- **Scroll position**: After returning from battle, should the map scroll to the last played stage? Not specified
- **Transitions**: No animation/transition specifications, but acceptable for MVP

### 8.3 Navigation Flow -- CORRECT

```
Lobby -> Campaign Map -> Stage Detail Panel -> Battle -> Result Screen -> Campaign Map
         (new)            (new, inline)          (existing)  (existing)     (new behavior)
```

The plan correctly identifies that `ResultScene` currently navigates to `/lobby` and needs to conditionally navigate to `/campaign` for campaign battles (Task 11).

---

## 9. Data Integrity Review

### 9.1 Atomic Operations -- ADEQUATE

The reward granting uses `prisma.$transaction` (line 281) which ensures all-or-nothing for:
- Battle record update
- Player gold/xp increment
- Hero XP increment
- Campaign progress upsert
- (Proposed) Hero shard upsert

This is correct for data integrity.

### 9.2 Concern: Energy Deduction Outside Transaction

Energy is deducted BEFORE the transaction (line 69-72), not inside it. If the transaction fails, the player loses energy but gets no rewards and no campaign progress. The plan does not address this.

**Recommendation:** Move energy deduction inside the `completeBattle` transaction, or at minimum, into a try-catch that refunds on failure. This is a design debt to acknowledge.

**For Sprint 5 MVP:** Acceptable as-is. The transaction failure scenario is a server error (DB down), not a normal user flow.

---

## 10. Over-engineering Check

### 10.1 Items That ARE Needed
- Hero shard model and granting -- YES, stages already define shard rewards
- bestTimeMs tracking -- YES, field already exists, just needs to be populated
- Campaign map component -- YES, core Sprint 5 deliverable
- Campaign route and lobby integration -- YES, required for navigation

### 10.2 Items That MAY Be Over-engineering

**Hero shard display (Task 12):** The plan creates shard display in the stage detail panel. Since hero unlocking via shards is Phase 2, displaying shard counts on the pre-battle screen has limited value. **Verdict: KEEP** -- it communicates the reward to the player, even if they cannot use shards yet. Low effort, high UX value.

**Campaign progress in profile (Task 13):** Shows "Campaign: X/30" in lobby. **Verdict: KEEP** -- low effort, gives players a sense of progression.

**CampaignMapResponse type with energy (Task 4):** The plan proposes a `CampaignMapResponse` type that bundles stages with energy info. The current API returns just the stages array. **Verdict: Consider simplifying.** The frontend can get energy from the player profile (already loaded in AuthService). No need to duplicate energy data in the campaign API response. However, this is a minor point.

### 10.3 Items Correctly Excluded
- Auto-replay / sweep -- deferred (P3)
- Hero unlocking via shards -- Phase 2
- Energy regeneration -- Sprint 6
- Gacha integration -- Phase 2

---

## 11. Unresolved Questions -- DECISIONS

**Q1: Should shard farming be allowed on replay?**
Plan Decision: YES, allow farming. Energy cost is the natural limiter.
**DECISION: APPROVED.** This matches mobile RPG norms. If it becomes a problem, add daily caps later.

**Q2: Should the campaign API include energy data or should the frontend get it from player profile?**
**DECISION: Use player profile.** The AuthService already has `player.energy` and `player.maxEnergy`. Adding energy to the campaign API is redundant. The frontend campaign component can read it from `authService.player()`. This simplifies Task 5.

**Q3: Should the `completedAt` be explicitly set in the `create` clause of the campaign progress upsert?**
**DECISION: YES, for clarity.** Add `completedAt: new Date()` to both create and update blocks. Relying on `@default(now())` works but is implicit.

---

## 12. FINAL Prioritized Task List

This merges the plan's 13 tasks with the required bug fixes, ordered for implementation. Tasks are grouped into phases.

### Phase 0: Critical Bug Fixes (MUST complete first)

| # | Task | Files | Bug Ref |
|---|------|-------|---------|
| 0A | **Fix battle completion URL mismatch** -- Change frontend `battle.service.ts` to POST to `/battles/complete` (remove `/${battleId}` from URL path). The `battleId` is already in the request body. | `apps/client/src/app/core/services/battle.service.ts:117` | C1 |
| 0B | **Fix energy deduction order** -- Move `validateStageUnlocked()` call and team existence check to BEFORE energy deduction in `startBattle()`. Order should be: (1) validate stage exists, (2) validate stage unlocked, (3) validate team exists, (4) deduct energy. | `apps/api/src/battles/battles.service.ts:38-78` | C2 |
| 0C | **Fix 3-star float comparison** -- Change star calculation to use integer comparison: `alivePlayerCount === totalPlayers` for 3 stars instead of `survivalRatio >= 1.0`. | `apps/api/src/battles/battles.service.ts:264-266` | C4 |
| 0D | **Fix battle lock race condition** -- Replace separate GET+SET with atomic `SET NX` (set-if-not-exists) for the battle lock. Remove the `redis.get` check at lines 40-45 and use `setNx` at the lock acquisition point. | `apps/api/src/battles/battles.service.ts:40-45, 168-172` | H4 |
| 0E | **Add Redis cleanup on error** -- Wrap `startBattle()` in try-catch to clean up Redis lock and seed keys if battle creation fails. | `apps/api/src/battles/battles.service.ts` | H3 |
| 0F | **Fix stageId format validation** -- Add `@Matches(/^\d{1,2}-[1-3]$/)` to `StartBattleDto.stageId`. | `apps/api/src/battles/dto/start-battle.dto.ts` | M5 |
| 0G | **Fix non-campaign reward constant** -- Replace `GAME_CONFIG.player.startingGold` with a proper reward constant for non-campaign battles (e.g., 50 gold). | `apps/api/src/battles/battles.service.ts:276` | M4 |
| 0H | **Fix DTO validator** -- Change `@IsEnum(['victory', 'defeat', 'timeout'])` to `@IsIn(['victory', 'defeat', 'timeout'])`. | `apps/api/src/battles/dto/complete-battle.dto.ts:78` | L4 |

### Phase 1: Backend -- Data Model + Schema

| # | Task | Files | Plan Ref |
|---|------|-------|----------|
| 1 | **Add PlayerHeroShard Prisma model** -- Create model with composite PK `[playerId, templateId]`, count field. Add relations to Player and HeroTemplate. Run migration. | `apps/api/prisma/schema.prisma` | Plan Task 1 |

### Phase 2: Backend -- Battle Service Enhancements

| # | Task | Files | Plan Ref |
|---|------|-------|----------|
| 2 | **Fix star rating downgrade on replay** -- Load existing campaign progress before the upsert. Use `Math.max(existingStars, starsEarned)` in the update clause. Also set `completedAt: new Date()` in both create and update. | `apps/api/src/battles/battles.service.ts:322-337` | Plan Task 3 + Bug C3 |
| 3 | **Track bestTimeMs in campaign progress** -- In the upsert, set `bestTimeMs: clientLog.durationMs` on create, and `Math.min(existingBestTime, clientLog.durationMs)` on update. Uses the existing progress loaded in Task 2. | `apps/api/src/battles/battles.service.ts:322-337` | Plan Task 3 |
| 4 | **Grant hero shards on battle completion** -- Inside the `$transaction`, after campaign progress upsert, add hero shard upsert logic for stages that define `heroShards` in rewards. | `apps/api/src/battles/battles.service.ts` | Plan Task 2 |

### Phase 3: Shared Types

| # | Task | Files | Plan Ref |
|---|------|-------|----------|
| 5 | **Add CampaignStageResponse and HeroShardProgress types** -- Add response interfaces to shared campaign model. CampaignStageResponse extends CampaignStage with stars, completed, unlocked fields. | `libs/shared/src/models/campaign.ts` | Plan Task 4 |

### Phase 4: Backend -- Campaign API Enhancement

| # | Task | Files | Plan Ref |
|---|------|-------|----------|
| 6 | **Ensure campaign API response matches CampaignStageResponse** -- Verify the existing `getStages()` response shape includes all fields needed by frontend. No need to add energy (frontend reads from AuthService). | `apps/api/src/campaign/campaign.service.ts` | Plan Task 5 (simplified) |

### Phase 5: Frontend -- Campaign Feature

| # | Task | Files | Plan Ref |
|---|------|-------|----------|
| 7 | **Create frontend CampaignService** -- Signal-based service with `loadStages()`, using ApiService to call `GET /campaign/stages`. | `apps/client/src/app/core/services/campaign.service.ts` (new) | Plan Task 6 |
| 8 | **Create Campaign Map component** -- Standalone Angular component with chapter list, stage nodes, star ratings, lock states. Uses CampaignService for data and AuthService for energy. | `apps/client/src/app/features/campaign/campaign-map.component.ts` (new) | Plan Task 7 |
| 9 | **Create Stage Detail Panel component** -- Child component showing stage info, enemy count, rewards, energy cost, "Start Battle" button. Disable button if insufficient energy. | `apps/client/src/app/features/campaign/stage-detail-panel.component.ts` (new) | Plan Task 8 |
| 10 | **Add `/campaign` route** -- Add lazy-loaded route with authGuard. | `apps/client/src/app/app.routes.ts` | Plan Task 9 |
| 11 | **Update Lobby campaign card** -- Change from disabled to active with `routerLink="/campaign"`. Update text from "Coming in Sprint 2" to "Conquer the world stage by stage". | `apps/client/src/app/features/lobby/lobby.component.ts` | Plan Task 10 |
| 12 | **Add hero shard display to stage detail** -- Show hero shard name and count for stages with shard rewards. | `apps/client/src/app/features/campaign/stage-detail-panel.component.ts` | Plan Task 12 |

### Phase 6: Frontend -- Navigation Integration

| # | Task | Files | Plan Ref |
|---|------|-------|----------|
| 13 | **Navigate to campaign map after campaign battle** -- Modify ResultScene to check for stageId and navigate to `/campaign` instead of `/lobby` for campaign battles. Pass stageId through BattleEventBus. | `ResultScene.ts`, `battle-event-bus.ts`, `battle.component.ts` | Plan Task 11 |
| 14 | **Add campaign progress to lobby** -- Show "Campaign: X/30" completion in lobby header. | `apps/client/src/app/features/lobby/lobby.component.ts` | Plan Task 13 |

---

## 13. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| C1 bug not fixed -- battle completion broken | HIGH (it IS broken) | Critical -- no rewards, no progress | Fix in Phase 0 before any feature work |
| Battle lock race condition exploited | Medium | High -- concurrent battles, double energy bypass | Fix with atomic SET NX (Phase 0) |
| Star downgrade on replay frustrates players | Medium | Medium -- trust erosion | Fix in Phase 2 |
| Hero shard table migration fails | Low | Medium -- blocks shard features | Test migration in dev first |
| Campaign map component too complex | Low | Medium -- delays Sprint 5 | Keep MVP: no animations, simple grid layout |

---

## 14. Test Recommendations

Before marking Sprint 5 as complete, verify:

1. **Battle completion works end-to-end** (after C1 fix)
2. **Campaign map loads and displays all 30 stages** with correct lock/unlock states
3. **First stage (1-1) is always unlocked**, subsequent stages lock correctly
4. **Energy is NOT deducted when attempting a locked stage** (after C2 fix)
5. **Star rating never downgrades** on replay (after C3 fix)
6. **3 stars achievable** when all heroes survive (after C4 fix)
7. **Hero shards are granted** and accumulate correctly
8. **bestTimeMs updates** with best (lowest) time
9. **Post-battle navigation** returns to campaign map (not lobby) for campaign battles
10. **Lobby campaign card** links to `/campaign`
11. **Insufficient energy** disables the Start Battle button

---

## 15. Summary of Changes to the Original Plan

| Category | Change |
|----------|--------|
| **Added** | Phase 0 with 8 bug fixes (C1, C2, C3, C4, H3, H4, M4, M5, L4) |
| **Modified** | Task 3 merged with bug fix C3 (star downgrade) |
| **Simplified** | Task 5 -- no need to add energy to campaign API (frontend reads from AuthService) |
| **Reordered** | Bug fixes come BEFORE new features |
| **Deferred** | H1 (replay farming), H2 (energy refund on validation fail), H5 (seed exposure), M1, M2, M3, M8, L1-L8 |
| **Corrected** | Plan's claim that Tasks 2 and 3 can be fully parallel -- recommend sequential due to shared code section |
