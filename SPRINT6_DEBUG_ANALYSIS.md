# Sprint 6 Debug Analysis: Edge Cases, Race Conditions & Potential Issues

## CRITICAL Issues (Must Fix Before Implementation)

### CRIT-1: Race Condition in `incrementQuestProgress` -- Concurrent Battle Completions

**Risk**: Two battles completing simultaneously for the same player (e.g., if the battle lock is released and a second battle starts quickly) could both try to increment quest progress. Since `incrementQuestProgress` will likely do a read-then-write (read current progress, check if < target, then update), two concurrent calls could both read `progress=2`, both write `progress=3`, losing one increment.

**Affected Code**: Planned `QuestsService.incrementQuestProgress()` (Sprint 6 C1a)

**Existing Pattern**: The current `claimQuest()` uses `updateMany` with a WHERE clause (`completed: true, claimed: false`) which is atomic. But `incrementQuestProgress` needs to read-then-conditionally-update.

**Fix**: Use Prisma's atomic `increment` within a single `updateMany` call instead of read-then-write:
```ts
// GOOD: Atomic increment
await tx.dailyQuest.updateMany({
  where: { playerId, questId, completed: false, resetDate: today },
  data: { progress: { increment: amount } },
});

// Then, in a separate step, mark completed if progress >= target
// Use a raw query or conditional update:
await tx.$executeRaw`
  UPDATE daily_quests
  SET completed = true
  WHERE player_id = ${playerId}
    AND quest_id = ${questId}
    AND progress >= target
    AND completed = false
`;
```

Alternatively, wrap the entire `incrementQuestProgress` in a Prisma `$transaction` with serializable isolation level (but this is heavier).

---

### CRIT-2: Quest Progress and Leaderboard Updates OUTSIDE the Battle Transaction

**Risk**: The plan calls for `questsService.incrementQuestProgress()` and `leaderboardService.refreshPlayerScores()` to be called AFTER `completeBattle()`'s Prisma transaction. If the server crashes between the transaction commit and the quest/leaderboard updates, the player gets battle rewards but quest progress is lost. Worse: if the quest/leaderboard update throws, the battle is already committed but the response may return an error to the client.

**Affected Code**: `BattlesService.completeBattle()` lines 283-365 (existing transaction) vs. post-transaction quest/leaderboard hooks.

**Fix**: There are two approaches:
1. **Include quest progress inside the battle transaction**: Pass the `tx` to `incrementQuestProgress`. This ensures atomicity but creates tighter coupling.
2. **Fire-and-forget with retry** (preferred for MVP): Wrap quest/leaderboard calls in try-catch so they never block the battle response. Log failures for manual reconciliation. Add a periodic job that recalculates stale quest progress from battle records.

Recommended approach for Sprint 6:
```ts
// After the main transaction succeeds
try {
  await this.questsService.incrementQuestProgress(playerId, 'win_battles', 1);
} catch (err) {
  StructuredLogger.error('quest.progress.failed', { playerId, battleId, error: err.message });
  // Don't rethrow -- battle reward is already granted
}
```

---

### CRIT-3: Energy Deduction Happens Before Battle Lock in `startBattle`

**Risk**: In the current `BattlesService.startBattle()` (lines 65-81), energy is deducted BEFORE the battle lock is acquired (lines 84-92). If the lock fails (another battle already in progress), the player loses energy without getting a battle. This is an existing bug that Sprint 6 would make worse by also triggering `incrementQuestProgress('spend_energy', energyCost)` on energy spend.

**Affected Code**: `BattlesService.startBattle()` lines 65-92

**Fix**: Move the energy deduction AFTER the battle lock acquisition, or better, move it inside the lock's try block:
```ts
// 1. Acquire lock first
const lockAcquired = await this.redis.setNx(...);
if (!lockAcquired) throw new ConflictException('A battle is already in progress');

try {
  // 2. THEN deduct energy (refund on failure in catch block)
  // 3. Then create battle record
}
```

**Note**: This is an existing bug but Sprint 6 makes it user-visible because the `spend_energy` quest would track phantom energy usage.

