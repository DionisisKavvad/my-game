# Sprint 5 -- Campaign System Implementation Plan

**Date:** 2026-02-23
**Sprint Goal:** Stage definitions, campaign map, progress tracking, rewards
**Architecture Ref:** `HeroWars_MVP_Architecture.txt` Section 12 (Sprint 5)

---

## 1. Gap Analysis

### 1.1 What Is Fully Implemented

| Component | Location | Status |
|-----------|----------|--------|
| Campaign stage definitions (10 chapters x 3 stages = 30 stages) | `libs/shared/src/constants/campaign-stages.ts` | Complete |
| Campaign data models (CampaignStage, CampaignEnemy, StageRewards, CampaignProgress) | `libs/shared/src/models/campaign.ts` | Complete |
| CampaignProgress Prisma model (composite PK, stars, bestTimeMs, completedAt) | `apps/api/prisma/schema.prisma` | Complete |
| `GET /campaign/stages` -- returns all stages with player progress, unlock status | `apps/api/src/campaign/campaign.controller.ts` | Complete |
| `GET /campaign/stages/:id` -- returns single stage detail with progress | `apps/api/src/campaign/campaign.controller.ts` | Complete |
| Stage unlock validation (server-side, in both CampaignService and BattlesService) | `campaign.service.ts`, `battles.service.ts` | Complete |
| Energy deduction on battle start | `battles.service.ts:56-73` | Complete |
| Battle start/complete flow with server-side validation | `battles.service.ts` | Complete |
| Campaign progress upsert on validated victory | `battles.service.ts:322-337` | Complete |
| Star calculation based on hero survival ratio | `battles.service.ts:260-272` | Complete |
| Reward granting (gold, XP, hero XP) in atomic transaction | `battles.service.ts:280-338` | Complete |
| Battle engine (simulator, damage, AI, effects, skills, RNG) | `libs/battle-engine/src/` | Complete |
| Battle visualization (BattleScene, PreloadScene, ResultScene, HeroSprite) | `apps/client/src/app/features/battle/` | Complete |
| Battle event bus (Angular <-> Phaser communication) | `battle/services/battle-event-bus.ts` | Complete |
| Client-side BattleService (start, simulate, complete flow) | `core/services/battle.service.ts` | Complete |
| Result screen with stars display, reward display, continue button | `battle/scenes/ResultScene.ts` | Complete |
| Game config constants (energy, rewards, star thresholds, battle params) | `libs/shared/src/constants/game-config.ts` | Complete |

### 1.2 What Is Partially Implemented

| Component | Current State | What's Missing |
|-----------|---------------|----------------|
| Lobby campaign card | Shows "Coming in Sprint 2" as disabled card (`lobby.component.ts:30-33`) | Needs to link to campaign map route |
| Stage unlock logic (CampaignService) | Hardcodes previous stage as `chapter-3` for first-of-chapter (`campaign.service.ts:67`) | Works correctly for 3-stages-per-chapter but is not configurable |
| Star calculation | Uses last action's resultHp to count surviving player heroes (`battles.service.ts:260`) | Does not track `bestTimeMs` in CampaignProgress on update |
| Hero shard rewards | Defined in `StageRewards.heroShards` on some stages | **Not granted** -- `battles.service.ts` reward logic ignores `heroShards` entirely |
| Energy regeneration | `energyRegenAt` field exists in Player model | No scheduled task regenerating energy (Sprint 6 scope, but energy *deduction* exists) |

### 1.3 What Is Completely Missing

