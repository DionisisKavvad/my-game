# Sprint 3 -- Battle Engine Implementation Plan

**Target:** Weeks 5-6 | **Status:** Planning | **Owner:** Development Team

---

## 1. Current State Assessment

### What Exists (Sprint 1-2 Output)

| Component | File | Status |
|-----------|------|--------|
| Seeded RNG (Mulberry32) | `libs/battle-engine/src/rng.ts` | Complete -- deterministic, well-tested |
| Damage calculation | `libs/battle-engine/src/damage.ts` | Complete -- base formula with crit/dodge/variance |
| Battle simulator skeleton | `libs/battle-engine/src/simulator.ts` | Partial -- auto-attack only, no skills/effects |
| Shared battle types | `libs/shared/src/models/battle.ts` | Complete -- BattleHero, TurnAction, BattleLog, StatusEffect, BattleSkill |
| Shared hero types | `libs/shared/src/models/hero.ts` | Complete -- HeroTemplate, HeroSkill, SkillEffect, calculateHeroStats |
| Campaign types | `libs/shared/src/models/campaign.ts` | Complete -- CampaignStage, CampaignEnemy, StageRewards |
| Game config | `libs/shared/src/constants/game-config.ts` | Complete -- battle constants (maxTurns, crit/dodge rates, etc.) |
| API: Start battle | `apps/api/src/battles/battles.service.ts` | Complete -- seed generation, Redis lock, energy check |
| API: Complete battle | `apps/api/src/battles/battles.service.ts` | Stub -- accepts client log, no server re-simulation |
| Hero templates (seed) | `apps/api/prisma/seed.ts` | Complete -- 5 heroes with skills defined |
| Prisma schema | `apps/api/prisma/schema.prisma` | Complete -- Battle model, CampaignProgress model |
| RNG tests | `libs/battle-engine/src/rng.spec.ts` | Complete -- determinism, range, shuffle |
| Simulator tests | `libs/battle-engine/src/simulator.spec.ts` | Partial -- determinism, speed tie-breaking |

### What Needs to Be Built (Sprint 3 Scope)

1. **Skill system** -- The simulator only does auto-attacks. Skills (Fireball, Heal, Shield, etc.) are defined in templates but never executed.
2. **Status effect system** -- Buffs, debuffs, DoT, shields, heals are typed but not processed during battle.
3. **Cooldown management** -- BattleSkill has `cooldown`/`currentCooldown` fields but no logic decrements or checks them.
4. **Enemy AI** -- `libs/battle-engine/src/ai.ts` is referenced in the architecture doc but does not exist.
5. **Server-side re-simulation** -- `completeBattle()` has a TODO comment; it accepts client results without validation.
6. **Hero-to-BattleHero conversion** -- No function converts PlayerHero + HeroTemplate into a BattleHero for the simulator.
7. **Campaign stage definitions** -- CampaignStage interface exists but no stage data is seeded or served.
8. **Reward calculation** -- Currently hardcoded; needs to come from stage definitions.
9. **Campaign progress tracking** -- CampaignProgress Prisma model exists but is never written to.
10. **Damage formula refinement** -- Defense scaling, skill-specific modifiers, AoE damage reduction.

---

## 2. Task Breakdown

### Task 2.1: Hero-to-BattleHero Conversion Utility
**File:** `libs/battle-engine/src/hero-converter.ts`
**Dependencies:** None
**Effort:** S (2-3 hours)

Create a pure function that converts a PlayerHero (with its HeroTemplate) into a BattleHero suitable for the simulator.

```typescript
export function playerHeroToBattleHero(
  playerHero: PlayerHero,
  team: 'player' | 'enemy',
): BattleHero;

export function campaignEnemyToBattleHero(
  enemy: CampaignEnemy,
  template: HeroTemplate,
  team: 'enemy',
): BattleHero;
```

Key details:
- Use `calculateHeroStats(template, level, stars)` from shared to compute stats.
- Map `HeroSkill[]` from template to `BattleSkill[]` (setting `currentCooldown: 0` initially).
- Set `currentHp = stats.hp`, `statusEffects = []`, `position` from team position or index.
- This function must be usable on both client and server (no DB or framework imports).

### Task 2.2: Skill Execution System
**File:** `libs/battle-engine/src/skills.ts`
**Dependencies:** Task 2.1
**Effort:** M (4-6 hours)

Implement skill resolution for all target types defined in the shared types:

```typescript
export interface SkillExecutionResult {
  targets: string[];
  damage: number;
  healing: number;
  effects: StatusEffect[];
}

export function executeSkill(
  actor: BattleHero,
  skill: BattleSkill,
  allHeroes: BattleHero[],
  rng: SeededRandom,
): SkillExecutionResult;
```

Skill targeting logic:
- **single**: Pick the most appropriate enemy target (lowest HP for damage, lowest HP ally for heals).
- **all**: Apply to all enemies (damage) or all allies (buff/heal). AoE damage gets a 0.7x multiplier to balance.
- **self**: Apply buff/shield to the caster.
- **ally**: Pick the ally with the lowest HP ratio for heals, or lowest defense for shields.

Skill damage formula:
- `skillDamage` field in HeroSkill is a percentage multiplier on the base attack (e.g., 150 = 150% of attack).
- Pass this into the existing `calculateDamage()` function via the `skillDamage` parameter.

Healing formula:
- For heal effects: `healAmount = Math.floor(actor.stats.attack * (effect.value / 100))`.
- Clamp to `maxHp`.

Shield formula:
- For shield effects: `shieldAmount = Math.floor(actor.stats.attack * (effect.value / 100))`.
- Shields are tracked as a StatusEffect with type 'shield' and value = remaining shield HP.

### Task 2.3: Status Effect System
**File:** `libs/battle-engine/src/effects.ts`
**Dependencies:** None (used by Task 2.2 and Task 2.4)
**Effort:** M (4-6 hours)

Implement application, tick processing, and removal of status effects:

```typescript
export function applyEffect(hero: BattleHero, effect: StatusEffect): void;
export function processEffects(hero: BattleHero, phase: 'turn-start' | 'turn-end'): EffectTickResult[];
export function removeExpiredEffects(hero: BattleHero): void;
export function getEffectiveStats(hero: BattleHero): HeroStats;
```

Effect types and behavior:

| Type | When Applied | Per-Turn Behavior | Stat Impact |
|------|-------------|-------------------|-------------|
| `buff` | Immediate | Decrement `remainingTurns` at turn end | +value% to `stat` field |
| `debuff` | Immediate | Decrement `remainingTurns` at turn end | -value% to `stat` field |
| `dot` | Immediate | Deal `value` damage at turn start | None |
| `heal` | Immediate heal | None (instant effect) | None |
| `shield` | Add shield HP | Absorb damage, decrement `remainingTurns` at turn end | None |

