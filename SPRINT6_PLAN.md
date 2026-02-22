# Sprint 6: Meta Systems Implementation Plan

## Overview
Sprint 6 adds three meta systems: **Daily Quests** (completion), **Leaderboard** (new), and **Player Profile Enhancement**. These systems drive player engagement through daily goals, competitive ranking, and progress visibility.

---

## A. Shared Types & Constants (libs/shared)

### A1. New File: `libs/shared/src/models/leaderboard.ts`
```ts
export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  score: number;
  level: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  playerRank: LeaderboardEntry | null; // Current player's rank (null if not on board)
  total: number;
}

export type LeaderboardType = 'power' | 'campaign' | 'battles';
```

### A2. New File: `libs/shared/src/models/quest.ts`
```ts
export type QuestType = 'win_battles' | 'complete_campaign' | 'upgrade_hero' | 'login' | 'spend_energy';

export interface QuestDefinition {
  questId: string;
  type: QuestType;
  name: string;
  description: string;
  target: number;
  rewardGold: number;
  rewardXp: number;
  rewardGems: number;
}

export interface DailyQuestResponse {
  questId: string;
  name: string;
  description: string;
  type: QuestType;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  rewardGold: number;
  rewardXp: number;
  rewardGems: number;
}
```

### A3. New File: `libs/shared/src/models/profile.ts`
```ts
export interface PlayerProfileResponse {
  id: string;
  username: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  gold: number;
  gems: number;
  energy: number;
  maxEnergy: number;
  createdAt: Date;
  stats: PlayerStatsResponse;
}

export interface PlayerStatsResponse {
  totalBattles: number;
  battlesWon: number;
  battlesLost: number;
  winRate: number;
  campaignStarsTotal: number;
  campaignStagesCompleted: number;
  totalHeroes: number;
  highestHeroLevel: number;
  totalQuestsClaimed: number;
  powerScore: number;
}
```

### A4. Update: `libs/shared/src/constants/game-config.ts`
Add quest-related config:
```ts
quests: {
  dailyQuestCount: 5, // Number of quests assigned per day
  loginQuestId: 'daily_login',
},
leaderboard: {
  pageSize: 50,
  maxEntries: 1000, // Top N shown
},
```

### A5. Update: `libs/shared/src/constants/quest-definitions.ts` (NEW)
```ts
import { QuestDefinition } from '../models/quest';

export const QUEST_DEFINITIONS: QuestDefinition[] = [
  {
    questId: 'win_3_battles',
    type: 'win_battles',
    name: 'Victorious',
    description: 'Win 3 battles',
    target: 3,
    rewardGold: 200,
    rewardXp: 100,
    rewardGems: 5,
  },
  {
    questId: 'win_5_battles',
    type: 'win_battles',
    name: 'Battle Master',
    description: 'Win 5 battles',
    target: 5,
    rewardGold: 400,
    rewardXp: 200,
    rewardGems: 10,
  },
  {
    questId: 'complete_1_campaign',
    type: 'complete_campaign',
    name: 'Adventurer',
    description: 'Complete 1 campaign stage',
    target: 1,
    rewardGold: 150,
    rewardXp: 75,
    rewardGems: 5,
  },
  {
    questId: 'complete_3_campaigns',
    type: 'complete_campaign',
    name: 'Conqueror',
    description: 'Complete 3 campaign stages',
    target: 3,
    rewardGold: 300,
    rewardXp: 150,
    rewardGems: 10,
  },
  {
    questId: 'upgrade_hero_1',
    type: 'upgrade_hero',
    name: 'Hero Trainer',
    description: 'Upgrade a hero once',
    target: 1,
    rewardGold: 150,
    rewardXp: 75,
    rewardGems: 5,
  },
  {
    questId: 'upgrade_hero_3',
    type: 'upgrade_hero',
    name: 'Master Trainer',
    description: 'Upgrade heroes 3 times',
    target: 3,
    rewardGold: 300,
    rewardXp: 150,
    rewardGems: 10,
  },
  {
    questId: 'daily_login',
    type: 'login',
    name: 'Daily Check-in',
    description: 'Log in today',
    target: 1,
    rewardGold: 100,
    rewardXp: 50,
    rewardGems: 5,
  },
  {
    questId: 'spend_30_energy',
    type: 'spend_energy',
    name: 'Energetic',
    description: 'Spend 30 energy',
    target: 30,
    rewardGold: 200,
    rewardXp: 100,
    rewardGems: 5,
  },
];
```