| Component | Description | Priority |
|-----------|-------------|----------|
| **Campaign Map UI** | No `apps/client/src/app/features/campaign/` directory exists at all | P0 -- Core Sprint 5 deliverable |
| **Campaign route** | No `/campaign` route in `app.routes.ts` | P0 |
| **Campaign API service (client)** | No frontend service to call `GET /campaign/stages` | P0 |
| **Stage detail / pre-battle screen** | No UI to view a stage's enemies, rewards, energy cost before entering battle | P1 |
| **Campaign progress display** | No stars-per-stage or chapter completion visualization | P0 |
| **Hero shard reward granting** | `heroShards` in StageRewards is never processed server-side | P1 |
| **Hero shard data model** | No `PlayerHeroShard` table or model for tracking shard accumulation | P1 |
| **Best time tracking** | `bestTimeMs` field in CampaignProgress is never updated by `completeBattle` | P2 |
| **Energy display in campaign map** | Player needs to see current energy and cost before starting a stage | P0 |
| **Auto-replay / sweep** | Architecture doc mentions "3 missions each" per stage but no sweep/auto mechanic | P3 (out of MVP scope) |
| **Reward animation on campaign map** | After battle, returning to campaign should show newly earned stars | P2 |
| **Chapter completion tracking** | No mechanism to aggregate per-chapter completion percentage | P2 |

---

## 2. Architectural Decisions

### Decision 1: Hero Shard System
**Decision:** Create a `player_hero_shards` table to track shard accumulation separately from `player_heroes`. Players collect shards from stage rewards and later (Phase 2) from gacha. When enough shards are collected, they can unlock a new hero. For Sprint 5, we implement the shard accumulation and display only -- hero unlocking via shards is Phase 2.

**Rationale:** Keeping shards separate from player heroes is cleaner because a player can accumulate shards for heroes they don't yet own. This also matches typical mobile RPG patterns.

### Decision 2: Campaign Map Architecture
**Decision:** The campaign map will be a standalone Angular component (not Phaser). Chapters are displayed as a scrollable vertical list, with stages as connected nodes within each chapter.

**Rationale:** The campaign map is primarily a UI/navigation screen, not a game scene. Using Angular gives us standard routing, accessibility, and simpler state management. Phaser is reserved for battle visualization only.

### Decision 3: Stage Pre-Battle Screen
**Decision:** Clicking a stage on the campaign map opens an inline modal/panel (not a separate route) showing enemy lineup, rewards, energy cost, and a "Start Battle" button.

**Rationale:** Avoids extra route navigation and keeps the user in context. The component can be a child of the campaign map component.

### Decision 4: Campaign State Refresh
**Decision:** After returning from battle, the campaign map component will re-fetch `GET /campaign/stages` to reflect updated progress (new stars, newly unlocked stages).

**Rationale:** Simple and reliable. The campaign endpoint is lightweight (reads from DB + static data). No complex client-side state management needed.

### Decision 5: bestTimeMs Tracking
**Decision:** Track `bestTimeMs` from the client-submitted `durationMs` in the completeBattle flow. Only update if the new time is better (lower) than the existing best.

**Rationale:** Adds minimal complexity, enables future "speedrun" leaderboards, and the data is already available.

---

## 3. Implementation Tasks (Dependency Order)

### Task 1: Add Hero Shard Model (Backend)
**Files to create/modify:**
- `apps/api/prisma/schema.prisma` -- Add `PlayerHeroShard` model

**Implementation:**
```
model PlayerHeroShard {
  playerId   String @map("player_id")
  templateId String @map("template_id")
  count      Int    @default(0)

  player     Player       @relation(fields: [playerId], references: [id], onDelete: Cascade)
  template   HeroTemplate @relation(fields: [templateId], references: [id])

  @@id([playerId, templateId])
  @@map("player_hero_shards")
}
```
- Add `heroShards PlayerHeroShard[]` relation to `Player` model
- Add `shards PlayerHeroShard[]` relation to `HeroTemplate` model
- Run `npx prisma migrate dev --name add-hero-shards`

**Patterns to follow:** Matches existing composite PK pattern used by `CampaignProgress` and `DailyQuest`.

---

### Task 2: Grant Hero Shards in Battle Completion (Backend)
**Files to modify:**
- `apps/api/src/battles/battles.service.ts`

**Implementation:**
Inside the `$transaction` block in `completeBattle`, after the campaign progress upsert (line ~337), add:

```typescript
// Grant hero shards if stage has shard rewards
if (stage?.rewards.heroShards) {
  const { templateId, count } = stage.rewards.heroShards;
  await tx.playerHeroShard.upsert({
    where: {
      playerId_templateId: { playerId, templateId },
    },
    create: { playerId, templateId, count },
    update: { count: { increment: count } },
  });
}
```

**Edge cases:**
- Shards are only granted on first completion of a stage (when starsEarned > 0 and this is a new completion). To prevent farming: check if the player already had stars for this stage before the battle. If `progressRecords` shows existing stars > 0, skip shard granting.
- Decision: For MVP, allow shard farming on replay. This matches typical mobile RPG design. The energy cost serves as the natural limiter.

---

### Task 3: Track bestTimeMs in Battle Completion (Backend)
**Files to modify:**
- `apps/api/src/battles/battles.service.ts`

**Implementation:**
In the campaign progress upsert within `completeBattle`, modify the update clause:

```typescript
await tx.campaignProgress.upsert({
  where: {
    playerId_stageId: { playerId, stageId: battle.stageId },
  },
  create: {
    playerId,
    stageId: battle.stageId,
    stars: starsEarned,
    bestTimeMs: clientLog.durationMs,
  },
  update: {
    stars: { set: Math.max(existingStars, starsEarned) },
    bestTimeMs: existingBestTime
      ? Math.min(existingBestTime, clientLog.durationMs)
      : clientLog.durationMs,
    completedAt: new Date(),
  },
});
```

Note: Need to load existing progress before the upsert to compare stars/time. Add a `findUnique` before the upsert.

**Bug fix included:** Currently stars are set unconditionally (`{ set: starsEarned }`), which means replaying a stage with fewer surviving heroes can **downgrade** the star rating. Fix: use `Math.max(existingStars, starsEarned)`.

---

### Task 4: Add Shared Types for Campaign Map (Shared Lib)
**Files to modify:**
- `libs/shared/src/models/campaign.ts`

**Implementation:**
Add response interfaces for the frontend:

```typescript
export interface CampaignStageResponse extends CampaignStage {
  stars: number;        // 0-3, player's best
  completed: boolean;   // stars > 0
  unlocked: boolean;    // previous stage completed
}

export interface CampaignMapResponse {
  stages: CampaignStageResponse[];
  currentEnergy: number;
  maxEnergy: number;
}

export interface HeroShardProgress {
  templateId: string;
  templateName: string;
  count: number;
  requiredToUnlock: number;
}
```

**Patterns to follow:** Matches existing `PlayerHeroResponse`, `TeamResponse` naming conventions.

---

### Task 5: Enhance Campaign API Response (Backend)
**Files to modify:**
- `apps/api/src/campaign/campaign.service.ts`
- `apps/api/src/campaign/campaign.controller.ts`

**Implementation:**

In `CampaignService.getStages()`:
- Include player's current energy and maxEnergy in the response
- Group stages by chapter for easier frontend consumption (optional, can be done client-side)

In `CampaignController`:
- The existing endpoints are sufficient. The `getStages` method already returns all needed data. Just need to ensure the response shape matches `CampaignStageResponse`.

---

### Task 6: Create Campaign Service (Frontend)
**Files to create:**
- `apps/client/src/app/core/services/campaign.service.ts`

**Implementation:**
```typescript
@Injectable({ providedIn: 'root' })
export class CampaignService {
  readonly stages = signal<CampaignStageResponse[]>([]);
  readonly loading = signal(false);

  constructor(private api: ApiService) {}

  loadStages(): Observable<CampaignStageResponse[]> {
    this.loading.set(true);
    return this.api.get<CampaignStageResponse[]>('/campaign/stages').pipe(
      tap((stages) => {
        this.stages.set(stages);
        this.loading.set(false);
      }),
    );
  }
}
```

**Patterns to follow:** Matches `HeroesService` pattern -- signal-based state, `ApiService` for HTTP, `tap` to update local state.

---

### Task 7: Create Campaign Map Component (Frontend)
**Files to create:**
- `apps/client/src/app/features/campaign/campaign-map.component.ts`