`getEffectiveStats()` calculates a hero's stats after all active buffs/debuffs. The simulator must use this when calculating damage rather than raw `hero.stats`.

Shield absorption:
- When a hero with an active shield takes damage, reduce shield value first.
- If shield value drops to 0, remove the effect and apply remaining damage to HP.

### Task 2.4: Simulator Loop Rewrite
**File:** `libs/battle-engine/src/simulator.ts` (modify existing)
**Dependencies:** Tasks 2.1, 2.2, 2.3
**Effort:** L (6-8 hours)

Rewrite the `run()` method to support the full battle loop:

```
For each turn (1..maxTurns):
  1. Sort alive heroes by effective speed (desc), tiebreak by id (asc)
  2. For each hero in turn order:
     a. Skip if dead
     b. Process turn-start effects (DoT damage, etc.)
     c. Check if hero died from DoT -- if so, skip action
     d. Decide action: AI chooses for enemies; for player heroes, use priority logic
     e. If a skill is off cooldown and conditions are met, use it; otherwise auto-attack
     f. Execute the action (skill or auto-attack)
     g. Apply results: damage, healing, status effects
     h. Record TurnAction with full resultHp snapshot
     i. Decrement all cooldowns for this hero
     j. Process turn-end effects (buff/debuff duration ticks)
     k. Remove expired effects
     l. Check battle end condition
  3. If all enemies dead -> victory
  4. If all players dead -> defeat
  5. If maxTurns reached -> timeout (counts as defeat)
```

Changes to existing code:
- Replace `executeAutoAttack()` with a general `executeAction()` that handles both auto-attacks and skills.
- Replace `selectTarget()` with AI-driven target selection (see Task 2.5).
- Add per-hero cooldown tracking and decrement.
- Use `getEffectiveStats()` for all stat reads.
- Ensure every RNG call is made in a deterministic, predictable order regardless of branching.

**Critical determinism requirement:** The order of RNG calls must be identical on client and server. This means:
- Always consume RNG values in the same order, even if a result is unused.
- Do not short-circuit RNG consumption based on conditional logic that could diverge.

### Task 2.5: Enemy AI Module
**File:** `libs/battle-engine/src/ai.ts` (new file, referenced in architecture doc)
**Dependencies:** Tasks 2.2, 2.3
**Effort:** M (4-6 hours)

Implement deterministic AI decision-making for enemy heroes:

```typescript
export interface AIDecision {
  type: 'auto-attack' | 'skill';
  skillId?: string;
  targetIds: string[];
}

export function decideAction(
  actor: BattleHero,
  allHeroes: BattleHero[],
  rng: SeededRandom,
): AIDecision;
```

AI priority rules (evaluated in order):
1. **Heal check**: If actor is a healer and any ally is below 40% HP, use heal skill (if off cooldown).
2. **Shield/buff check**: If actor has a buff/shield skill and it's off cooldown, and no active buff/shield exists on team, use it.
3. **AoE check**: If 3+ enemies are alive and AoE skill is off cooldown, use AoE.
4. **High-damage skill**: If single-target damage skill is off cooldown, use it on the enemy with the highest attack stat (threat priority).
5. **Auto-attack**: Default fallback. Target the enemy with the lowest current HP.

Target selection for damage:
- Single-target: pick the player hero with the lowest HP (finish off weak targets).
- With a small RNG chance (10%), pick randomly instead (adds unpredictability).

Target selection for heals:
- Pick the ally with the lowest HP ratio (currentHp / stats.hp).

This same logic will also be used for player hero auto-play (player heroes use the same AI when not manually controlled). Since battles are async and not manually controlled in the MVP, both sides use this AI.

### Task 2.6: Campaign Stage Definitions
**File:** `libs/shared/src/constants/campaign-stages.ts` (new)
**Dependencies:** None
**Effort:** M (4-6 hours)

Define the 10 chapters x 3 stages = 30 campaign stages as static data:

```typescript
export const CAMPAIGN_STAGES: CampaignStage[] = [
  {
    id: '1-1',
    chapter: 1,
    stage: 1,
    name: 'Forest Outskirts',
    difficulty: 1,
    energyCost: 6,
    enemyTeam: [
      { templateId: 'warrior_bold', level: 1, stars: 1 },
      { templateId: 'archer_swift', level: 1, stars: 1 },
    ],
    rewards: { gold: 100, xp: 50 },
  },
  // ... 29 more stages with scaling difficulty
];
```

Design principles:
- Chapters 1-3 (stages 1-1 to 3-3): 2 enemies, levels 1-10, 1-star. Entry difficulty.
- Chapters 4-6 (stages 4-1 to 6-3): 3 enemies, levels 10-25, 1-2 stars. Mid difficulty.
- Chapters 7-9 (stages 7-1 to 9-3): 4 enemies, levels 25-45, 2-3 stars. Hard difficulty.
- Chapter 10 (stages 10-1 to 10-3): 5 enemies, levels 45-60, 3-4 stars. Boss chapter.
- Gold and XP rewards scale with difficulty level.
- Hero shard rewards appear on specific stages (every 3rd stage starting from 2-3).

Include a helper function:
```typescript
export function getStage(stageId: string): CampaignStage | undefined;
```

### Task 2.7: Server-Side Battle Re-Simulation and Validation
**File:** `apps/api/src/battles/battles.service.ts` (modify existing)
**Dependencies:** Tasks 2.1, 2.4, 2.5, 2.6
**Effort:** L (6-8 hours)

This is the core anti-cheat mechanism. Replace the TODO in `completeBattle()` with full server-side re-simulation.

**Updated `startBattle()` flow:**
1. Validate energy (existing).
2. Check battle lock (existing).
3. Load the player's team from DB (PlayerHero + HeroTemplate).
4. Load enemy team from campaign stage definition.
5. Convert both teams to BattleHero[] using the converter (Task 2.1).
6. Store the full initial state (both teams as BattleHero[]) in the battle DB record alongside the seed. This ensures the server can reconstruct the exact battle later.
7. Return `{ battleId, seedHash, enemyTeam }` to the client (client needs enemy data for rendering).

**Updated `completeBattle()` flow:**
1. Load battle record from DB (has rng_seed, initial team state, stageId).
2. Reconstruct BattleHero[] for both teams from the stored initial state.
3. Create a new `BattleSimulator` with the stored seed and teams.
4. Run `simulator.run()` to produce the server-side `BattleLog`.
5. Compare server log vs client log:
   - Compare `result` (victory/defeat/timeout) -- must match.
   - Compare `totalTurns` -- must match.
   - Compare each `TurnAction` in order:
     - `actorId`, `skillId`, `targetIds` must match exactly.
     - `damage` and `healing` must match exactly (deterministic).
     - `resultHp` snapshot must match exactly.