### A6. Update: `libs/shared/src/index.ts`
Add new exports:
```ts
export * from './models/leaderboard';
export * from './models/quest';
export * from './models/profile';
export * from './constants/quest-definitions';
```

---

## B. Database Changes (Prisma Schema)

### B1. Add `target` column to `DailyQuest` table
The existing `DailyQuest` table lacks a `target` column (quest goal value) and reward columns. Add:
```prisma
model DailyQuest {
  playerId  String   @map("player_id")
  questId   String   @map("quest_id")
  progress  Int      @default(0)
  target    Int      @default(1)          // NEW
  completed Boolean  @default(false)
  claimed   Boolean  @default(false)
  resetDate DateTime @map("reset_date")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@id([playerId, questId])
  @@index([playerId, resetDate])
  @@map("daily_quests")
}
```

**Note**: We do NOT need to store rewards in the DB. Rewards come from the QUEST_DEFINITIONS constant, looked up by `questId`. The `target` column is useful so the DB knows the completion threshold.

### B2. No new tables needed
- **Leaderboard**: Uses Redis sorted sets (no Prisma table).
- **Player Stats**: Aggregated from existing Battle, CampaignProgress, PlayerHero, DailyQuest tables.

### B3. Migration
```bash
npx prisma migrate dev --name add-quest-target-column
```

---

## C. Backend Implementation (apps/api)

### C1. Daily Quests System (Completion)

#### C1a. Modify: `apps/api/src/quests/quests.service.ts`
**Changes:**
- Import `QUEST_DEFINITIONS` and `QuestDefinition` from `@hero-wars/shared`
- Add `ensurePlayerQuests(playerId)` method: checks if player has quests for today, if not, assigns a random selection of `GAME_CONFIG.quests.dailyQuestCount` quests from `QUEST_DEFINITIONS` (always include `daily_login`). Creates DailyQuest rows with proper `target` values.
- Update `getPlayerQuests()`: calls `ensurePlayerQuests()` first, then maps results to `DailyQuestResponse[]` by joining with `QUEST_DEFINITIONS` for name/description/rewards.
- Update `claimQuest()`: looks up reward values from `QUEST_DEFINITIONS` instead of hardcoded `100 gold / 10 gems`. Awards gold, xp, AND gems.
- Add `incrementQuestProgress(playerId, questType, amount)` method: finds uncompleted quests of matching type for today, increments progress, auto-sets `completed = true` when `progress >= target`.

```ts
// Key new method signature
async incrementQuestProgress(
  playerId: string,
  questType: QuestType,
  amount: number = 1,
): Promise<void>
```

#### C1b. New: `apps/api/src/quests/quest-progress.service.ts`
A thin service that other modules inject to report progress without circular dependencies. Uses NestJS `EventEmitter2` pattern.

**Alternative approach (chosen): Use NestJS Events**
- Create a custom `QuestEventService` that emits typed events.
- QuestsService listens for events and increments progress.
- This avoids circular module dependencies.

Actually, the simplest approach: **QuestsService exports `incrementQuestProgress()` and other services call it directly**. Since QuestsModule already exports QuestsService, other modules just import QuestsModule.

**Circular Dependency Risk**: BattlesModule would need QuestsModule, but QuestsModule doesn't need BattlesModule, so no circular dependency.

#### C1c. Modify: `apps/api/src/battles/battles.service.ts`
**Changes:**
- Import `QuestsService`
- After a validated victory in `completeBattle()`, call:
  - `questsService.incrementQuestProgress(playerId, 'win_battles', 1)`
  - If `battle.stageId` exists: `questsService.incrementQuestProgress(playerId, 'complete_campaign', 1)`
  - `questsService.incrementQuestProgress(playerId, 'spend_energy', energyCost)` (in `startBattle()` after energy deduction)

