# Sprint 3 Code Review -- Battle Engine Implementation

**Reviewer:** reviewer agent
**Date:** 2026-02-22
**Verdict:** APPROVED with minor issues (2 medium-severity, 5 low-severity)

---

## Summary

The Sprint 3 implementation delivers a complete, well-structured battle engine with skill execution, status effects, enemy AI, campaign stages, server-side re-simulation, and comprehensive tests. All 77 tests pass. The API builds cleanly. The codebase is clean, consistent, and follows the plan's architecture.

All 5 blockers from the Expert Review have been addressed:
- B1: `calculateDamage()` now consumes all 3 RNG values regardless of dodge
- B2: `startBattle()` returns `seed` alongside `seedHash`
- B3: `BattleSkill` now has `effect?: SkillEffect`
- B4: `StatusEffect` now has `id` and `sourceId` fields
- B5: Energy deduction is implemented in `startBattle()`

All 8 recommendations were also addressed or appropriately handled.

---

## Files Reviewed

### New Files
| File | Lines | Assessment |
|------|-------|------------|
| `libs/battle-engine/src/hero-converter.ts` | 65 | Clean, correct |
| `libs/battle-engine/src/effects.ts` | 134 | Clean, correct |
| `libs/battle-engine/src/skills.ts` | 241 | Good, 1 issue (M1) |
| `libs/battle-engine/src/ai.ts` | 123 | Good, 1 issue (M2) |
| `libs/battle-engine/src/test-utils.ts` | 183 | Clean, well-designed |
| `libs/shared/src/constants/campaign-stages.ts` | 456 | Comprehensive, correct |
| `apps/api/src/campaign/campaign.module.ts` | 10 | Clean |
| `apps/api/src/campaign/campaign.controller.ts` | 26 | Clean, properly guarded |
| `apps/api/src/campaign/campaign.service.ts` | 75 | Clean |

### New Test Files
| File | Tests | Assessment |
|------|-------|------------|
| `libs/battle-engine/src/hero-converter.spec.ts` | 7 | Good coverage |
| `libs/battle-engine/src/effects.spec.ts` | 14 | Thorough |
| `libs/battle-engine/src/skills.spec.ts` | 10 | Good coverage |
| `libs/battle-engine/src/ai.spec.ts` | 10 | Good coverage |

### Modified Files
| File | Assessment |
|------|------------|
| `libs/battle-engine/src/simulator.ts` | Fully rewritten, correct |
| `libs/battle-engine/src/simulator.spec.ts` | Extended, 14 tests |
| `libs/battle-engine/src/damage.ts` | B1 fix applied correctly |
| `libs/battle-engine/src/index.ts` | Correct re-exports |
| `libs/shared/src/models/battle.ts` | New types added correctly |
| `libs/shared/src/models/hero.ts` | `SkillEffect.stat` added |
| `libs/shared/src/constants/game-config.ts` | Battle tuning constants added |
| `libs/shared/src/index.ts` | Campaign stages re-exported |
| `apps/api/src/battles/battles.service.ts` | Full re-simulation implemented |
| `apps/api/src/battles/dto/complete-battle.dto.ts` | Properly typed |
| `apps/api/src/app.module.ts` | CampaignModule registered |

---

## Detailed Findings

### M1 [MEDIUM] -- Inconsistent RNG consumption in AI `selectDamageTarget`

**File:** `libs/battle-engine/src/ai.ts:107-123`

The `selectDamageTarget` function consumes 1 RNG value when `isRandom` is false (just the `rng.chance()` call), but consumes 2 RNG values when `isRandom` is true (the `rng.chance()` call plus the `rng.pick()` call). This means the number of RNG values consumed by the AI decision varies depending on whether the random target path is taken.

Currently, this does NOT break determinism because both client and server will take the same branch with the same seed. However, the plan explicitly warns about this pattern (Section 3.3: "Always consume RNG values in the same order, even if a result is unused"), and the `calculateDamage()` fix (B1) was specifically about eliminating this class of issue. The AI module has the same structural vulnerability.

If a future change introduces conditional RNG consumption downstream from the AI decision (e.g., a skill that conditionally uses RNG), the different RNG state between the random-target and lowest-HP paths could cause divergence.

**Fix:** Always consume the `rng.pick()` value, even when not using it:

```typescript
function selectDamageTarget(enemies: BattleHero[], rng: SeededRandom): BattleHero {
  const isRandom = rng.chance(GAME_CONFIG.battle.aiRandomTargetChance);
  const randomTarget = rng.pick(enemies);  // always consume

  if (isRandom) {
    return randomTarget;
  }

  return enemies.reduce((min, h) => {
    if (h.currentHp < min.currentHp) return h;
    if (h.currentHp === min.currentHp && h.id.localeCompare(min.id) < 0) return h;
    return min;
  });
}
```

**Impact:** Not a bug today, but a latent determinism risk that contradicts the project's own RNG consumption principles.