6. If all match: set `validated = true`, grant rewards, update campaign progress.
7. If mismatch: set `validated = false`, log the discrepancy, reject rewards, flag account.

**New helper:**
```typescript
function compareBattleLogs(
  serverLog: BattleLog,
  clientLog: BattleLog,
): { valid: boolean; mismatchTurn?: number; reason?: string };
```

**Reward granting (on validation success):**
- Load rewards from the campaign stage definition.
- Grant gold and XP to the player (atomic transaction).
- Grant hero XP to all team members.
- Update CampaignProgress record (upsert with best stars).
- Stars calculation: 3 stars if all heroes survive, 2 stars if > 50% survive, 1 star if victory.

### Task 2.8: Update CompleteBattleDto for Typed Client Log
**File:** `apps/api/src/battles/dto/complete-battle.dto.ts` (modify existing)
**Dependencies:** None
**Effort:** S (1-2 hours)

The current DTO accepts `clientLog` as `Record<string, unknown>`. This should be changed to accept a properly typed `BattleLog`:

```typescript
import { IsString, IsArray, IsNumber, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class CompleteBattleDto {
  @IsString()
  battleId!: string;

  @ValidateNested()
  @Type(() => BattleLogDto)
  clientLog!: BattleLogDto;
}
```

Create a proper `BattleLogDto` class with class-validator decorators matching the `BattleLog` interface. This provides input validation before the comparison logic runs.

### Task 2.9: Campaign API Endpoints
**File:** `apps/api/src/campaign/` (new module)
**Dependencies:** Task 2.6
**Effort:** M (4-6 hours)

Create a CampaignModule with:
- `GET /campaign/stages` -- Returns all stages with player's progress (stars, completion).
- `GET /campaign/stages/:id` -- Returns a single stage with enemy team details.

The controller loads stage definitions from the shared constant and enriches them with the player's CampaignProgress from the database.

Also needs:
- A `CampaignService` that queries CampaignProgress.
- Proper guards and DTOs.
- Validation that a player can only attempt stages they've unlocked (sequential progression: must complete stage N before attempting N+1).

### Task 2.10: Comprehensive Test Suite
**File:** Multiple test files
**Dependencies:** All above tasks
**Effort:** L (6-8 hours)

**Unit tests:**

`libs/battle-engine/src/skills.spec.ts`:
- Skill targeting (single, all, self, ally).
- Damage scaling with skill multiplier.
- Healing clamp to maxHp.
- Shield application and absorption.
- AoE damage reduction.

`libs/battle-engine/src/effects.spec.ts`:
- Buff/debuff stat modification via getEffectiveStats().
- DoT damage at turn start.
- Effect duration countdown and removal.
- Shield damage absorption with overflow.
- Stacking behavior (multiple buffs on same stat).

`libs/battle-engine/src/ai.spec.ts`:
- Healer prioritizes healing low-HP allies.
- AoE used when 3+ enemies alive.
- Fallback to auto-attack when skills on cooldown.
- Deterministic decisions with same seed.

`libs/battle-engine/src/simulator.spec.ts` (extend existing):
- Full battle with skills and effects.
- Determinism: same seed + same teams = identical BattleLog.
- Timeout scenario (maxTurns reached).
- Edge case: hero dies from DoT on their turn.
- Edge case: shield absorbs partial damage.
- Edge case: all heroes same speed (tiebreaker consistency).
- Edge case: single hero vs single hero.
- Edge case: healer keeps team alive for many turns.

`libs/battle-engine/src/hero-converter.spec.ts`:
- Correct stat calculation from template + level + stars.
- Skill mapping with initial cooldowns.
- Campaign enemy conversion.

**Integration tests:**

`apps/api/src/battles/battles.service.spec.ts` (extend):
- Full start -> complete cycle with validation.
- Mismatch detection (tampered client log).
- Reward granting on valid battle.
- Reward rejection on invalid battle.
- Campaign progress update.
- Concurrent battle prevention.

---

## 3. Battle Engine Core Design

### 3.1 Simulator Loop (Pseudocode)

```
function run():
  while currentTurn < MAX_TURNS:
    currentTurn++

    aliveHeroes = heroes.filter(h => h.currentHp > 0)
    sorted = aliveHeroes.sortBy(h => [-getEffectiveStats(h).speed, h.id])

    for hero in sorted:
      if hero.currentHp <= 0: continue

      // Turn-start phase
      dotResults = processEffects(hero, 'turn-start')
      record dotResults as TurnActions
      if hero.currentHp <= 0: continue  // died from DoT

      // Decision phase
      decision = decideAction(hero, heroes, rng)

      // Execution phase
      if decision.type == 'skill':
        result = executeSkill(hero, skill, heroes, rng)
        markSkillOnCooldown(hero, skill)
      else:
        result = executeAutoAttack(hero, target, rng)

      applyResults(result)  // HP changes, effects applied
      record TurnAction

      // Turn-end phase
      processEffects(hero, 'turn-end')  // buff/debuff tick
      decrementCooldowns(hero)
      removeExpiredEffects(hero)

      // Win condition check
      if checkBattleEnd(): return buildLog()

  return buildLog('timeout')
```

### 3.2 Turn Order Resolution

1. Sort all alive heroes by **effective speed** (after buff/debuff modifiers), descending.
2. Ties broken by hero `id` string comparison (ascending / lexicographic). This is deterministic and already implemented.
3. Speed is recalculated each turn (a speed buff mid-battle changes order next turn).

### 3.3 RNG Consumption Order

To guarantee determinism, RNG calls happen in this exact order per hero action:
1. `rng` for dodge check (in `calculateDamage`)
2. `rng` for crit check (in `calculateDamage`)
3. `rng` for damage variance (in `calculateDamage`)
4. `rng` for AI random target selection (10% chance)

If a hero uses a skill with target type `all`, the damage formula runs once per target, consuming RNG values in target-id-sorted order.

### 3.4 Damage Formula (Existing, No Changes Needed)

```
baseDamage = (attackerAttack * skillDamage / 100) - (defenderDefense * 0.5)
baseDamage = max(baseDamage, GAME_CONFIG.battle.minDamage)

if dodged (5% chance): damage = 0
if crit (15% chance): baseDamage *= 1.5

variance = 0.9 + rng.next() * 0.2   // +-10%
finalDamage = max(floor(baseDamage * variance), minDamage)
```

The existing `calculateDamage()` in `damage.ts` already implements this correctly with the seeded RNG. The only change needed is that the caller should pass `getEffectiveStats()` values rather than raw stats.