**Implementation:**

Structure:
- Standalone component with `CommonModule`, `RouterLink`
- Header: shows current energy, back-to-lobby button
- Chapter list: scrollable vertical list of chapters (1-10)
- Each chapter: title bar + 3 stage nodes connected by a line/path
- Each stage node: shows stage name, star rating (0-3 gold/grey stars), lock icon if locked
- Clicking an unlocked stage opens the stage detail panel

Signals:
- `stages` -- from CampaignService
- `selectedStage` -- currently selected stage for detail view
- `groupedByChapter` -- computed signal grouping stages into chapters

Layout (CSS Grid / Flexbox):
- Dark theme matching existing lobby/battle styling
- Chapter cards stacked vertically
- Stage nodes within each chapter laid out horizontally (3 nodes, connected by lines)
- Stars rendered as unicode characters or CSS-styled spans
- Locked stages: greyed out, lock icon overlay
- Completed stages: colored border indicating star count

**Key interactions:**
1. On `ngOnInit`, call `campaignService.loadStages()`
2. Clicking unlocked stage -> set `selectedStage` signal
3. Selected stage panel shows: name, difficulty, enemy count, energy cost, rewards list, best time, "Start Battle" button
4. "Start Battle" -> navigate to `/battle/:stageId`
5. Back button -> navigate to `/lobby`

**Edge cases:**
- If player has 0 energy, "Start Battle" should be disabled with "Not enough energy" message
- If player has no team, show warning to set up team first

---

### Task 8: Create Stage Detail Panel Component (Frontend)
**Files to create:**
- `apps/client/src/app/features/campaign/stage-detail-panel.component.ts`

**Implementation:**

This is a child component of the campaign map, displayed as an overlay/side panel when a stage is selected.

Inputs:
- `stage: CampaignStageResponse` -- the selected stage
- `currentEnergy: number` -- player's current energy

Outputs:
- `startBattle: EventEmitter<string>` -- emits stage ID
- `close: EventEmitter<void>`

Display:
- Stage name and chapter
- Difficulty indicator (numeric or visual bars)
- Energy cost with comparison to current energy
- Enemy lineup: count and level range (e.g., "3 enemies, Lv.10-14")
- Rewards: gold, XP, hero shards (if applicable)
- Star rating (current best)
- Best time (if completed)
- "Start Battle" button (disabled if insufficient energy or no team)

---

### Task 9: Add Campaign Route (Frontend)
**Files to modify:**
- `apps/client/src/app/app.routes.ts`

**Implementation:**
Add route before the battle route:

```typescript
{
  path: 'campaign',
  loadComponent: () =>
    import('./features/campaign/campaign-map.component').then(
      (m) => m.CampaignMapComponent,
    ),
  canActivate: [authGuard],
},
```

---

### Task 10: Update Lobby Component (Frontend)
**Files to modify:**
- `apps/client/src/app/features/lobby/lobby.component.ts`

**Implementation:**
Change the Campaign card from disabled to active:

```html
<!-- Before -->
<div class="menu-card disabled">
  <h3>Campaign</h3>
  <p>Coming in Sprint 2</p>
</div>

<!-- After -->
<div class="menu-card" routerLink="/campaign">
  <h3>Campaign</h3>
  <p>Conquer the world stage by stage</p>
</div>
```

---

### Task 11: Navigate to Campaign Map After Battle (Frontend)
**Files to modify:**
- `apps/client/src/app/features/battle/scenes/ResultScene.ts`

**Implementation:**
The "CONTINUE" button currently navigates to `/lobby`. When the battle was for a campaign stage, it should navigate to `/campaign` instead.

Approach: The BattleEventBus already carries battle data. Pass the stageId through the event bus. In ResultScene, check if a stageId exists in the battle data. If so, navigate to `campaign` instead of `lobby`.

Modify `BattleEventBus`:
- Add `stageId: string | null` to `BattleData` interface

Modify `BattleComponent`:
- Pass `stageId` to EventBus when setting battle data