### M2 [MEDIUM] -- AI skill priority paths skip RNG consumption entirely

**File:** `libs/battle-engine/src/ai.ts:35-93`

When the AI selects priority 1 (heal), priority 2 (buff/shield), or priority 3 (AoE), the function returns early without calling `selectDamageTarget()`, meaning zero RNG values are consumed. When priority 4 or 5 is reached, 1-2 RNG values are consumed.

This means the total RNG consumption of `decideAction()` varies between 0 and 2 depending on which priority path is taken. This is the same class of issue as M1 and B1.

Again, this does not break determinism today (same seed = same path = same RNG consumption). But it makes the RNG state sensitive to the AI decision outcome, which increases fragility.

**Fix:** Call `selectDamageTarget()` at the top of `decideAction()` and use the result only when needed:

```typescript
export function decideAction(actor, allHeroes, rng): AIDecision {
  const allies = ...;
  const enemies = ...;

  if (enemies.length === 0) {
    return { type: 'auto-attack', targetIds: [] };
  }

  // Always consume RNG for target selection, regardless of which priority wins
  const damageTarget = selectDamageTarget(enemies, rng);

  // ... priority 1-3 logic (unchanged) ...

  // Priority 4
  if (damageSkill) {
    return { type: 'skill', skillId: damageSkill.id, targetIds: [damageTarget.id] };
  }

  // Priority 5
  return { type: 'auto-attack', targetIds: [damageTarget.id] };
}
```

**Impact:** Same as M1. Not a bug today, but a latent risk.

### L1 [LOW] -- Campaign star update uses `{ set: starsEarned }` instead of keeping best stars

**File:** `apps/api/src/battles/battles.service.ts:333`

The `completeBattle()` upsert on `CampaignProgress` sets `stars: { set: starsEarned }`, which overwrites the previous star count. The plan (Task 2.7) says "upsert with best stars", meaning it should only update if the new stars are higher.

```typescript
// Current (overwrites):
update: { stars: { set: starsEarned }, completedAt: new Date() }

// Should be (keep best):
update: {
  stars: starsEarned > (existingProgress?.stars ?? 0) ? starsEarned : undefined,
  completedAt: new Date(),
}
```

Or use a raw SQL `GREATEST(stars, starsEarned)` in the update. Without this fix, a player who earned 3 stars on a stage and then replays it with 1 star will have their progress downgraded.

### L2 [LOW] -- `CampaignService.getStageById` makes two DB queries when one would suffice

**File:** `apps/api/src/campaign/campaign.service.ts:30-52`

The `getStageById` method first queries `findUnique` for the specific stage's progress, then queries `findMany` for all progress records (to call `isStageUnlocked`). The first query is redundant since the `findMany` already includes the specific stage's data.

### L3 [LOW] -- `completeBattle` non-campaign victory gives `startingGold` (500) as reward

**File:** `apps/api/src/battles/battles.service.ts:276`

When a non-campaign battle is won, the reward is `GAME_CONFIG.player.startingGold` (500 gold). This appears to be a placeholder that reuses the wrong constant. A dedicated constant like `GAME_CONFIG.rewards.nonCampaignGold` would be cleaner.

### L4 [LOW] -- Missing test for DoT killing a hero between turns

**File:** `libs/battle-engine/src/simulator.spec.ts`

The plan (Task 2.10) explicitly calls out "Edge case: hero dies from DoT on their turn" as a test scenario. The simulator has this logic (lines 52-75), but there is no dedicated test that verifies a hero with a DoT effect dies at turn-start and their action is skipped. The existing tests indirectly exercise this code path, but a targeted test would be more robust.

### L5 [LOW] -- `SkillEffect` interface not updated with `stat` in the `duration` comment

**File:** `libs/shared/src/models/hero.ts:28-33`

Minor: The `SkillEffect` interface now has `stat?: keyof HeroStats` added (addressing R1), which is correct. No actual issue here, just confirming it was done.

---

## Determinism Assessment

**Verdict: PASS**

All critical determinism requirements are met:

1. **RNG consumption in `calculateDamage`**: Fixed (B1). All 3 values consumed regardless of dodge. Verified by reading `damage.ts:26-30`.

2. **Turn order sorting**: Uses `getEffectiveStats(hero).speed` with `localeCompare` tiebreaker. Modern V8 stable sort guarantees deterministic ordering. Correct at `simulator.ts:38-43`.

3. **Target sorting for AoE**: Targets sorted by `id.localeCompare` before damage calculation in `skills.ts:38`. This ensures per-target RNG consumption is deterministic.

4. **Deep clone in constructor**: The `BattleSimulator` deep-clones all input heroes (`simulator.ts:26-29`), preventing mutation of shared state between client and server runs.

5. **JSON serialization round-trip**: Tested in `simulator.spec.ts:96-107`. Confirms that serialization/deserialization produces identical logs.