---

## 4. Enemy AI Design

### 4.1 Decision Tree

```
decideAction(actor, allHeroes, rng):
  allies = allHeroes.filter(alive, same team)
  enemies = allHeroes.filter(alive, opposing team)

  // Priority 1: Healing (healer class)
  if actor has heal skill AND skill off cooldown:
    woundedAlly = allies.find(hp < 40% maxHp)
    if woundedAlly: return { skill: healSkill, targets: [woundedAlly] }

  // Priority 2: Buff/Shield (support)
  if actor has buff/shield skill AND off cooldown:
    unbuffedAlly = allies.find(no active buff/shield)
    if unbuffedAlly: return { skill: buffSkill, targets: [unbuffedAlly] }

  // Priority 3: AoE (3+ enemies)
  if actor has AoE skill AND off cooldown AND enemies.length >= 3:
    return { skill: aoeSkill, targets: enemies }

  // Priority 4: Single-target damage skill
  if actor has damage skill AND off cooldown:
    target = enemies.sortBy(currentHp).first()  // lowest HP
    return { skill: damageSkill, targets: [target] }

  // Priority 5: Auto-attack
  randomTarget = rng.chance(0.1)
    ? rng.pick(enemies)
    : enemies.sortBy(currentHp).first()
  return { type: 'auto-attack', targets: [randomTarget] }
```

### 4.2 Why Both Sides Use AI

In the MVP, battles are asynchronous. The client sends a start request, runs the simulation, and submits the log. There is no manual control per turn. Both player heroes and enemy heroes are controlled by the same AI logic. This:
- Simplifies the engine (one decision function).
- Makes server re-simulation trivial (no player input to replay).
- Sets up for Sprint 4 (Phaser UI) where the client can animate the pre-computed battle.

If manual control is added later (Phase 2 PvP), the AI module remains for enemy-side and auto-play.

---

## 5. Server-Side Validation Flow

### 5.1 Sequence Diagram

```
Client                          Server                        Redis        DB
  |                               |                             |            |
  |-- POST /battles/start ------->|                             |            |
  |                               |-- GET battle:lock:player -->|            |
  |                               |<-- null (no active) -------|            |
  |                               |-- SET battle:lock:player -->|            |
  |                               |-- SET battle:seed:id ------>|            |
  |                               |                             |  INSERT    |
  |                               |------------------------------>  battle   |
  |<-- { battleId, seedHash,      |                             |            |
  |      enemyTeam } -------------|                             |            |
  |                               |                             |            |
  |  [Client runs BattleSimulator |                             |            |
  |   with seed, produces log]    |                             |            |
  |                               |                             |            |
  |-- POST /battles/:id/complete->|                             |            |
  |   { battleId, clientLog }     |-- GET battle:seed:id ------>|            |
  |                               |<-- seed --------------------|            |
  |                               |                             |  SELECT    |
  |                               |<-------------------------------battle   |
  |                               |                             |            |
  |                               |  [Server reconstructs teams |            |
  |                               |   from stored initial state]|            |
  |                               |                             |            |
  |                               |  [Server runs BattleSimulator            |
  |                               |   with same seed + teams]   |            |
  |                               |                             |            |
  |                               |  [Compare server vs client  |            |
  |                               |   turn-by-turn]             |            |
  |                               |                             |            |
  |                               |  IF match:                  |            |
  |                               |    validated = true         |  UPDATE    |
  |                               |    grant rewards ------------>  battle   |
  |                               |    update campaign ---------->  progress |
  |                               |                             |            |
  |                               |  IF mismatch:               |            |
  |                               |    validated = false        |  UPDATE    |
  |                               |    log discrepancy ---------->  battle   |
  |                               |    flag account             |            |
  |                               |                             |            |
  |                               |-- DEL battle:lock:player -->|            |
  |                               |-- DEL battle:seed:id ------>|            |
  |<-- { result, rewards, valid } |                             |            |
```

### 5.2 What Gets Stored in the Battle Record

The `battleLog` JSON column in the `battles` table will store:

```typescript
{
  initialState: {
    playerTeam: BattleHero[],   // snapshot at battle start
    enemyTeam: BattleHero[],    // from campaign stage definition
  },
  clientLog: BattleLog,         // what the client submitted
  serverLog: BattleLog,         // what the server computed
  validated: boolean,
  mismatchDetails?: {
    turn: number,
    field: string,
    expected: unknown,
    received: unknown,
  },
}
```

### 5.3 Handling Edge Cases in Validation

- **Client disconnects before completing**: The Redis battle lock TTL (5 minutes) auto-expires. The battle record stays as `result: 'pending'`. A cleanup job can mark abandoned battles as 'timeout' after TTL expiry.
- **Client submits after TTL**: The seed is gone from Redis. Return 404 "Battle expired."
- **Client submits wrong battleId**: Battle not found or belongs to different player. Return 404.
- **Client submits twice**: The `result !== 'pending'` check prevents double-completion. Return 409.
- **Floating point determinism**: The Mulberry32 RNG uses only integer arithmetic (`Math.imul`, bitwise ops, `>>> 0`). `Math.floor` is deterministic across V8 (Node.js) and browser JS engines. The formulas avoid operations that could produce platform-dependent floating point (no `Math.sin`, `Math.pow` with non-integer exponents in hot paths).

---

## 6. Anti-Cheat Measures

### 6.1 What the Architecture Prevents

| Cheat Vector | Prevention |
|-------------|------------|
| Fake victory result | Server re-runs entire battle and compares turn-by-turn |
| Modified damage values | Deterministic RNG + damage formula produces exact values |
| Skipped enemy turns | Turn order is deterministic; server verifies every turn |
| Extra hero stats | Server loads hero stats from DB, not from client |
| Replay attacks | Battle lock prevents concurrent battles; seed is one-time-use |
| Timing attacks | Server-side seed stored in Redis, client only gets hash |

### 6.2 Account Flagging

When a mismatch is detected:
1. Log the mismatch details (turn number, expected vs received) in the battle record.
2. Increment a `suspicious_count` counter for the player (new Redis key: `suspicious:{playerId}`).
3. If count exceeds threshold (e.g., 3 in 24 hours), flag for manual review.
4. Do not immediately ban -- false positives from client bugs should not punish players.

### 6.3 Seed Hash (Not Seed) to Client

The `startBattle()` endpoint returns a SHA-256 hash of the seed, not the seed itself. The client uses a locally generated seed for its simulation. After completion, the server reveals the actual seed and re-runs. Wait -- this creates a problem: the client needs the real seed to run the deterministic simulation and produce a matching log.

**Correction:** Per the architecture doc, the client DOES need the actual seed to run the same deterministic simulation. The `seedHash` is returned so the client can verify it received the correct seed later. The actual seed must also be provided to the client at battle start. Updating the `startBattle()` return:

```typescript
return {
  battleId,
  seed,        // actual seed for client-side simulation
  seedHash,    // for client-side integrity check
  enemyTeam,   // enemy BattleHero[] for the stage
};
```

The anti-cheat is not about hiding the seed -- it's about the deterministic simulation. Even knowing the seed, the client must run the exact same code to produce a matching log. Any modification to the battle (auto-win, inflated damage) will produce a different log that won't match the server's re-simulation.

---

## 7. Shared Types Alignment

### 7.1 Current Types (No Changes Needed)

The following types in `libs/shared/src/models/` are already well-aligned with what the battle engine needs:
- `BattleHero` -- has `stats`, `currentHp`, `skills`, `team`, `position`, `statusEffects`
- `BattleSkill` -- has `damage`, `cooldown`, `currentCooldown`, `target`
- `StatusEffect` -- has `type`, `value`, `remainingTurns`, `stat`
- `TurnAction` -- has `turn`, `actorId`, `skillId`, `targetIds`, `damage`, `healing`, `effects`, `resultHp`
- `BattleLog` -- has `seed`, `turns`, `result`, `totalTurns`, `durationMs`
- `HeroStats` -- has `hp`, `attack`, `defense`, `speed`

### 7.2 Additions Needed

Add to `libs/shared/src/models/battle.ts`:

```typescript
export interface BattleInitialState {
  playerTeam: BattleHero[];
  enemyTeam: BattleHero[];
}

export interface BattleValidationResult {
  valid: boolean;
  mismatchTurn?: number;
  reason?: string;
}

export interface BattleStartResponse {
  battleId: string;
  seed: number;
  seedHash: string;
  enemyTeam: BattleHero[];
}

export interface BattleCompleteResponse {
  result: BattleResult;
  validated: boolean;
  rewards: {
    gold: number;
    xp: number;
    heroXp: number;
  };
  starsEarned: number;
}
```

Add to `libs/shared/src/constants/game-config.ts`:

```typescript
battle: {
  // existing fields...
  aoeDamageMultiplier: 0.7,
  healerHpThreshold: 0.4,    // AI heals below this %
  aiRandomTargetChance: 0.1, // 10% random target
},

rewards: {
  heroXpPerBattle: 25,
  victoryStar3Threshold: 1.0,  // all heroes alive
  victoryStar2Threshold: 0.5,  // >50% heroes alive
},
```

---

## 8. Testing Strategy

### 8.1 Test Pyramid

```
                /\
               /  \
              / E2E \       (Sprint 7)
             /------\
            /  Integ  \     2-3 integration tests for battles.service
           /----------\
          /    Unit     \   40+ unit tests across engine modules
         /--------------\
```

### 8.2 Key Test Scenarios

**Determinism (Highest Priority):**
- Same seed + same teams = byte-identical BattleLog (already tested, extend to skills).
- Different seeds = different logs.
- Cross-environment: generate a log in a test, serialize to JSON, deserialize, compare. This simulates client-server communication.

**Correctness:**
- A team of 5 heroes vs 5 enemies produces a valid battle log.
- Healer keeps team alive longer than without healer.
- Tank absorbs more damage than squishy heroes (when targeted).
- AoE skill hits all enemies.
- Shield absorbs damage before HP.
- DoT kills a hero between turns.
- Cooldowns prevent skill spam.
- Battle ends in timeout at maxTurns.

**Edge Cases:**
- Single hero vs single hero.
- All heroes have identical stats and speed.
- Hero with 1 HP survives a dodged attack.
- Shield value exactly equals incoming damage.
- Multiple heals on the same target don't exceed maxHp.
- Buff expires on the exact turn it was supposed to.

**Anti-Cheat:**
- Modified client log (changed damage values) is detected.
- Modified client log (swapped actorIds) is detected.
- Client reports victory when server computes defeat.
- Client log has fewer turns than server log.
- Client log has extra turns.

### 8.3 Test Data Fixtures

Create `libs/battle-engine/src/test-utils.ts`:
- `makeHero()` factory (already partially in simulator.spec.ts).
- `makeTeam()` for quick team creation.
- Pre-defined team compositions (all-warrior, balanced, healer-heavy).
- Known seed values that produce specific RNG sequences (documented for debugging).

---

## 9. Implementation Order and Dependencies

```
Phase A (Parallel, No Dependencies):
  [2.1] Hero Converter           ----\
  [2.3] Status Effect System     ----+---> Phase B
  [2.6] Campaign Stages          ----/
  [2.8] Update DTOs              ---------> Phase C

Phase B (Depends on A):
  [2.2] Skill Execution          ----\
  [2.5] Enemy AI                 ----+---> Phase C
                                      |
Phase C (Depends on B):               |
  [2.4] Simulator Loop Rewrite  ------+---> Phase D

Phase D (Depends on C):
  [2.7] Server Validation        ----\
  [2.9] Campaign API             ----+---> Phase E

Phase E (Depends on D):
  [2.10] Comprehensive Tests
```

### Estimated Total Effort

| Task | Effort | Hours |
|------|--------|-------|
| 2.1 Hero Converter | S | 2-3 |
| 2.2 Skill Execution | M | 4-6 |
| 2.3 Status Effect System | M | 4-6 |
| 2.4 Simulator Loop Rewrite | L | 6-8 |
| 2.5 Enemy AI | M | 4-6 |
| 2.6 Campaign Stages | M | 4-6 |
| 2.7 Server Validation | L | 6-8 |
| 2.8 Update DTOs | S | 1-2 |
| 2.9 Campaign API | M | 4-6 |
| 2.10 Comprehensive Tests | L | 6-8 |
| **Total** | | **37-59 hours** |

This fits within the 2-week sprint window (80 working hours) with buffer for code review, debugging, and unforeseen complexity.

---

## 10. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Floating point non-determinism across JS engines | High -- breaks validation | Low -- Mulberry32 uses integer ops | Test with specific seed values; log intermediate RNG values for debugging |
| Status effect stacking creates balance issues | Medium -- gameplay quality | Medium | Cap at 3 active effects per type; tune values after playtesting |
| AI too predictable / too random | Medium -- gameplay feel | Medium | Start simple (priority list), tune randomness factor |
| Campaign difficulty curve too steep/flat | Medium -- player retention | High | Use formula-based scaling, easy to tune via config |
| Large battle logs bloat DB | Low -- storage cost | Medium | Compress logs; consider TTL for old battles; only store validation-relevant fields |
| Performance of server re-simulation | Low -- Lambda cold start | Low | Battle sim is pure computation, < 10ms for 50 turns |

---