Modify `ResultScene.showContinueButton`:
- Check `eventBus.getBattleData().stageId` and navigate accordingly

---

### Task 12: Add Hero Shard Display to Stage Detail (Frontend)
**Files to modify:**
- `apps/client/src/app/features/campaign/stage-detail-panel.component.ts`

**Implementation:**
For stages that have `heroShards` in their rewards, display the hero name and shard count. Use the hero templates loaded from `HeroesService.loadTemplates()` to resolve the template name from the ID.

---

### Task 13: Add Campaign Progress to Player Profile (Frontend)
**Files to modify:**
- `apps/client/src/app/features/lobby/lobby.component.ts` (or profile component if it exists)

**Implementation:**
Show campaign completion percentage in the lobby header or player info section:
- Total stages: 30
- Completed stages: count of stages with stars > 0
- Display: "Campaign: X/30"

This is a lightweight addition -- fetch stage data from CampaignService.

---

## 4. Edge Cases and Validation Rules

### 4.1 Energy Validation
- **Server-side (already implemented):** Energy is checked and deducted atomically in `startBattle` before creating the battle record.
- **Client-side (to add):** The "Start Battle" button must check `player.energy >= stage.energyCost` and disable if insufficient.
- **Race condition:** Two simultaneous battle starts could both pass the energy check. The Redis battle lock (`battle:lock:{playerId}`) prevents this -- second request fails with "A battle is already in progress".
- **Energy refund on failure:** If battle creation fails after energy deduction (e.g., template not found), energy is NOT refunded. This is acceptable for MVP since the error conditions are programming errors, not user-facing scenarios. For production, wrap the full startBattle in a transaction.

### 4.2 Stage Unlocking Rules
- Stage `1-1` is always unlocked.
- All other stages require the immediately previous stage to have `stars > 0`.
- Progression is strictly linear: `1-1 -> 1-2 -> 1-3 -> 2-1 -> 2-2 -> ...`
- **Both server and client** enforce this (server in `validateStageUnlocked`, client disables locked stages).
- **Validated in two places:** `CampaignService.isStageUnlocked` (for display) and `BattlesService.validateStageUnlocked` (for enforcement). Both use identical logic.

### 4.3 Star Rating Calculation
- 3 stars: 100% of player heroes survived (`victoryStar3Threshold: 1.0`)
- 2 stars: 50%+ survived (`victoryStar2Threshold: 0.5`)
- 1 star: Any victory with < 50% survival
- **Bug to fix:** Current implementation overwrites existing stars unconditionally. Must use `Math.max(existingStars, starsEarned)` to preserve best rating.

### 4.4 Reward Calculation
- Gold and XP come from `CampaignStage.rewards` (static, per-stage).
- Hero XP is flat per battle: `GAME_CONFIG.rewards.heroXpPerBattle` (25).
- Hero shards come from `CampaignStage.rewards.heroShards` (some stages only).
- All rewards are granted only on validated victory.
- Rewards are granted on every completion (not just first) -- energy cost is the farming limiter.

### 4.5 Concurrent Access
- **Battle lock:** Redis key `battle:lock:{playerId}` with TTL prevents concurrent battles.
- **Seed storage:** Redis key `battle:seed:{battleId}` with TTL prevents replay attacks.
- **Campaign progress:** Prisma upsert with composite PK (`playerId_stageId`) prevents duplicate rows.
- **Transaction isolation:** `prisma.$transaction` ensures atomic reward granting.
- **No race condition on energy:** The battle lock prevents a player from starting two battles simultaneously, which would bypass energy validation.

### 4.6 Battle Validation Failure
- If server simulation result differs from client log, `validated = false`.
- No rewards are granted. Battle is recorded with mismatch details for audit.
- Energy is NOT refunded (anti-cheat: prevents intentional mismatch to get free retries).
- Client sees the validation result and can display appropriate messaging.

---

## 5. Task Dependency Graph