#### C1d. Modify: `apps/api/src/battles/battles.module.ts`
- Add `QuestsModule` to imports

#### C1e. Modify: `apps/api/src/heroes/heroes.service.ts`
**Changes:**
- Import `QuestsService`
- After successful `levelUpHero()` or `starUpHero()`, call:
  - `questsService.incrementQuestProgress(playerId, 'upgrade_hero', 1)`

#### C1f. Modify: `apps/api/src/heroes/heroes.module.ts`
- Add `QuestsModule` to imports

#### C1g. Modify: `apps/api/src/auth/auth.service.ts` (or `quests.controller.ts`)
**Changes:**
- On login, trigger the `daily_login` quest progress. Best place: in the `getPlayerQuests()` flow - when `ensurePlayerQuests()` creates new quests for today, it auto-completes the `daily_login` quest (set `progress = 1, completed = true`).

#### C1h. Modify: `apps/api/src/scheduled/scheduled-tasks.service.ts`
**Changes:**
- Update the daily quest reset cron to also delete old quest rows instead of just resetting them, OR keep the reset logic but ensure `ensurePlayerQuests()` handles the fresh-day logic correctly. The current approach (resetting progress/completed/claimed) works if we also reassign quests. Simplest: delete all quests with `resetDate < today` instead, and let `ensurePlayerQuests()` lazily create new ones.

```ts
// Updated reset: delete old quests so ensurePlayerQuests() recreates fresh ones
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async handleDailyQuestReset() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const result = await this.prisma.dailyQuest.deleteMany({
    where: { resetDate: { lt: today } },
  });
  StructuredLogger.info('scheduled.dailyQuestReset.done', { questsDeleted: result.count });
}
```

---

### C2. Leaderboard System (New)

#### C2a. Extend: `apps/api/src/redis/redis.service.ts`
Add sorted set methods:
```ts
async zAdd(key: string, score: number, member: string): Promise<void>
async zRevRange(key: string, start: number, stop: number): Promise<Array<{ value: string; score: number }>>
async zRevRank(key: string, member: string): Promise<number | null>
async zScore(key: string, member: string): Promise<number | null>
async zCard(key: string): Promise<number>
```

These map directly to Redis sorted set commands. Each wraps the `this.client.zAdd()`, `this.client.zRangeWithScores()` (with REV), etc.

#### C2b. New: `apps/api/src/leaderboard/leaderboard.service.ts`
```ts
@Injectable()
export class LeaderboardService {
  // Redis keys
  private readonly POWER_KEY = 'leaderboard:power';
  private readonly CAMPAIGN_KEY = 'leaderboard:campaign';
  private readonly BATTLES_KEY = 'leaderboard:battles';

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
  ) {}

  // Update a player's score on a specific leaderboard
  async updateScore(playerId: string, type: LeaderboardType, score: number): Promise<void>

  // Get leaderboard page with player ranks
  async getLeaderboard(type: LeaderboardType, playerId: string, offset: number, limit: number): Promise<LeaderboardResponse>

  // Calculate power score: sum of all hero computed stats (attack + defense + hp + speed) across all owned heroes
  async calculatePowerScore(playerId: string): Promise<number>

  // Calculate campaign score: total stars across all stages
  async calculateCampaignScore(playerId: string): Promise<number>

  // Calculate battle score: total validated victories
  async calculateBattleScore(playerId: string): Promise<number>

  // Recalculate and update all scores for a player
  async refreshPlayerScores(playerId: string): Promise<void>
}
```

**Score Calculation Details:**
- **Power**: Sum of `(computedAttack + computedDefense + computedHp + computedSpeed)` for all player heroes, using `calculateHeroStats()`.
- **Campaign**: Total stars earned across all stages (from `CampaignProgress` table).
- **Battles**: Count of validated victories (from `Battle` table, `result = 'victory'` AND `validated = true`).