## 11. Files Created / Modified Summary

### New Files
- `libs/battle-engine/src/hero-converter.ts`
- `libs/battle-engine/src/skills.ts`
- `libs/battle-engine/src/effects.ts`
- `libs/battle-engine/src/ai.ts`
- `libs/battle-engine/src/test-utils.ts`
- `libs/battle-engine/src/hero-converter.spec.ts`
- `libs/battle-engine/src/skills.spec.ts`
- `libs/battle-engine/src/effects.spec.ts`
- `libs/battle-engine/src/ai.spec.ts`
- `libs/shared/src/constants/campaign-stages.ts`
- `apps/api/src/campaign/campaign.module.ts`
- `apps/api/src/campaign/campaign.controller.ts`
- `apps/api/src/campaign/campaign.service.ts`

### Modified Files
- `libs/battle-engine/src/simulator.ts` -- Full rewrite of run loop
- `libs/battle-engine/src/index.ts` -- Re-export new modules
- `libs/shared/src/models/battle.ts` -- Add BattleInitialState, BattleValidationResult, response types
- `libs/shared/src/constants/game-config.ts` -- Add battle tuning constants, reward config
- `libs/shared/src/index.ts` -- Re-export campaign stages
- `apps/api/src/battles/battles.service.ts` -- Server re-simulation logic
- `apps/api/src/battles/dto/complete-battle.dto.ts` -- Typed BattleLog DTO
- `apps/api/src/battles/battles.service.spec.ts` -- Integration tests
- `libs/battle-engine/src/simulator.spec.ts` -- Extended tests

---

## Expert Review

**Reviewer:** plan-reviewer
**Date:** 2026-02-22
**Verdict:** APPROVED with required changes (5 blockers, 8 recommendations)

This is a thorough, well-structured plan that demonstrates deep understanding of the existing codebase. The current state assessment is accurate, the task breakdown is granular and well-scoped, and the architecture alignment with the monorepo shared-engine approach is solid. The plan correctly identifies every gap between what exists and what Sprint 3 requires. Below are findings organized by category.

---

### BLOCKERS (must fix before implementation)

#### B1. Determinism Bug: RNG Consumption on Dodge Short-Circuits

The existing `calculateDamage()` in `libs/battle-engine/src/damage.ts:27-29` returns early on dodge, consuming only 1 RNG value (the dodge roll). When a hit occurs, it consumes 3 RNG values (dodge roll, crit roll, variance). This means the total number of RNG values consumed varies depending on whether attacks are dodged, which **breaks determinism between different execution paths** if any conditional logic later depends on the same RNG state.

The plan itself warns about this in Section 3.3 ("Always consume RNG values in the same order, even if a result is unused") and Task 2.4 ("Ensure every RNG call is made in a deterministic, predictable order regardless of branching"), but the existing `calculateDamage()` already violates this principle. Since the plan says "No Changes Needed" to the damage formula (Section 3.4), this contradiction needs resolution.

Currently, this does not cause a client/server mismatch because both sides run the identical `calculateDamage()` code and will dodge on the same turns. However, if ANY future change introduces a branch that consumes RNG differently (e.g., a skill that conditionally calls `calculateDamage`), the divergence will be silent and devastating. The plan should proactively fix this now for safety.

**Fix:** Modify `calculateDamage()` to always consume all 3 RNG values regardless of dodge:

```typescript
const isDodged = rng.chance(GAME_CONFIG.battle.dodgeChance);
const isCrit = rng.chance(GAME_CONFIG.battle.critChance);  // always consume
const variance = 0.9 + rng.next() * 0.2;                   // always consume

if (isDodged) {
  return { damage: 0, isCrit: false, isDodged: true };
}
// ... use isCrit and variance below
```

Update Section 3.4 to say "Change Required" and add this to Task 2.4 or create a new small task.

#### B2. `startBattle()` Does Not Return the Seed to the Client

The current `battles.service.ts:87-90` returns only `{ battleId, seedHash }` -- it does NOT return the actual `seed`. The plan identifies this issue in Section 6.3 and even includes a self-correction ("Correction: Per the architecture doc, the client DOES need the actual seed..."), but the corresponding update to `startBattle()` in Task 2.7 is ambiguous. The updated return type in Section 7.2 shows `seed` in `BattleStartResponse`, but Task 2.7's "Updated startBattle() flow" (step 7) says `return { battleId, seedHash, enemyTeam }` -- missing the `seed` field.

**Fix:** Task 2.7 step 7 must explicitly list `seed` in the return value:
```typescript
return { battleId, seed, seedHash, enemyTeam };
```
Ensure this is consistent with the `BattleStartResponse` interface in Section 7.2.

#### B3. `BattleSkill` Interface Missing `effects` Field for Skills with Effects

The existing `BattleSkill` interface in `libs/shared/src/models/battle.ts:14-21` has `damage`, `cooldown`, `currentCooldown`, and `target`, but no `effect` or `effects` field. Meanwhile, `HeroSkill` in `libs/shared/src/models/hero.ts:18-26` has an optional `effect?: SkillEffect` field that defines heal/buff/debuff/dot/shield behavior.

The hero-to-BattleHero converter (Task 2.1) maps `HeroSkill[]` to `BattleSkill[]`, but there is no field on `BattleSkill` to carry the `SkillEffect` data. The skill execution system (Task 2.2) needs to know what effects a skill applies. Without this field, the converter cannot transfer effect information, and skill execution is impossible.

**Fix:** Add an `effects` (or `effect`) field to the `BattleSkill` interface:

```typescript
export interface BattleSkill {
  id: string;
  name: string;
  damage: number;
  cooldown: number;
  currentCooldown: number;
  target: 'single' | 'all' | 'self' | 'ally';
  effect?: SkillEffect;  // <-- add this
}
```

This should be listed as a change in Section 7.1 ("Current Types -- No Changes Needed" is incorrect for `BattleSkill`).

#### B4. `StatusEffect` Interface Missing `sourceId` -- Cannot Distinguish Stacked Effects

The `StatusEffect` interface has `type`, `value`, `remainingTurns`, and optional `stat`. The effects system (Task 2.3) says shields absorb damage and buffs/debuffs stack. However, there is no way to identify WHO applied an effect or which skill created it.