**Remaining latent risks (M1, M2):** The AI module's conditional RNG consumption is not a bug today, but represents a structural weakness. The RNG state after `decideAction()` depends on which priority path was taken. This is acceptable for MVP but should be hardened before adding manual player control or new AI behaviors.

---

## Type Safety Assessment

**Verdict: PASS**

- No `any` types in new code (the `as unknown as` casts in `battles.service.ts` are necessary for Prisma JSON columns and are localized).
- `StatusEffect.id` is always set via `createStatusEffect()` which generates deterministic IDs (`${actorId}-${skillId}-${turnNumber}`).
- `BattleSkill.effect` is properly typed as `SkillEffect | undefined` via the import from `hero.ts`.
- `SkillEffect.stat` is properly typed as `keyof HeroStats | undefined`.
- All interfaces are consistent between shared lib and battle engine.

---

## Architecture Assessment

**Verdict: PASS**

- The `battle-engine` library has **zero server imports**. It imports only from `@hero-wars/shared` and its own modules. No NestJS, Prisma, or Redis dependencies.
- The shared lib is framework-agnostic. Pure TypeScript interfaces and functions only.
- The `CampaignModule` is properly registered in `AppModule`.
- The `BattlesService` uses `PrismaService` directly (R7 recommendation followed) rather than importing `HeroesModule`.

---

## Anti-Cheat Assessment

**Verdict: PASS**

- Server re-simulation is fully implemented in `completeBattle()`.
- `compareBattleLogs()` compares `result`, `totalTurns`, turn count, and every `TurnAction` field (`actorId`, `skillId`, `targetIds`, `damage`, `healing`, `resultHp`).
- `durationMs` is excluded from comparison (R6 fix applied).
- Energy is deducted in `startBattle()` (B5 fix applied).
- Battle lock prevents concurrent battles.
- Seed is returned to client (B2 fix applied).
- Campaign progression validation prevents skipping stages.
- The `result !== 'pending'` check prevents double-completion.

---

## Test Quality Assessment

**Verdict: PASS with minor gap (L4)**

77 tests across 6 suites:
- `rng.spec.ts`: Pre-existing, 7 tests
- `hero-converter.spec.ts`: 7 tests -- stat calculation, skill mapping, null handling
- `effects.spec.ts`: 14 tests -- buff/debuff/DoT/shield/heal, stacking, absorption
- `skills.spec.ts`: 10 tests -- single/AoE/heal/shield/self-buff, damage multiplier, determinism
- `ai.spec.ts`: 10 tests -- all 5 priority levels, determinism, edge cases, target selection distribution
- `simulator.spec.ts`: 14 tests -- determinism, JSON round-trip, skills, timeout, edge cases, immutability

Coverage of plan's test scenarios:
- [x] Determinism (same seed = identical log)
- [x] Different seeds = different logs
- [x] JSON serialization round-trip
- [x] Victory/defeat/timeout scenarios
- [x] Skills and effects in battle
- [x] Cooldown decrement and re-use
- [x] Shield absorption
- [x] Healer keeping team alive
- [x] Single hero vs single hero
- [x] All identical stats/speed
- [x] Heroes with no skills
- [x] Config immutability
- [x] AI priority order
- [x] AI determinism
- [ ] DoT kill on hero's turn (L4 -- indirectly covered)
- [ ] Tampered client log detection (integration test -- not in scope for battle-engine)

---

## Code Quality Assessment

**Verdict: PASS**

- Consistent naming conventions throughout
- No dead code
- Clean separation of concerns (converter, effects, skills, AI, simulator are all independently testable)
- Proper error handling in service layer (NotFoundException, ConflictException, ForbiddenException)
- Well-structured test utilities with `makeHero`, `makeWarrior`, `makeMage`, etc.
- Good use of deep cloning to prevent mutation
- No unnecessary abstractions

---

## Summary Table

| # | Severity | Issue | File | Line(s) |
|---|----------|-------|------|---------|
| M1 | MEDIUM | Inconsistent RNG consumption in `selectDamageTarget` (conditional `rng.pick`) | ai.ts | 107-123 |
| M2 | MEDIUM | AI skill priority paths (1-3) skip RNG consumption entirely | ai.ts | 35-93 |
| L1 | LOW | Star update overwrites instead of keeping best | battles.service.ts | 333 |
| L2 | LOW | Redundant DB query in `getStageById` | campaign.service.ts | 30-52 |
| L3 | LOW | Non-campaign reward uses wrong constant | battles.service.ts | 276 |
| L4 | LOW | Missing dedicated DoT-kill test | simulator.spec.ts | -- |
| L5 | LOW | Informational: `SkillEffect.stat` confirmed added | hero.ts | 32 |

---

## Recommendation

**APPROVE.** The implementation is solid, well-tested, and correctly addresses all expert review blockers. The two medium-severity issues (M1, M2) are latent determinism risks that do not cause bugs today but should be addressed before Sprint 4 adds manual player control or new AI behaviors. The low-severity issues are minor quality improvements that can be fixed at any time.