#### C2c. New: `apps/api/src/leaderboard/leaderboard.controller.ts`
```ts
@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  @Get(':type')
  getLeaderboard(
    @Param('type') type: LeaderboardType,
    @Query('offset') offset: number = 0,
    @Query('limit') limit: number = 50,
    @Req() req,
  ): Promise<LeaderboardResponse>
}
```

**Endpoint**: `GET /leaderboard/:type?offset=0&limit=50`
- `type` is one of: `power`, `campaign`, `battles`
- Returns top N entries + the requesting player's own rank

#### C2d. New: `apps/api/src/leaderboard/leaderboard.module.ts`
```ts
@Module({
  imports: [RedisModule, PrismaModule],  // or just use global providers
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
```

#### C2e. Modify: `apps/api/src/app.module.ts`
- Import `LeaderboardModule`

#### C2f. Integration hooks for leaderboard score updates
After battle completion in `BattlesService`:
```ts
await this.leaderboardService.refreshPlayerScores(playerId);
```

After hero upgrade in `HeroesService`:
```ts
await this.leaderboardService.updateScore(playerId, 'power', await this.leaderboardService.calculatePowerScore(playerId));
```

**Note:** `BattlesModule` and `HeroesModule` will need `LeaderboardModule` imported.

---

### C3. Player Profile Enhancement

#### C3a. Modify: `apps/api/src/players/players.service.ts`
**Changes:**
- Add `getDetailedProfile(playerId)` method that aggregates:
  - Basic player info (existing)
  - Battle stats: `COUNT(*)`, `COUNT(*) WHERE result='victory'`, etc. from Battle table
  - Campaign stats: `SUM(stars)`, `COUNT(*)` from CampaignProgress table
  - Hero stats: `COUNT(*)`, `MAX(level)` from PlayerHero table
  - Quest stats: `COUNT(*) WHERE claimed=true` from DailyQuest table
  - Power score: calculated via `calculateHeroStats()` across all heroes
  - XP to next level: from `GAME_CONFIG.xp.playerXpPerLevel(player.level)`

```ts
async getDetailedProfile(playerId: string): Promise<PlayerProfileResponse> {
  const player = await this.prisma.player.findUnique({ where: { id: playerId } });
  // ... aggregate queries ...
  const [battleStats, campaignStats, heroStats, questStats] = await Promise.all([
    this.prisma.battle.aggregate({ where: { playerId, validated: true }, _count: true }),
    // ... etc
  ]);
}
```

#### C3b. Modify: `apps/api/src/players/players.controller.ts`
**Changes:**
- Update `GET /players/me` to use `getDetailedProfile()` instead of `getProfile()`
- OR add new endpoint `GET /players/me/stats` for detailed stats (keeps backward compat)

**Decision**: Update the existing `GET /players/me` endpoint to return `PlayerProfileResponse` (richer data). The frontend currently only uses basic fields, so adding extra fields is backward compatible.

---

## D. Frontend Implementation (apps/client)

### D1. Daily Quests UI

#### D1a. New: `apps/client/src/app/core/services/quests.service.ts`
```ts
@Injectable({ providedIn: 'root' })
export class QuestsService {
  readonly quests = signal<DailyQuestResponse[]>([]);
  readonly loading = signal(false);

  constructor(private api: ApiService) {}

  loadQuests(): Observable<DailyQuestResponse[]> {
    this.loading.set(true);
    return this.api.get<DailyQuestResponse[]>('/quests').pipe(
      tap((quests) => { this.quests.set(quests); this.loading.set(false); }),
    );
  }

  claimQuest(questId: string): Observable<{ questId: string; rewards: { gold: number; xp: number; gems: number } }> {
    return this.api.post(`/quests/${questId}/claim`, {}).pipe(
      tap(() => {
        // Update local state: mark quest as claimed
        this.quests.update(quests =>
          quests.map(q => q.questId === questId ? { ...q, claimed: true } : q)
        );
      }),
    );
  }
}
```