This causes two problems:
1. **Effect stacking ambiguity:** If two different buffs both boost `attack`, `getEffectiveStats()` should apply both. But if the same skill is used twice (shouldn't happen with cooldowns, but edge case), should it refresh or stack? Without a source identifier, you cannot distinguish.
2. **Shield identification:** When a shield absorbs damage and is depleted, the system needs to remove THAT specific shield effect from the `statusEffects` array. With multiple shields from different sources, `type === 'shield'` alone is not sufficient.

**Fix:** Add `id` and optionally `sourceId` to `StatusEffect`:

```typescript
export interface StatusEffect {
  id: string;            // unique identifier for this effect instance
  type: 'heal' | 'buff' | 'debuff' | 'dot' | 'shield';
  value: number;
  remainingTurns: number;
  stat?: keyof HeroStats;
  sourceId?: string;     // actorId who applied it
}
```

The `id` can be generated from `{actorId}-{skillId}-{turnNumber}` to remain deterministic.

#### B5. Energy Deduction Not Implemented in `startBattle()`

The current `battles.service.ts:35-45` CHECKS energy but never DEDUCTS it. If the player has enough energy, the battle starts but energy remains unchanged. This means players can start unlimited battles without ever running out of energy.

The plan's Task 2.7 ("Updated startBattle() flow") does not mention energy deduction either -- it says "Validate energy (existing)" at step 1, but deduction is missing from the flow.

**Fix:** Add energy deduction to `startBattle()` within a transaction:

```typescript
await tx.player.update({
  where: { id: playerId },
  data: { energy: { decrement: GAME_CONFIG.campaign.energyCostPerStage } },
});
```

This should happen atomically with the battle record creation. Add this to Task 2.7's updated flow.

---

### RECOMMENDATIONS (should fix, not blocking)

#### R1. `buff` Effect on `StatusEffect` Lacks `stat` Specification in Seed Data

The tank hero's "Taunt" skill (`apps/api/prisma/seed.ts:136`) and warrior's "Battle Shout" (`seed.ts:28`) both define `effect: { type: 'buff', value: 20, duration: 3 }` without specifying WHICH stat is being buffed. The `StatusEffect` interface has an optional `stat?: keyof HeroStats` field, but the seed data and `SkillEffect` interface (`libs/shared/src/models/hero.ts:28-32`) do not include a `stat` field.

The effects system (Task 2.3) needs to know which stat a buff/debuff modifies. Without it, `getEffectiveStats()` cannot apply the modifier.

**Fix:** Add a `stat` field to the `SkillEffect` interface and update the seed data:

```typescript
export interface SkillEffect {
  type: 'heal' | 'buff' | 'debuff' | 'dot' | 'shield';
  value: number;
  duration: number;
  stat?: keyof HeroStats;  // which stat to modify (for buff/debuff)
}
```

Update seed data: `{ type: 'buff', value: 20, duration: 3, stat: 'attack' }`.

#### R2. Tank "Taunt" Mechanic is Not Actually a Taunt

The tank's skill is called "Taunt" but its effect is `{ type: 'buff', value: 30, duration: 2 }`. The description says "Forces all enemies to attack this hero for 2 turns", but the buff system has no mechanism for forced targeting. It is just a +30% buff with no taunt logic.

Implementing a real taunt mechanic would require:
- A new effect type (e.g., `'taunt'`) or a special flag.
- AI logic to check for active taunts before selecting targets.
- This adds complexity to both the effects system and AI module.

**Fix for MVP:** Rename the skill to "Iron Fortitude" or "Defensive Stance" and change the description to match the actual buff behavior ("Increases defense by 30% for 2 turns"). Add `stat: 'defense'` to the effect. Defer true taunt mechanics to a later sprint.

Alternatively, add a simple taunt check at the beginning of `decideAction()` in the AI module: "if any enemy has an active taunt effect, target that enemy." This is a small addition to Task 2.5 that adds tactical depth.

#### R3. No `team_ids[]` Validation in `StartBattleDto`

The architecture doc (Section 6.2) says the client sends `POST /battles/start { stage_id, team_ids[] }`, but the existing `StartBattleDto` only has `stageId?: string` -- no team validation. The plan's Task 2.7 says "Load the player's team from DB" but does not specify whether the client sends team IDs or the server uses the current saved team.

This matters because:
- If the server uses the saved team, players must visit the team builder before every battle.
- If the client sends team IDs, the server must validate they are owned and within team size limits.

**Fix:** Decide and document the approach. The simpler MVP approach is to use the saved team (what the player set via `PUT /heroes/team`). Add this explicitly to Task 2.7 and add validation that the team is not empty (minimum 1 hero).

#### R4. Campaign Stage Progression Validation Missing From Plan

Task 2.9 mentions "Validation that a player can only attempt stages they've unlocked (sequential progression: must complete stage N before attempting N+1)." But the `startBattle()` flow in Task 2.7 does not include this check.

**Fix:** Add a step in `startBattle()` (Task 2.7) between energy validation and battle creation:
- Load the player's CampaignProgress records.
- Verify the requested stageId is either stage 1-1 or the previous stage has been completed.
- Throw `ForbiddenException` if the stage is locked.

#### R5. Prisma `rngSeed` Column is `Int` (32-bit Signed) but Seed is 32-bit Positive

The Prisma schema has `rngSeed Int` which maps to PostgreSQL `integer` (signed 32-bit: -2,147,483,648 to 2,147,483,647). The seed generation uses `randomInt(1, 2147483647)` which stays within range. However, the Mulberry32 RNG implementation uses `this.state |= 0` and bitwise operations that treat the state as a signed 32-bit integer. After several iterations, `this.state` can become negative due to the `| 0` coercion.

This is fine for determinism (both client and server will produce the same negative values), but storing a potentially negative intermediate state in a DB column that was seeded with a positive value is conceptually clean. No actual bug here, but worth noting that the seed stored in DB is the INITIAL seed, not any intermediate state. The plan should clarify this distinction.

#### R6. `BattleLog.durationMs` is Ambiguous

The current simulator sets `durationMs: 0` (line 109 of simulator.ts). The `BattleLog` interface includes `durationMs` and the plan's Task 2.7 compares it. But what does this field represent?

- If it's wall-clock time of client-side animation, it should NOT be part of the deterministic comparison (Section 5.2 step 5 says compare "each TurnAction" but also "totalTurns must match").
- If it's a computed value from the simulation, it should be deterministic.

The current `completeBattle()` in `battles.service.ts:114` reads `durationMs` from the client log, suggesting it's client-reported wall-clock time. This should NOT be compared during validation since it will always differ between client and server.

**Fix:** Explicitly exclude `durationMs` from the validation comparison in Task 2.7's `compareBattleLogs()` function. Only compare: `result`, `totalTurns`, and the `turns[]` array element-by-element.

#### R7. Missing `BattlesModule` Import of `HeroesModule`

Task 2.7 requires `BattlesService` to load the player's team from the database (including PlayerHero + HeroTemplate data). Currently, `BattlesModule` (`apps/api/src/battles/battles.module.ts`) has no imports. To use `HeroesService.getTeam()` or to directly query `prisma.playerHero`, the module needs access.

Since `PrismaModule` is `@Global()`, direct Prisma queries will work. But if the plan intends to use `HeroesService` (as implied by Sprint 2 providing `HeroesService.getTeam()`), then `BattlesModule` must import `HeroesModule`.

**Fix:** Add to Task 2.7: "Import `HeroesModule` in `BattlesModule`, or use `PrismaService` directly to query player heroes with their templates."

#### R8. No Cleanup Job for Abandoned Battles

Section 5.3 mentions "A cleanup job can mark abandoned battles as 'timeout' after TTL expiry" for client disconnects. But no task in the plan implements this. Abandoned battles with `result: 'pending'` will accumulate in the database indefinitely.

**Fix:** Either:
- Add a small task to implement a scheduled cleanup job (`@Cron`) that finds battles with `result: 'pending'` older than `BATTLE_TTL_SECONDS` and marks them as `'timeout'`. This fits naturally with the existing `@nestjs/schedule` setup mentioned in the architecture doc.
- Or explicitly defer this to Sprint 7 (polish) with a note.

---

### ARCHITECTURE ALIGNMENT

The plan aligns well with the architecture doc (Section 3, 7, 11):
- Shared `libs/battle-engine/` library used by both client and server -- correct.
- Deterministic RNG (Mulberry32) for server validation -- correct.
- Redis lock for concurrent battle prevention -- correct.
- Turn-by-turn comparison for anti-cheat -- correct.

Minor deviations (all acceptable):
- Architecture doc shows `Map<string, number>` for cooldowns in `BattleHero`; actual implementation uses `BattleSkill.currentCooldown` per-skill -- this is cleaner and correct.
- Architecture doc mentions `damage.ts` and `ai.ts` as separate files in `libs/battle-engine/`; plan correctly identifies `ai.ts` doesn't exist yet and creates it.

### DETERMINISM ASSESSMENT

Determinism is the highest-risk area. The plan handles it well overall:
- Mulberry32 uses integer-only arithmetic -- no floating-point platform divergence risk.
- `Math.floor` is deterministic across V8 and SpiderMonkey for IEEE 754 doubles.
- The damage formula uses only multiplication, division, subtraction with `Math.floor` -- safe.

**Remaining risks:**
1. `Array.prototype.sort` stability: The plan sorts heroes by speed with id tiebreaker. Modern JS engines (V8 since Node 12, SpiderMonkey) use stable sort (TimSort). But the plan should note this assumption explicitly.
2. The `calculateHeroStats` function uses `Math.floor(base * levelMult * starMult)`. Floating-point multiplication of three factors can produce different results depending on evaluation order. Since JavaScript evaluates left-to-right, this is deterministic, but worth a comment in the code.

### TESTING ASSESSMENT

The test plan is comprehensive. Key strengths:
- Determinism is the first test priority -- correct.
- Cross-environment serialization test (JSON round-trip) simulates real client-server communication.
- Anti-cheat tests verify mismatch detection.

**Gaps:**
- No performance/stress test for the simulator. The plan claims "<10ms for 50 turns" but this should be verified with a benchmark test, especially with 5v5 heroes, all using skills, effects stacking, etc.
- No test for the `calculateHeroStats` function with extreme values (level 100, stars 7). The multipliers produce `10.9 * 1.9 = 20.71x` base stats. Ensure damage formula doesn't overflow with these values.
- The plan mentions "Cross-environment" testing (Section 8.2) but there's no mechanism to actually run the simulator in a browser environment during CI. Consider adding a note about this being a manual verification step.

### ANTI-CHEAT ASSESSMENT

The anti-cheat design is solid for MVP:
- Server re-simulation prevents fake victories and modified damage.
- Battle lock prevents concurrent battles.
- One-time seed prevents replay attacks.
- Account flagging with threshold prevents over-punishment for client bugs.

**Gaps:**
- No rate limiting on `POST /battles/complete`. A malicious client could spam completion requests for the same battle. The `result !== 'pending'` check handles duplicate completion, but the requests still hit the DB. Consider a Redis-based rate limit.
- The `seedHash` returned to the client (SHA-256 of seed) is returned alongside the actual seed. This makes the hash redundant -- if the client has the seed, it can compute the hash itself. The hash adds no security value. Consider removing it to simplify the API, or use it for a different purpose (e.g., the client sends the hash back during completion as proof it used the correct seed).

### TASK ORDERING ASSESSMENT

The dependency graph in Section 9 is well-structured. Observations:
- Phase A (parallel: converter, effects, stages, DTOs) is correctly identified as having no dependencies.
- Phase B (skills, AI depend on effects) is correct.
- Phase C (simulator depends on everything) is correct.
- Phase D and E are sequential.

**Suggestion:** Task 2.8 (Update DTOs) has no dependencies and takes 1-2 hours. It could be done in Phase A alongside the other small tasks, which the plan already shows. This is correct.

**Critical path:** A -> B -> C -> D -> E, estimated at ~28-40 hours. This leaves 40-52 hours of buffer in the 2-week sprint, which is appropriate for code review, debugging, and the integration complexity of wiring the server validation.

---

### SUMMARY TABLE

| # | Type | Issue | Section |
|---|------|-------|---------|
| B1 | BLOCKER | RNG consumption inconsistency on dodge in `calculateDamage()` | 3.3, 3.4 |
| B2 | BLOCKER | `startBattle()` return value missing `seed` field in Task 2.7 | 2.7, 6.3, 7.2 |
| B3 | BLOCKER | `BattleSkill` interface missing `effect` field for skill effects | 2.1, 2.2, 7.1 |
| B4 | BLOCKER | `StatusEffect` needs `id` field for stacking/shield disambiguation | 2.3 |
| B5 | BLOCKER | Energy deduction missing from `startBattle()` flow | 2.7 |
| R1 | RECOMMENDATION | `SkillEffect` and seed data missing `stat` field for buffs/debuffs | 2.3, seed.ts |
| R2 | RECOMMENDATION | Tank "Taunt" skill doesn't implement taunt mechanics | 2.5, seed.ts |
| R3 | RECOMMENDATION | `StartBattleDto` missing team validation/specification | 2.7 |
| R4 | RECOMMENDATION | Campaign stage progression validation not in `startBattle()` | 2.7, 2.9 |
| R5 | RECOMMENDATION | Clarify seed storage vs RNG internal state (informational) | 2.7 |
| R6 | RECOMMENDATION | `durationMs` should be excluded from battle log validation | 2.7, 5.2 |
| R7 | RECOMMENDATION | `BattlesModule` needs `HeroesModule` import for team loading | 2.7 |
| R8 | RECOMMENDATION | No cleanup job for abandoned battles with `result: 'pending'` | 5.3 |