```
Task 1 (Hero Shard Model)
  |
  v
Task 2 (Grant Shards in BattleService)     Task 3 (bestTimeMs tracking)
  |                                            |
  v                                            v
Task 4 (Shared Types) <-----------------------+
  |
  v
Task 5 (Enhance Campaign API)
  |
  v
Task 6 (Campaign Frontend Service)
  |
  +---> Task 7 (Campaign Map Component)
  |       |
  |       +---> Task 8 (Stage Detail Panel)
  |       |       |
  |       |       v
  |       |     Task 12 (Hero Shard Display)
  |       |
  |       v
  |     Task 9 (Campaign Route)
  |       |
  |       v
  |     Task 10 (Update Lobby)
  |       |
  |       v
  |     Task 11 (Navigate After Battle)
  |
  v
Task 13 (Campaign Progress in Profile)
```

**Critical path:** Tasks 1 -> 4 -> 5 -> 6 -> 7 -> 9 -> 10

**Parallelizable:**
- Tasks 2 and 3 can be done in parallel (both modify `battles.service.ts` but different sections)
- Tasks 8 and 9 can be done in parallel
- Task 12 depends on Task 8 and Task 1
- Task 13 can be done anytime after Task 6

---

## 6. Files Summary

### Files to Create
| File | Description |
|------|-------------|
| `apps/client/src/app/features/campaign/campaign-map.component.ts` | Campaign map UI with chapter/stage layout |
| `apps/client/src/app/features/campaign/stage-detail-panel.component.ts` | Stage info overlay with start battle button |
| `apps/client/src/app/core/services/campaign.service.ts` | Frontend service for campaign API calls |

### Files to Modify
| File | Changes |
|------|---------|
| `apps/api/prisma/schema.prisma` | Add `PlayerHeroShard` model, update relations |
| `apps/api/src/battles/battles.service.ts` | Grant hero shards, track bestTimeMs, fix star downgrade bug |
| `apps/api/src/campaign/campaign.service.ts` | Include energy in response (minor) |
| `libs/shared/src/models/campaign.ts` | Add `CampaignStageResponse`, `CampaignMapResponse`, `HeroShardProgress` types |
| `apps/client/src/app/app.routes.ts` | Add `/campaign` route |
| `apps/client/src/app/features/lobby/lobby.component.ts` | Enable campaign card with routerLink |
| `apps/client/src/app/features/battle/scenes/ResultScene.ts` | Navigate to campaign after campaign battles |
| `apps/client/src/app/features/battle/services/battle-event-bus.ts` | Add stageId to BattleData |
| `apps/client/src/app/features/battle/battle.component.ts` | Pass stageId to EventBus |

### Files Unchanged
| File | Reason |
|------|--------|
| `libs/shared/src/constants/campaign-stages.ts` | All 30 stages are fully defined |
| `libs/shared/src/constants/game-config.ts` | Config values are complete |
| `libs/battle-engine/src/*` | Battle engine is complete and working |
| `apps/api/src/campaign/campaign.module.ts` | Module setup is correct |
| All existing Phaser battle scenes/objects | No changes needed for campaign |

---

## 7. Known Bugs to Fix in This Sprint

### Bug 1: Star Rating Downgrade on Replay
**Location:** `apps/api/src/battles/battles.service.ts:334`
**Issue:** `stars: { set: starsEarned }` unconditionally sets stars, meaning replaying a stage with fewer survivors downgrades the rating.
**Fix:** Load existing progress first and use `Math.max(existingStars, starsEarned)`.

### Bug 2: Hero Shards Not Granted
**Location:** `apps/api/src/battles/battles.service.ts` (reward section)
**Issue:** `StageRewards.heroShards` is defined in stage data but never processed in the reward granting transaction.
**Fix:** Add hero shard upsert logic (Task 2).

### Bug 3: bestTimeMs Never Updated
**Location:** `apps/api/src/battles/battles.service.ts` (campaign progress upsert)
**Issue:** `bestTimeMs` defaults to 0 and is never updated with actual battle duration.
**Fix:** Set `bestTimeMs` on create and update with `Math.min` logic (Task 3).