#### D1b. New: `apps/client/src/app/features/quests/quests.component.ts`
A standalone Angular component that displays:
- List of daily quests with progress bars
- Claim button for completed quests
- Reward display (gold, xp, gems)
- Visual indicators: pending (grey), in-progress (blue progress bar), completed (green), claimed (gold checkmark)

**Template structure:**
```html
<div class="quests-container">
  <h2>Daily Quests</h2>
  @for (quest of questsService.quests(); track quest.questId) {
    <div class="quest-card" [class.completed]="quest.completed" [class.claimed]="quest.claimed">
      <div class="quest-info">
        <h3>{{ quest.name }}</h3>
        <p>{{ quest.description }}</p>
        <div class="progress-bar">
          <div class="fill" [style.width.%]="(quest.progress / quest.target) * 100"></div>
          <span>{{ quest.progress }}/{{ quest.target }}</span>
        </div>
      </div>
      <div class="quest-rewards">
        <span class="gold">{{ quest.rewardGold }} Gold</span>
        <span class="xp">{{ quest.rewardXp }} XP</span>
        <span class="gems">{{ quest.rewardGems }} Gems</span>
      </div>
      @if (quest.completed && !quest.claimed) {
        <button (click)="claim(quest.questId)">Claim</button>
      }
      @if (quest.claimed) {
        <span class="claimed-badge">Claimed</span>
      }
    </div>
  }
</div>
```

**Styling**: Follows existing dark theme (bg `#1a1a2e`, cards `#0f3460`, accent `#e94560`).

### D2. Leaderboard Page

#### D2a. New: `apps/client/src/app/core/services/leaderboard.service.ts`
```ts
@Injectable({ providedIn: 'root' })
export class LeaderboardService {
  readonly entries = signal<LeaderboardEntry[]>([]);
  readonly playerRank = signal<LeaderboardEntry | null>(null);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly activeType = signal<LeaderboardType>('power');

  constructor(private api: ApiService) {}

  loadLeaderboard(type: LeaderboardType, offset = 0, limit = 50): Observable<LeaderboardResponse> {
    this.loading.set(true);
    this.activeType.set(type);
    return this.api.get<LeaderboardResponse>(`/leaderboard/${type}?offset=${offset}&limit=${limit}`).pipe(
      tap((res) => {
        this.entries.set(res.leaderboard);
        this.playerRank.set(res.playerRank);
        this.total.set(res.total);
        this.loading.set(false);
      }),
    );
  }
}
```

#### D2b. New: `apps/client/src/app/features/leaderboard/leaderboard.component.ts`
Displays:
- Tab selector: Power | Campaign | Battles
- Ranked table: rank, username, score, level
- Highlighted row for current player
- Player's own rank shown at bottom if not in visible range

**Template structure:**
```html
<div class="leaderboard-container">
  <h2>Leaderboard</h2>
  <div class="tabs">
    <button [class.active]="activeTab() === 'power'" (click)="switchTab('power')">Power</button>
    <button [class.active]="activeTab() === 'campaign'" (click)="switchTab('campaign')">Campaign</button>
    <button [class.active]="activeTab() === 'battles'" (click)="switchTab('battles')">Battles</button>
  </div>
  <table class="leaderboard-table">
    <thead><tr><th>#</th><th>Player</th><th>Level</th><th>Score</th></tr></thead>
    <tbody>
      @for (entry of leaderboardService.entries(); track entry.playerId) {
        <tr [class.self]="entry.playerId === currentPlayerId()">
          <td>{{ entry.rank }}</td>
          <td>{{ entry.username }}</td>
          <td>{{ entry.level }}</td>
          <td>{{ entry.score }}</td>
        </tr>
      }
    </tbody>
  </table>
  @if (leaderboardService.playerRank(); as myRank) {
    <div class="my-rank">Your Rank: #{{ myRank.rank }} (Score: {{ myRank.score }})</div>
  }
</div>
```

### D3. Player Profile Page