---

### CRIT-4: Daily Quest Reset Deletes Quests Mid-Game Session

**Risk**: The plan changes the midnight cron from "reset" to "delete old quests". If a player is actively playing at midnight UTC, their quest rows get deleted. Then when `ensurePlayerQuests()` runs, it creates new quests for today. But any `incrementQuestProgress()` calls that were in-flight (e.g., from a battle started before midnight) would fail to find matching quest rows.

**Affected Code**: Planned `ScheduledTasksService.handleDailyQuestReset()` (Sprint 6 C1h)

**Fix**: Use soft deletion or date-based filtering instead of hard delete:
- `ensurePlayerQuests()` should check `resetDate = today` (not just existence of rows).
- `incrementQuestProgress()` should filter by `resetDate = today` to avoid incrementing stale quests.
- The cron can safely delete quests where `resetDate < today - 1 day` (keep yesterday's for a grace period).

```ts
// Safe: only match today's quests
const today = new Date();
today.setUTCHours(0, 0, 0, 0);

await tx.dailyQuest.updateMany({
  where: { playerId, questId, completed: false, resetDate: today },
  data: { progress: { increment: amount } },
});
```

---

## HIGH Issues (Should Fix During Implementation)

### HIGH-1: `ensurePlayerQuests()` Called on Every `getPlayerQuests()` -- No Caching

**Risk**: Every time the frontend loads the quests page (or the lobby loads quest count), it calls `GET /quests`, which calls `ensurePlayerQuests()`. This performs a DB read, potentially a bulk insert (if quests don't exist for today), and then a second read. Under normal usage this is fine, but if a player rapidly refreshes, it creates unnecessary DB load.

**Affected Code**: Planned `QuestsService.ensurePlayerQuests()` (Sprint 6 C1a)

**Fix**:
- The `ensurePlayerQuests()` should be idempotent and fast: first check `COUNT(*) WHERE playerId AND resetDate = today`, and only create if count is 0.
- Consider adding an in-memory cache (e.g., a Set of `${playerId}:${today}` strings) to skip the DB check entirely for subsequent requests within the same server instance. Clear the cache at midnight.

---

### HIGH-2: Leaderboard Redis Data Loss Has No Recovery Path

**Risk**: Redis sorted sets are volatile. If Redis restarts (OOM, crash, deployment), all leaderboard data is lost. The plan mentions no rebuild mechanism.

**Affected Code**: Planned `LeaderboardService` (Sprint 6 C2b)

**Fix**: Add a leaderboard rebuild job:
```ts
@Cron(CronExpression.EVERY_HOUR) // or on startup
async rebuildLeaderboards() {
  const players = await this.prisma.player.findMany({ select: { id: true } });
  for (const player of players) {
    await this.refreshPlayerScores(player.id);
  }
}
```
Also trigger rebuild on application startup if Redis keys are empty (`ZCARD` returns 0). Batch the Redis writes using pipelines for performance.

---

### HIGH-3: Stats Aggregation Query Performance on Large Battle Table

**Risk**: `getDetailedProfile()` plans to run `prisma.battle.aggregate()` which scans the entire Battle table for a player. As the game grows, a player with thousands of battles will have increasingly slow profile loads. The Battle table has an index on `[playerId, createdAt]` but not on `[playerId, result, validated]`.

**Affected Code**: Planned `PlayersService.getDetailedProfile()` (Sprint 6 C3a)

**Fix**:
1. Add a composite index to the Battle model: `@@index([playerId, result, validated])`.
2. Consider maintaining a materialized `PlayerStats` table that gets updated on each battle completion (write-time aggregation) instead of read-time aggregation. But for MVP, the index should be sufficient.

---

### HIGH-4: Power Score Calculation Fetches ALL Heroes and Templates

**Risk**: `calculatePowerScore()` needs to load all `PlayerHero` records with their templates, compute `calculateHeroStats()` for each, and sum the results. For a player with many heroes (potentially 20+ as the game grows), this is multiple DB queries and CPU work on every battle completion and hero upgrade.

**Affected Code**: Planned `LeaderboardService.calculatePowerScore()` (Sprint 6 C2b)

**Fix**:
- Use `include: { template: true }` to load heroes and templates in a single query.
- Cache the power score in a player-level field (e.g., `Player.powerScore`) and only recalculate on hero changes, not on every battle.
- Alternatively, since `refreshPlayerScores()` is called after battles, only update power score on hero upgrade events.

---

### HIGH-5: `claimQuest` Does Not Award XP (Existing Bug + Sprint 6 Plan Gap)

**Risk**: The current `claimQuest()` only awards gold and gems. The Sprint 6 plan adds XP to quest rewards (`rewardXp` field in `QuestDefinition`). However, the plan also does not mention incrementing player XP or checking for level-up. If the player gains enough XP to level up, the level-up logic is never triggered.

**Affected Code**: `QuestsService.claimQuest()` (existing, line 25-29), planned update (Sprint 6 C1a)

**Fix**:
- Add `xp: { increment: rewardXp }` to the player update in `claimQuest()`.
- Implement level-up check logic: after incrementing XP, check if `player.xp >= GAME_CONFIG.xp.playerXpPerLevel(player.level)`, and if so, increment level and subtract the required XP. This should be a shared utility since battle rewards also grant XP.

---

### HIGH-6: Quest Type Validation Missing -- `LeaderboardType` Param Not Validated

**Risk**: The leaderboard controller accepts `:type` as a route param with type `LeaderboardType`. But there's no validation that the input is actually one of `'power' | 'campaign' | 'battles'`. A request to `GET /leaderboard/invalid` would pass through and cause errors in the service layer.

**Affected Code**: Planned `LeaderboardController.getLeaderboard()` (Sprint 6 C2c)

**Fix**: Add a validation pipe or enum check:
```ts
@Get(':type')
getLeaderboard(@Param('type', new ParseEnumPipe(['power', 'campaign', 'battles'])) type: LeaderboardType) {
  // ...
}
```
Or validate manually at the start of the service method.

---

### HIGH-7: `refreshPlayerScores()` After Every Battle Is Expensive

**Risk**: The plan calls `leaderboardService.refreshPlayerScores(playerId)` after every battle completion. This recalculates ALL three leaderboard scores (power, campaign, battles), even though a single battle only affects `battles` and possibly `campaign`. Power score doesn't change from battles.

**Affected Code**: Planned integration hook in `BattlesService.completeBattle()` (Sprint 6 C2f)

**Fix**: Be surgical about which scores to update:
```ts
// After battle victory:
await this.leaderboardService.updateScore(playerId, 'battles', await this.leaderboardService.calculateBattleScore(playerId));
if (battle.stageId) {
  await this.leaderboardService.updateScore(playerId, 'campaign', await this.leaderboardService.calculateCampaignScore(playerId));
}
// DON'T recalculate power score after battles
```

---

## MEDIUM Issues (Nice to Fix)

### MED-1: Player with 0 Heroes -- Power Score Division Edge Case

**Risk**: A player who somehow has 0 heroes (e.g., database manual cleanup, future hero-removal feature) would produce a power score of 0. This is not a crash, but when displayed in the leaderboard alongside other players, it could be confusing. The `calculatePowerScore()` should handle this gracefully.

**Affected Code**: Planned `LeaderboardService.calculatePowerScore()` (Sprint 6 C2b)

**Fix**: Return 0 explicitly and optionally exclude zero-score players from leaderboard display. Not critical but good defensive coding.

---

### MED-2: Player Who Registers But Never Plays -- Empty Stats Display

**Risk**: `getDetailedProfile()` will aggregate stats that are all zeroes. `winRate` would be `0/0 = NaN` if calculated as `battlesWon / totalBattles`.

**Affected Code**: Planned `PlayersService.getDetailedProfile()` (Sprint 6 C3a)

**Fix**: Handle division by zero:
```ts
const winRate = totalBattles > 0 ? (battlesWon / totalBattles) * 100 : 0;
```

---

### MED-3: Quest Definitions Changing Between Resets

**Risk**: If quest definitions are updated in code (e.g., changing `target` from 3 to 5 for `win_3_battles`), players who already have the old quest assigned (in DB) would have stale `target` values. The plan stores `target` in the DB but looks up rewards from `QUEST_DEFINITIONS`. A mismatch between DB target and definition target could cause confusion.

**Affected Code**: DailyQuest DB table, `QUEST_DEFINITIONS` constant

**Fix**:
- Always read `target` from the DB row (which was set at assignment time), not from the definition.
- OR always read from the definition and don't store `target` in DB (simpler, but then you can't change definitions mid-day without affecting active quests).
- The plan's approach (store `target` in DB) is actually correct here. Just make sure `ensurePlayerQuests()` copies the target from the definition at creation time, and `incrementQuestProgress()` reads target from the DB row.

---

### MED-4: Leaderboard for Brand-New Player with No Score

**Risk**: A new player who hasn't played any battles won't be in any Redis sorted set. `zRevRank` will return `null`. The plan handles this with `playerRank: LeaderboardEntry | null`, which is correct.

**Affected Code**: Planned `LeaderboardService.getLeaderboard()` (Sprint 6 C2b)

**Fix**: No code fix needed, but ensure the frontend handles `playerRank = null` gracefully (e.g., "Not yet ranked" instead of an empty/broken display).

---

### MED-5: Integer Overflow for Leaderboard Scores

**Risk**: Redis sorted set scores are IEEE 754 doubles, which can represent integers exactly up to 2^53. The power score is `sum(hp + attack + defense + speed)` for all heroes. At max level (100) and max stars (7), the multipliers are `1 + 99*0.1 = 10.9` and `1 + 6*0.15 = 1.9`. A hero with base 1000 in each stat would have ~1000 * 10.9 * 1.9 * 4 = ~82,840 per hero. With ~50 heroes = ~4.1M total. Well within safe integer range. Not a real risk.

**Fix**: No fix needed. Redis doubles are safe for these ranges.

---

### MED-6: Lobby Component Loading Quests on Init -- Extra API Call

**Risk**: The plan updates `LobbyComponent` to inject `QuestsService` and load quests on init to show "3/5 Done". This means every lobby page load triggers a `GET /quests` call, which in turn calls `ensurePlayerQuests()`. If the player navigates to the quests page from the lobby, quests load a second time.

**Affected Code**: Planned `LobbyComponent` (Sprint 6 D5a)

**Fix**: Use Angular signals/shared state. Since `QuestsService` is `providedIn: 'root'`, the `quests` signal is shared. If the lobby loads quests into the signal, the quests page can read from the signal directly without refetching. Just ensure the quests page checks if data is already loaded before calling `loadQuests()`.

---

### MED-7: `spend_energy` Quest Tracked in `startBattle` -- Energy Already Deducted Before Lock

**Risk**: Related to CRIT-3. The plan hooks `spend_energy` quest progress in `startBattle()` after energy deduction. But if the lock acquisition fails (line 90-91), the energy is already deducted AND the quest progress was incremented. The player loses energy and gets quest credit for a battle that never happened.

**Affected Code**: `BattlesService.startBattle()` + planned quest hook

**Fix**: Track `spend_energy` quest progress AFTER the lock is acquired successfully, inside the try block. Better yet, track it in `completeBattle()` since that's when the energy was truly "spent" on a completed action.

---

### MED-8: No Validation on `offset` and `limit` Query Params for Leaderboard

**Risk**: The leaderboard endpoint accepts `offset` and `limit` as query params. Without validation, a malicious user could send `limit=999999` to retrieve a huge payload, or `offset=-1` causing Redis errors.

**Affected Code**: Planned `LeaderboardController.getLeaderboard()` (Sprint 6 C2c)

**Fix**: Add validation with `ParseIntPipe` and clamp values:
```ts
@Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
```
And in the service: `limit = Math.min(Math.max(limit, 1), GAME_CONFIG.leaderboard.pageSize)`.

---

## Security Concerns

### SEC-1: Quest Progress Replay via Modified Battle Logs

**Risk Level**: LOW (mitigated by existing architecture)

The battle validation system (server-side re-simulation) prevents a player from faking battle outcomes. Quest progress is tied to validated battle results, not raw client input. However, there's a subtle attack: a player could complete a battle, get quest progress, then somehow trigger `completeBattle` again for the same battle ID.

**Existing Protection**: The check `if (battle.result !== 'pending')` at line 224 prevents re-completion. This is sufficient.

---

### SEC-2: Rate Limiting on Leaderboard Queries

**Risk Level**: LOW (global throttle exists)

The global `ThrottlerModule` limits to 60 requests per minute per IP. The leaderboard endpoint could be hammered for data scraping but the global limit prevents DoS. For a game of this scale, this is sufficient.

**Recommendation**: No additional throttling needed for MVP, but consider adding `@Throttle({ default: { limit: 20, ttl: 60000 } })` to the leaderboard endpoint if scraping becomes an issue.

---

### SEC-3: Quest Claim Idempotency

**Risk Level**: MITIGATED

The existing `claimQuest()` uses `updateMany` with `WHERE claimed = false` which is atomic. Double-clicking "claim" won't grant double rewards. This is well-designed.

---

### SEC-4: Leaderboard Username Enumeration

**Risk Level**: LOW

The leaderboard exposes `username` and `level` for all ranked players. This is intentional for a competitive game but could be used to enumerate valid usernames. Since the login endpoint already rate-limits and doesn't reveal username existence (returns generic "Invalid credentials"), this is acceptable.

---

## Transaction Safety Analysis

### TXSAFETY-1: Quest Claim Is Atomic (Existing -- Good)

The current `claimQuest()` wraps the claim flag update AND reward grant in a single `$transaction`. If the reward grant fails, the claim flag is rolled back. This is correct.

**Concern**: Sprint 6 adds XP to rewards. Ensure the XP increment and potential level-up check are also inside the same transaction.

---

### TXSAFETY-2: Battle Completion + Quest Progress + Leaderboard Should Be Coordinated

As noted in CRIT-2, these three operations are not in a single transaction. The battle completion is transactional, but quest and leaderboard updates happen outside. This is a deliberate trade-off:

- **Option A**: Include all in one Prisma transaction. Downside: Redis leaderboard update can't be in a Prisma transaction, and the transaction becomes very long.
- **Option B** (Recommended): Battle transaction commits first. Quest and leaderboard are best-effort with error logging. Add a reconciliation job.

---

### TXSAFETY-3: `incrementQuestProgress` Needs Internal Atomicity

The `incrementQuestProgress` method must handle the "increment + check completion" atomically. If it does two separate queries (increment, then check if >= target), a race condition could miss the completion check.

**Fix**: Use raw SQL or a single Prisma operation:
```ts
await prisma.$executeRaw`
  UPDATE daily_quests
  SET progress = progress + ${amount},
      completed = CASE WHEN progress + ${amount} >= target THEN true ELSE completed END
  WHERE player_id = ${playerId}
    AND quest_id = ${questId}
    AND completed = false
    AND reset_date = ${today}
`;
```

---

## Summary of Priority Actions

| Priority | Issue | Effort |
|----------|-------|--------|
| CRITICAL | CRIT-1: Atomic `incrementQuestProgress` | Medium |
| CRITICAL | CRIT-2: Quest/leaderboard outside battle transaction | Medium |
| CRITICAL | CRIT-3: Energy deducted before lock (existing bug) | Low |
| CRITICAL | CRIT-4: Quest deletion at midnight race | Low |
| HIGH | HIGH-1: `ensurePlayerQuests` caching | Low |
| HIGH | HIGH-2: Leaderboard Redis rebuild | Medium |
| HIGH | HIGH-3: Battle table index for stats | Low |
| HIGH | HIGH-4: Power score fetches all heroes | Low |
| HIGH | HIGH-5: XP + level-up on quest claim | Medium |
| HIGH | HIGH-6: LeaderboardType param validation | Low |
| HIGH | HIGH-7: Selective score updates | Low |
| MEDIUM | MED-1 through MED-8: Various edge cases | Low each |