#### D3a. New: `apps/client/src/app/core/services/player.service.ts`
```ts
@Injectable({ providedIn: 'root' })
export class PlayerService {
  readonly profile = signal<PlayerProfileResponse | null>(null);
  readonly loading = signal(false);

  constructor(private api: ApiService) {}

  loadProfile(): Observable<PlayerProfileResponse> {
    this.loading.set(true);
    return this.api.get<PlayerProfileResponse>('/players/me').pipe(
      tap((profile) => { this.profile.set(profile); this.loading.set(false); }),
    );
  }
}
```

#### D3b. New: `apps/client/src/app/features/profile/profile.component.ts`
Displays:
- Player avatar placeholder, username, level with XP progress bar
- Resource display (gold, gems, energy)
- Stats grid: battles fought, win rate, campaign stars, heroes owned, etc.
- Power score prominently displayed
- Account age

**Template structure:**
```html
<div class="profile-container">
  @if (playerService.profile(); as p) {
    <div class="profile-header">
      <div class="avatar">{{ p.username[0] | uppercase }}</div>
      <h2>{{ p.username }}</h2>
      <span class="level-badge">Level {{ p.level }}</span>
      <div class="xp-bar">
        <div class="fill" [style.width.%]="(p.xp / p.xpToNextLevel) * 100"></div>
        <span>{{ p.xp }}/{{ p.xpToNextLevel }} XP</span>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <span class="value">{{ p.stats.powerScore }}</span>
        <span class="label">Power</span>
      </div>
      <div class="stat-card">
        <span class="value">{{ p.stats.totalBattles }}</span>
        <span class="label">Battles</span>
      </div>
      <div class="stat-card">
        <span class="value">{{ p.stats.winRate | number:'1.0-0' }}%</span>
        <span class="label">Win Rate</span>
      </div>
      <div class="stat-card">
        <span class="value">{{ p.stats.campaignStarsTotal }}</span>
        <span class="label">Campaign Stars</span>
      </div>
      <div class="stat-card">
        <span class="value">{{ p.stats.totalHeroes }}</span>
        <span class="label">Heroes</span>
      </div>
      <div class="stat-card">
        <span class="value">{{ p.stats.totalQuestsClaimed }}</span>
        <span class="label">Quests Done</span>
      </div>
    </div>
  }
</div>
```

### D4. Route Updates

#### D4a. Modify: `apps/client/src/app/app.routes.ts`
Add three new routes:
```ts
{
  path: 'quests',
  loadComponent: () =>
    import('./features/quests/quests.component').then((m) => m.QuestsComponent),
  canActivate: [authGuard],
},
{
  path: 'leaderboard',
  loadComponent: () =>
    import('./features/leaderboard/leaderboard.component').then((m) => m.LeaderboardComponent),
  canActivate: [authGuard],
},
{
  path: 'profile',
  loadComponent: () =>
    import('./features/profile/profile.component').then((m) => m.ProfileComponent),
  canActivate: [authGuard],
},
```

### D5. Lobby Update

#### D5a. Modify: `apps/client/src/app/features/lobby/lobby.component.ts`
**Changes:**
- Replace the disabled "Shop" card with three new menu cards:
  - **Daily Quests** card with daily completion count (e.g., "3/5 Done")
  - **Leaderboard** card linking to `/leaderboard`
  - **Profile** card linking to `/profile`
- Inject `QuestsService`, load quests on init, show completion count

Updated menu grid (6 cards in 2x3 or 3x2 layout):
```html
<div class="menu-card" routerLink="/campaign">
  <h3>Campaign</h3>
  <p>Conquer the world stage by stage</p>
  <span class="campaign-progress">{{ completedStages() }}/30</span>
</div>
<div class="menu-card" routerLink="/heroes">
  <h3>Heroes</h3>
  <p>Manage your hero collection</p>
</div>
<div class="menu-card" routerLink="/quests">
  <h3>Daily Quests</h3>
  <p>Complete daily challenges</p>
  <span class="quest-progress">{{ claimedQuests() }}/{{ totalQuests() }} Done</span>
</div>
<div class="menu-card" routerLink="/leaderboard">
  <h3>Leaderboard</h3>
  <p>Compete with other players</p>
</div>
<div class="menu-card" routerLink="/profile">
  <h3>Profile</h3>
  <p>View your stats and progress</p>
</div>
<div class="menu-card" routerLink="/battle/1-1">
  <h3>Battle</h3>
  <p>Enter the battlefield</p>
</div>
```

---

## E. Integration Points

### E1. Quest Progress Tracking Hooks

| Event | Quest Type | Where Hooked | Amount |
|---|---|---|---|
| Battle won (validated victory) | `win_battles` | `BattlesService.completeBattle()` | 1 |
| Campaign stage completed | `complete_campaign` | `BattlesService.completeBattle()` (when `stageId` exists) | 1 |
| Hero level up | `upgrade_hero` | `HeroesService.levelUpHero()` | 1 |
| Hero star up | `upgrade_hero` | `HeroesService.starUpHero()` | 1 |
| Energy spent | `spend_energy` | `BattlesService.startBattle()` (after energy deduction) | energyCost |
| Daily login | `login` | `QuestsService.ensurePlayerQuests()` (auto-completed on creation) | 1 |

### E2. Leaderboard Score Update Points

| Event | Leaderboard | Where Updated |
|---|---|---|
| Battle completed (victory) | `battles`, `campaign` | `BattlesService.completeBattle()` |
| Hero upgraded (level/star) | `power` | `HeroesService.levelUpHero()` / `starUpHero()` |
| Campaign stage completed | `campaign` | `BattlesService.completeBattle()` |

**Update strategy**: Call `leaderboardService.refreshPlayerScores(playerId)` after battles. For hero upgrades, only update the `power` leaderboard. This keeps it simple and avoids unnecessary Redis writes.

### E3. Stats Aggregation (Player Profile)

Stats are computed on-demand via Prisma aggregate queries when `GET /players/me` is called:
- `Battle` table: `_count` total, `_count` where `result='victory' AND validated=true`
- `CampaignProgress` table: `_sum` of `stars`, `_count` of records
- `PlayerHero` table: `_count`, `_max` of `level`
- `DailyQuest` table: `_count` where `claimed=true`
- Power score: fetch all `PlayerHero` with templates, compute stats via `calculateHeroStats()`, sum them

---

## F. Implementation Order

### Phase 1: Shared Types & DB (no dependencies)
1. **Create shared types**: Add `libs/shared/src/models/quest.ts`, `libs/shared/src/models/leaderboard.ts`, `libs/shared/src/models/profile.ts`
2. **Create quest definitions**: Add `libs/shared/src/constants/quest-definitions.ts`
3. **Update game config**: Add `quests` and `leaderboard` sections to `GAME_CONFIG`
4. **Update shared index**: Export new modules from `libs/shared/src/index.ts`
5. **Update Prisma schema**: Add `target` column to `DailyQuest`
6. **Run migration**: `npx prisma migrate dev --name add-quest-target`

### Phase 2: Backend - Daily Quests (depends on Phase 1)
7. **Update QuestsService**: Add `ensurePlayerQuests()`, `incrementQuestProgress()`, update `claimQuest()` and `getPlayerQuests()`
8. **Update ScheduledTasksService**: Change reset to delete old quests

### Phase 3: Backend - Leaderboard (depends on Phase 1)
9. **Extend RedisService**: Add sorted set methods (`zAdd`, `zRevRange`, `zRevRank`, `zScore`, `zCard`)
10. **Create LeaderboardModule**: `leaderboard.service.ts`, `leaderboard.controller.ts`, `leaderboard.module.ts`
11. **Register LeaderboardModule**: Update `app.module.ts`

### Phase 4: Backend - Integration Hooks (depends on Phases 2 & 3)
12. **Hook BattlesService**: Inject QuestsService + LeaderboardService, add progress tracking and score updates after battle completion and energy spend
13. **Hook HeroesService**: Inject QuestsService + LeaderboardService, add progress tracking and score updates after hero upgrade
14. **Update BattlesModule and HeroesModule**: Import QuestsModule and LeaderboardModule

### Phase 5: Backend - Player Profile (depends on Phase 1)
15. **Update PlayersService**: Add `getDetailedProfile()` with stats aggregation
16. **Update PlayersController**: Use new detailed profile method

### Phase 6: Frontend - Services (depends on Phases 2-5)
17. **Create QuestsService** (Angular): `apps/client/src/app/core/services/quests.service.ts`
18. **Create LeaderboardService** (Angular): `apps/client/src/app/core/services/leaderboard.service.ts`
19. **Create PlayerService** (Angular): `apps/client/src/app/core/services/player.service.ts`

### Phase 7: Frontend - Components (depends on Phase 6)
20. **Create QuestsComponent**: `apps/client/src/app/features/quests/quests.component.ts`
21. **Create LeaderboardComponent**: `apps/client/src/app/features/leaderboard/leaderboard.component.ts`
22. **Create ProfileComponent**: `apps/client/src/app/features/profile/profile.component.ts`

### Phase 8: Frontend - Integration (depends on Phase 7)
23. **Update app.routes.ts**: Add routes for `/quests`, `/leaderboard`, `/profile`
24. **Update LobbyComponent**: Add new menu cards, inject QuestsService for quest count

---

## G. File Summary

### New Files (13)
| File | Description |
|---|---|
| `libs/shared/src/models/quest.ts` | Quest type definitions and response interfaces |
| `libs/shared/src/models/leaderboard.ts` | Leaderboard entry/response interfaces |
| `libs/shared/src/models/profile.ts` | Enhanced player profile response interface |
| `libs/shared/src/constants/quest-definitions.ts` | Quest definitions array with rewards |
| `apps/api/src/leaderboard/leaderboard.service.ts` | Leaderboard business logic with Redis sorted sets |
| `apps/api/src/leaderboard/leaderboard.controller.ts` | GET /leaderboard/:type endpoint |
| `apps/api/src/leaderboard/leaderboard.module.ts` | NestJS module for leaderboard |
| `apps/client/src/app/core/services/quests.service.ts` | Angular service for quest API |
| `apps/client/src/app/core/services/leaderboard.service.ts` | Angular service for leaderboard API |
| `apps/client/src/app/core/services/player.service.ts` | Angular service for player profile API |
| `apps/client/src/app/features/quests/quests.component.ts` | Daily quests page component |
| `apps/client/src/app/features/leaderboard/leaderboard.component.ts` | Leaderboard page component |
| `apps/client/src/app/features/profile/profile.component.ts` | Player profile page component |

### Modified Files (13)
| File | Changes |
|---|---|
| `libs/shared/src/index.ts` | Export new models and constants |
| `libs/shared/src/constants/game-config.ts` | Add `quests` and `leaderboard` config sections |
| `apps/api/prisma/schema.prisma` | Add `target` column to DailyQuest |
| `apps/api/src/quests/quests.service.ts` | Add ensurePlayerQuests, incrementQuestProgress, update claimQuest |
| `apps/api/src/scheduled/scheduled-tasks.service.ts` | Change quest reset to delete-and-recreate |
| `apps/api/src/redis/redis.service.ts` | Add sorted set methods |
| `apps/api/src/app.module.ts` | Import LeaderboardModule |
| `apps/api/src/battles/battles.service.ts` | Add quest progress + leaderboard hooks |
| `apps/api/src/battles/battles.module.ts` | Import QuestsModule, LeaderboardModule |
| `apps/api/src/heroes/heroes.service.ts` | Add quest progress + leaderboard hooks |
| `apps/api/src/heroes/heroes.module.ts` | Import QuestsModule, LeaderboardModule |
| `apps/api/src/players/players.service.ts` | Add getDetailedProfile with stats aggregation |
| `apps/client/src/app/app.routes.ts` | Add quests, leaderboard, profile routes |
| `apps/client/src/app/features/lobby/lobby.component.ts` | Add new menu cards for quests, leaderboard, profile |
