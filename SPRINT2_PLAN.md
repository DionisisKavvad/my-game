# Sprint 2 Implementation Plan -- Heroes System

## 1. Executive Summary

Sprint 2 delivers the hero collection and management layer of the Hero Wars MVP. Players will be able to browse hero templates, receive starter heroes on registration, build a battle team, and upgrade heroes through leveling and star promotions. This sprint bridges the foundation (Sprint 1: auth, players, basic infrastructure) with the upcoming battle engine (Sprint 3).

**Scope:**
- Hero Templates API (read-only catalog of all available heroes)
- Player Heroes CRUD (list a player's owned heroes, with computed stats)
- Starter Hero Assignment (automatically grant 3 heroes on registration)
- Team Builder (set a battle team of up to 5 heroes with positions 0-4)
- Hero Upgrade System (XP gain, level-up, star upgrades, gold costs)
- Frontend: Hero collection UI, hero detail/upgrade view, team builder
- Shared types and game config additions

**Out of scope:** Equipment system (placeholder only), hero shard gacha, PvP teams.

---

## 2. Database Considerations

### 2.1 Schema Changes

**No Prisma schema changes are required.** The existing schema already fully supports Sprint 2:

- `HeroTemplate` model (string IDs, base stats, skills as JSON, sprite key)
- `PlayerHero` model (level, stars, xp, equipment JSON, isInTeam, teamPosition)
- Proper indexes on `player_heroes(player_id)` and a conceptual partial index for active team members

### 2.2 Seed Data

The existing `seed.ts` already contains 5 hero templates:
- `warrior_bold` -- Aric the Bold (common warrior)
- `mage_fire` -- Lyra the Wise (rare mage)
- `healer_light` -- Seraphina (rare healer)
- `archer_swift` -- Kael Swiftarrow (common archer)
- `tank_iron` -- Gorath Ironwall (epic tank)

No seed changes are needed.

### 2.3 Starter Heroes Configuration

We will define which heroes a new player receives. The starter set is 3 heroes (warrior, mage, healer) -- these are the most common/rare tier, giving players a balanced team to begin with. This is defined in `game-config.ts`, not hardcoded in the service.

---

## 3. Shared Library Additions

### 3.1 Game Config Updates

**File:** `libs/shared/src/constants/game-config.ts`

Add hero upgrade cost formulas and starter hero configuration to `GAME_CONFIG`:

```typescript
hero: {
  maxLevel: 100,
  maxStars: 7,
  xpPerLevel: (level: number): number => Math.floor(100 * Math.pow(1.15, level - 1)),
  // NEW additions:
  goldCostPerLevel: (level: number): number => Math.floor(50 * Math.pow(1.12, level - 1)),
  starUpgradeGoldCost: (currentStars: number): number => Math.floor(500 * Math.pow(2.5, currentStars - 1)),
  starUpgradeLevelRequirement: (targetStars: number): number => (targetStars - 1) * 10,
  maxTeamSize: 5,
  starterHeroTemplateIds: ['warrior_bold', 'mage_fire', 'healer_light'],
},
```

**Formulas rationale:**
- `goldCostPerLevel`: Starts at 50 gold for level 2, scales exponentially. At level 10 it costs ~147 gold, at level 50 it costs ~14,000 gold. This ensures gold remains valuable.
- `starUpgradeGoldCost`: Stars are major power spikes. 1->2 costs 500, 2->3 costs 1250, 3->4 costs 3125. Steep but achievable.
- `starUpgradeLevelRequirement`: Uses `(targetStars - 1) * 10` — so 2 stars requires level 10, 3 stars requires level 20, etc. Achievable early game while still gating higher stars behind meaningful progression.
- `maxTeamSize`: 5 heroes per battle team (positions 0-4).
- `starterHeroTemplateIds`: The 3 heroes granted on registration.

### 3.2 Shared Hero Type Additions

**File:** `libs/shared/src/models/hero.ts`

Add response/request interfaces used by both frontend and backend:

```typescript
// Add after existing interfaces:

export interface HeroTemplateResponse {
  id: string;
  name: string;
  class: HeroClass;
  rarity: HeroRarity;
  baseHp: number;
  baseAttack: number;
  baseDefense: number;
  baseSpeed: number;
  skills: HeroSkill[];
  spriteKey: string;
}

export interface PlayerHeroResponse {
  id: string;
  templateId: string;
  template: HeroTemplateResponse;
  level: number;
  stars: number;
  xp: number;
  xpToNextLevel: number;
  equipment: Record<string, string>;
  isInTeam: boolean;
  teamPosition: number | null;
  computedStats: HeroStats;
}

export interface UpgradeResult {
  hero: PlayerHeroResponse;
  goldSpent: number;
  playerGoldRemaining: number;
  levelsGained: number;
  starsGained: number;
}

export interface TeamUpdateRequest {
  heroPositions: { heroId: string; position: number }[];
}

export interface TeamResponse {
  heroes: PlayerHeroResponse[];
}
```

### 3.3 Shared Index Export

**File:** `libs/shared/src/index.ts`

No changes needed -- `hero.ts` and `game-config.ts` are already exported.

---

## 4. Backend Implementation -- NestJS Heroes Module

### 4.1 Module Structure

```
apps/api/src/heroes/
  heroes.module.ts
  heroes.controller.ts
  heroes.service.ts
  dto/
    update-team.dto.ts
    upgrade-hero.dto.ts
```

### 4.2 File: `heroes.module.ts`

Standard NestJS module following the existing pattern (see `battles.module.ts`):

```typescript
import { Module } from '@nestjs/common';
import { HeroesController } from './heroes.controller';
import { HeroesService } from './heroes.service';

@Module({
  controllers: [HeroesController],
  providers: [HeroesService],
  exports: [HeroesService],
})
export class HeroesModule {}
```

Export `HeroesService` so `AuthModule` can import it for starter hero assignment.

> **Note:** `PrismaModule` is already decorated with `@Global()` (see `prisma.module.ts`), so `PrismaService` is available for injection in all modules without explicit import. No additional imports are needed here.

### 4.3 File: `heroes.controller.ts`

Endpoints following the REST conventions in the architecture doc and the pattern from `battles.controller.ts`:

```typescript
@Controller('heroes')
@UseGuards(JwtAuthGuard)
export class HeroesController {
  constructor(private heroesService: HeroesService) {}

  // --- Static path routes FIRST (before :id) ---

  // GET /heroes/templates -- List all hero templates (catalog)
  @Get('templates')
  getTemplates() { ... }

  // GET /heroes/templates/:id -- Get single template details
  @Get('templates/:id')
  getTemplate(@Param('id') id: string) { ... }

  // GET /heroes/team -- Get current battle team
  @Get('team')
  getTeam(@Req() req) { ... }

  // PUT /heroes/team -- Set battle team
  @Put('team')
  updateTeam(@Req() req, @Body() dto: UpdateTeamDto) { ... }

  // --- Parameterized routes AFTER static paths ---

  // GET /heroes -- List current player's heroes
  @Get()
  getMyHeroes(@Req() req) { ... }

  // GET /heroes/:id -- Get single player hero detail
  @Get(':id')
  getMyHero(@Req() req, @Param('id') id: string) { ... }

  // POST /heroes/:id/upgrade -- Level up or star-upgrade a hero
  @Post(':id/upgrade')
  upgradeHero(@Req() req, @Param('id') id: string, @Body() dto: UpgradeHeroDto) { ... }
}
```

**Routing note:** Static path routes (`templates`, `team`) are declared BEFORE parameterized routes (`:id`) to prevent NestJS from matching "team" or "templates" as an `:id` value. This ordering is critical.

### 4.4 File: `heroes.service.ts`

The service contains all business logic. Key methods:

#### `getTemplates(): Promise<HeroTemplateResponse[]>`
- `prisma.heroTemplate.findMany()` -- return all templates
- Parse skills JSON back to typed array

#### `getTemplate(id: string): Promise<HeroTemplateResponse>`
- `prisma.heroTemplate.findUnique({ where: { id } })`
- Throw `NotFoundException` if not found

#### `getPlayerHeroes(playerId: string): Promise<PlayerHeroResponse[]>`
- `prisma.playerHero.findMany({ where: { playerId }, include: { template: true } })`
- For each hero, compute `xpToNextLevel` and `computedStats` using shared functions

#### `getPlayerHero(playerId: string, heroId: string): Promise<PlayerHeroResponse>`
- Find by id, verify ownership via `playerId`, include template
- Throw `NotFoundException` if not found or not owned

#### `assignStarterHeroes(playerId: string, tx?: PrismaTransactionClient): Promise<void>`
- Called during registration (from AuthService) within a `$transaction`
- Accepts an optional Prisma transaction client (`tx`); falls back to `this.prisma` if not provided
- Type: `type PrismaTransactionClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0]`
- Guard: check if player already has heroes (prevents duplicates on retry)
- Read `GAME_CONFIG.hero.starterHeroTemplateIds`
- Create 3 `PlayerHero` records: level 1, stars 1, xp 0
- First 3 heroes are auto-assigned to team (positions 0, 1, 2)
- Use `db.playerHero.createMany()` where `db = tx ?? this.prisma`

#### `upgradeHero(playerId: string, heroId: string, dto: UpgradeHeroDto): Promise<UpgradeResult>`
- DTO specifies `type: 'level' | 'star'`
- **Level upgrade logic:**
  1. Verify hero is owned by player
  2. Check hero is not already at `maxLevel`
  3. Check hero has enough XP: `hero.xp >= GAME_CONFIG.hero.xpPerLevel(hero.level)`
  4. Calculate gold cost: `GAME_CONFIG.hero.goldCostPerLevel(hero.level)`
  5. Verify player has enough gold
  6. Atomic transaction: deduct XP by `xpPerLevel(currentLevel)`, increment level by 1, deduct gold from player
  7. Return updated hero with new computed stats
- **Star upgrade logic:**
  1. Verify hero is owned by player
  2. Check hero is not at `maxStars`
  3. Check hero meets level requirement: `hero.level >= starUpgradeLevelRequirement(hero.stars + 1)`
  4. Calculate gold cost: `starUpgradeGoldCost(hero.stars)`
  5. Verify player has enough gold
  6. Atomic transaction: increment stars, deduct gold
  7. Return updated hero with new computed stats

#### `updateTeam(playerId: string, dto: UpdateTeamDto): Promise<TeamResponse>`
- DTO: `{ heroPositions: { heroId: string; position: number }[] }`
- Validate:
  - Array length <= `GAME_CONFIG.hero.maxTeamSize` (5)
  - All positions are 0-4 and unique
  - All heroIds belong to the player
  - No duplicate heroIds
- Atomic transaction:
  1. Reset all player's heroes: `isInTeam = false, teamPosition = null`
  2. Set each specified hero: `isInTeam = true, teamPosition = position`
- Return the updated team

#### `getTeam(playerId: string): Promise<TeamResponse>`
- `prisma.playerHero.findMany({ where: { playerId, isInTeam: true }, include: { template: true }, orderBy: { teamPosition: 'asc' } })`
- Map to `PlayerHeroResponse[]` with computed stats

#### `addXp(playerId: string, heroId: string, amount: number): Promise<PlayerHeroResponse>`
- Verify hero exists and is owned by player
- Validate `amount > 0`
- Increment hero XP: `prisma.playerHero.update({ where: { id: heroId }, data: { xp: { increment: amount } } })`
- Return updated hero with computed stats and `xpToNextLevel`
- **Note:** This method is called by the battle completion flow (Sprint 3). We implement it now so the heroes module API is complete and testable independently.

### 4.5 DTO Files

**File:** `dto/upgrade-hero.dto.ts`
```typescript
import { IsIn, IsString } from 'class-validator';

export class UpgradeHeroDto {
  @IsString()
  @IsIn(['level', 'star'])
  type!: 'level' | 'star';
}
```

**File:** `dto/update-team.dto.ts`
```typescript
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsInt, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export class HeroPositionDto {
  @IsUUID()
  heroId!: string;

  @IsInt()
  @Min(0)
  @Max(4)
  position!: number;
}

export class UpdateTeamDto {
  @ValidateNested({ each: true })
  @Type(() => HeroPositionDto)
  @ArrayMinSize(0)
  @ArrayMaxSize(5)
  heroPositions!: HeroPositionDto[];
}
```

### 4.6 Register AppModule

**File:** `apps/api/src/app.module.ts`

Add `HeroesModule` to the imports array alongside existing modules.

### 4.7 Starter Hero Assignment in Auth

**File:** `apps/api/src/auth/auth.module.ts`

Import `HeroesModule` so `AuthService` can inject `HeroesService`.

**File:** `apps/api/src/auth/auth.service.ts`

Modify the `register()` method to wrap player creation AND starter hero assignment in a single `$transaction`. Inject `HeroesService` in the constructor.

```typescript
// In register(), replace the standalone player.create() with:
const player = await this.prisma.$transaction(async (tx) => {
  const p = await tx.player.create({
    data: {
      username: dto.username,
      email: dto.email,
      passwordHash,
      gold: GAME_CONFIG.player.startingGold,
      gems: GAME_CONFIG.player.startingGems,
      energy: GAME_CONFIG.player.startingEnergy,
      maxEnergy: GAME_CONFIG.energy.maxEnergy,
    },
  });
  await this.heroesService.assignStarterHeroes(p.id, tx);
  return p;
});
```

This ensures atomicity: if starter hero assignment fails, the player creation is rolled back — no player ever exists without heroes.

**Important:** `assignStarterHeroes` must accept an optional Prisma transaction client (`tx`) parameter so it can run within the registration transaction. See Section 4.4 for the updated method signature.

---

## 5. Backend: Detailed Method Specifications

### 5.1 Stats Computation

Every `PlayerHeroResponse` includes `computedStats` calculated using the existing `calculateHeroStats()` from `libs/shared/src/models/hero.ts`:

```typescript
const stats = calculateHeroStats(hero.template, hero.level, hero.stars);
```

This function already exists and uses:
- `levelMultiplier = 1 + (level - 1) * 0.1` (10% per level)
- `starMultiplier = 1 + (stars - 1) * 0.15` (15% per star)

### 5.2 XP System

Heroes gain XP from battles (Sprint 3 will wire this up). For Sprint 2, the upgrade endpoint assumes XP has already been accumulated on the hero. The level-up flow:

1. Hero accumulates XP (from battles, quests, etc.)
2. When `hero.xp >= xpPerLevel(hero.level)`, the hero is eligible for level-up
3. Player calls `POST /heroes/:id/upgrade` with `type: 'level'`
4. Server deducts `xpPerLevel(currentLevel)` from hero XP, increments level
5. Remaining XP carries over (no waste)

**XP per level formula** (already in game-config):
```
xpPerLevel(level) = floor(100 * 1.15^(level-1))
```
- Level 1->2: 100 XP
- Level 5->6: 175 XP
- Level 10->11: 352 XP
- Level 20->21: 1,637 XP

### 5.3 Gold Costs

**Level-up gold cost:**
```
goldCostPerLevel(level) = floor(50 * 1.12^(level-1))
```
- Level 1->2: 50 gold
- Level 10->11: 139 gold
- Level 20->21: 482 gold

**Star upgrade gold cost:**
```
starUpgradeGoldCost(currentStars) = floor(500 * 2.5^(currentStars-1))
```
- 1->2 stars: 500 gold
- 2->3 stars: 1,250 gold
- 3->4 stars: 3,125 gold
- 4->5 stars: 7,812 gold
- 5->6 stars: 19,531 gold
- 6->7 stars: 48,828 gold

**Star upgrade level requirement:**
```
starUpgradeLevelRequirement(targetStars) = (targetStars - 1) * 10
```
- 2 stars: requires level 10
- 3 stars: requires level 20
- 4 stars: requires level 30
- 7 stars: requires level 60

### 5.4 Validation Rules Summary

| Endpoint | Validations |
|----------|------------|
| GET /heroes/templates | None (public catalog) |
| GET /heroes/templates/:id | Template exists |
| GET /heroes | Auth only |
| GET /heroes/:id | Auth + ownership check |
| POST /heroes/:id/upgrade (level) | Auth, ownership, not max level, sufficient XP, sufficient gold |
| POST /heroes/:id/upgrade (star) | Auth, ownership, not max stars, meets level req, sufficient gold |
| PUT /heroes/team | Auth, max 5, positions 0-4, unique positions, unique heroes, all owned |
| GET /heroes/team | Auth only |

---

## 6. Frontend Implementation -- Angular

### 6.1 New Files Structure

```
apps/client/src/app/
  core/services/
    heroes.service.ts           (NEW)
  features/heroes/
    heroes-list.component.ts    (NEW)
    hero-detail.component.ts    (NEW)
    team-builder.component.ts   (NEW)
```

### 6.2 File: `core/services/heroes.service.ts`

Angular service wrapping the heroes API, following the pattern from `auth.service.ts`:

```typescript
@Injectable({ providedIn: 'root' })
export class HeroesService {
  readonly heroes = signal<PlayerHeroResponse[]>([]);
  readonly templates = signal<HeroTemplateResponse[]>([]);
  readonly team = signal<PlayerHeroResponse[]>([]);

  constructor(private api: ApiService) {}

  loadTemplates(): Observable<HeroTemplateResponse[]> { ... }
  loadMyHeroes(): Observable<PlayerHeroResponse[]> { ... }
  loadTeam(): Observable<PlayerHeroResponse[]> { ... }
  getHeroDetail(heroId: string): Observable<PlayerHeroResponse> { ... }
  upgradeHero(heroId: string, type: 'level' | 'star'): Observable<UpgradeResult> { ... }
  updateTeam(heroPositions: { heroId: string; position: number }[]): Observable<TeamResponse> { ... }
}
```

Uses Angular signals for reactive state (consistent with `AuthService.player` signal pattern).

### 6.3 File: `features/heroes/heroes-list.component.ts`

Standalone component showing the player's hero collection:

- **Route:** `/heroes`
- **Data:** Loads player heroes on init via `HeroesService.loadMyHeroes()`
- **Display:** Grid of hero cards showing:
  - Hero portrait placeholder (sprite key based)
  - Hero name, class, rarity (color-coded)
  - Level and star rating
  - Computed stats summary (HP, ATK, DEF, SPD)
  - "In Team" badge if `isInTeam`
- **Actions:** Click a hero card to navigate to `/heroes/:id`
- **Styling:** Consistent with lobby component (dark theme, #0f3460 cards, #e94560 accents)

### 6.4 File: `features/heroes/hero-detail.component.ts`

Standalone component for viewing and upgrading a single hero:

- **Route:** `/heroes/:id`
- **Data:** Loads hero detail via `HeroesService.getHeroDetail(id)`
- **Display:**
  - Hero name, class, rarity
  - Star display (filled/empty stars up to maxStars)
  - Level and XP progress bar (`hero.xp / hero.xpToNextLevel`)
  - Full computed stats (HP, Attack, Defense, Speed)
  - Skills list with descriptions, damage, cooldown
  - Equipment slots (placeholder/disabled for Sprint 2)
- **Actions:**
  - "Level Up" button -- calls `upgradeHero(id, 'level')`, shows gold cost, disabled if insufficient XP/gold/max level
  - "Star Up" button -- calls `upgradeHero(id, 'star')`, shows gold cost + level requirement, disabled if ineligible
  - "Back" button to return to hero list
- **Feedback:** After upgrade, refresh hero data, show brief success toast, update player gold in AuthService

### 6.5 File: `features/heroes/team-builder.component.ts`

Standalone component for managing the battle team:

- **Route:** `/heroes/team`
- **Data:** Loads team + all heroes on init
- **Display:**
  - 5 position slots (0-4) displayed horizontally
  - Each slot shows assigned hero card or empty placeholder
  - Below slots: scrollable list of available (unassigned) heroes
- **Actions:**
  - Drag-and-drop or click to assign a hero to a slot
  - Click assigned hero to remove from slot
  - "Save Team" button -- calls `updateTeam()` with current positions
  - "Back" button
- **Validation (client-side):**
  - Max 5 heroes
  - No duplicate heroes
  - Positions 0-4

### 6.6 Route Updates

**File:** `apps/client/src/app/app.routes.ts`

Add hero routes:

```typescript
{
  path: 'heroes',
  loadComponent: () =>
    import('./features/heroes/heroes-list.component').then((m) => m.HeroesListComponent),
  canActivate: [authGuard],
},
{
  path: 'heroes/team',
  loadComponent: () =>
    import('./features/heroes/team-builder.component').then((m) => m.TeamBuilderComponent),
  canActivate: [authGuard],
},
{
  path: 'heroes/:id',
  loadComponent: () =>
    import('./features/heroes/hero-detail.component').then((m) => m.HeroDetailComponent),
  canActivate: [authGuard],
},
```

**Important:** The `/heroes/team` route MUST come before `/heroes/:id` to avoid `:id` matching "team".

### 6.7 Lobby Component Update

**File:** `apps/client/src/app/features/lobby/lobby.component.ts`

Change the Heroes menu card from disabled to active, linking to `/heroes`:

```html
<div class="menu-card" routerLink="/heroes">
  <h3>Heroes</h3>
  <p>Manage your hero collection</p>
</div>
```

Add `RouterLink` to the component imports.

---

## 7. File-by-File Implementation Order

Implementation proceeds in dependency order. Each step builds on the previous.

### Phase A: Shared Types and Config (foundation for both backend and frontend)

| # | File | Action | Description |
|---|------|--------|-------------|
| A1 | `libs/shared/src/constants/game-config.ts` | EDIT | Add `goldCostPerLevel`, `starUpgradeGoldCost`, `starUpgradeLevelRequirement`, `maxTeamSize`, `starterHeroTemplateIds` |
| A2 | `libs/shared/src/models/hero.ts` | EDIT | Add `HeroTemplateResponse`, `PlayerHeroResponse`, `UpgradeResult`, `TeamUpdateRequest`, `TeamResponse` interfaces |

### Phase B: Backend Heroes Module (core API)

| # | File | Action | Description |
|---|------|--------|-------------|
| B1 | `apps/api/src/heroes/dto/upgrade-hero.dto.ts` | CREATE | DTO for upgrade requests (`type: 'level' \| 'star'`) |
| B2 | `apps/api/src/heroes/dto/update-team.dto.ts` | CREATE | DTO for team update with nested validation |
| B3 | `apps/api/src/heroes/heroes.service.ts` | CREATE | All business logic: CRUD, upgrades, team management, starter assignment |
| B4 | `apps/api/src/heroes/heroes.controller.ts` | CREATE | REST endpoints: templates, player heroes, upgrade, team |
| B5 | `apps/api/src/heroes/heroes.module.ts` | CREATE | Module declaration, exports HeroesService |

### Phase C: Backend Integration (wire into existing modules)

| # | File | Action | Description |
|---|------|--------|-------------|
| C1 | `apps/api/src/app.module.ts` | EDIT | Add `HeroesModule` to imports |
| C2 | `apps/api/src/auth/auth.module.ts` | EDIT | Import `HeroesModule` for starter hero access |
| C3 | `apps/api/src/auth/auth.service.ts` | EDIT | Inject `HeroesService`, call `assignStarterHeroes()` in `register()` |

### Phase D: Frontend Service Layer

| # | File | Action | Description |
|---|------|--------|-------------|
| D1 | `apps/client/src/app/core/services/heroes.service.ts` | CREATE | API wrapper with signals for heroes, templates, team state |

### Phase E: Frontend Components

| # | File | Action | Description |
|---|------|--------|-------------|
| E1 | `apps/client/src/app/features/heroes/heroes-list.component.ts` | CREATE | Hero collection grid view |
| E2 | `apps/client/src/app/features/heroes/hero-detail.component.ts` | CREATE | Single hero view with upgrade actions |
| E3 | `apps/client/src/app/features/heroes/team-builder.component.ts` | CREATE | Team position management UI |

### Phase F: Frontend Routing and Integration

| # | File | Action | Description |
|---|------|--------|-------------|
| F1 | `apps/client/src/app/app.routes.ts` | EDIT | Add `/heroes`, `/heroes/team`, `/heroes/:id` routes |
| F2 | `apps/client/src/app/features/lobby/lobby.component.ts` | EDIT | Enable Heroes menu card with routerLink |

### Total: 6 new files, 7 edited files

---

## 8. Testing Strategy

### 8.1 Backend Unit Tests

**File:** `apps/api/src/heroes/heroes.service.spec.ts`

Test the service with mocked PrismaService:

| Test Case | Description |
|-----------|-------------|
| `getTemplates` | Returns all seeded templates with parsed skills |
| `getTemplate` -- found | Returns single template by ID |
| `getTemplate` -- not found | Throws NotFoundException |
| `getPlayerHeroes` | Returns heroes with computed stats and xpToNextLevel |
| `getPlayerHero` -- owned | Returns hero detail |
| `getPlayerHero` -- not owned | Throws NotFoundException |
| `assignStarterHeroes` | Creates 3 heroes, auto-assigns to team positions 0-2 |
| `assignStarterHeroes` -- idempotent | Does not duplicate if called twice (guard against race conditions) |
| `upgradeHero` -- level success | Deducts XP and gold, increments level |
| `upgradeHero` -- level insufficient XP | Throws BadRequestException |
| `upgradeHero` -- level insufficient gold | Throws BadRequestException |
| `upgradeHero` -- level at max | Throws BadRequestException |
| `upgradeHero` -- star success | Deducts gold, increments stars |
| `upgradeHero` -- star insufficient level | Throws BadRequestException |
| `upgradeHero` -- star insufficient gold | Throws BadRequestException |
| `upgradeHero` -- star at max | Throws BadRequestException |
| `updateTeam` -- valid | Sets isInTeam and positions correctly |
| `updateTeam` -- empty team | Clears all team assignments |
| `updateTeam` -- too many heroes | Throws BadRequestException |
| `updateTeam` -- duplicate positions | Throws BadRequestException |
| `updateTeam` -- duplicate heroIds | Throws BadRequestException |
| `updateTeam` -- hero not owned | Throws NotFoundException |
| `getTeam` | Returns team ordered by position |
| `addXp` -- success | Increments hero XP, returns updated hero |
| `addXp` -- hero not owned | Throws NotFoundException |
| `addXp` -- zero or negative amount | Throws BadRequestException |

**File:** `apps/api/src/heroes/heroes.controller.spec.ts`

Test controller routing and guard application (lighter tests, service is mocked):
- Verify `JwtAuthGuard` is applied to all endpoints
- Verify correct service method is called for each route
- Verify DTO validation rejects invalid payloads

### 8.2 Backend Integration Tests

**File:** `apps/api/test/heroes.e2e-spec.ts`

Full HTTP integration tests against a test database:

| Test Flow | Steps |
|-----------|-------|
| Registration + starter heroes | Register a new player, verify GET /heroes returns 3 starter heroes |
| Template catalog | GET /heroes/templates returns 5 templates |
| Hero upgrade flow | Register, get hero, add XP (direct DB), upgrade level, verify stats changed |
| Star upgrade flow | Set hero to required level (direct DB), star upgrade, verify |
| Team builder flow | Register, PUT /heroes/team with 3 heroes, GET /heroes/team, verify positions |
| Error cases | Upgrade without gold, upgrade at max level, team with invalid positions |

### 8.3 Shared Library Tests

**File:** `libs/shared/src/constants/game-config.spec.ts`

Test the new formula functions:
- `goldCostPerLevel` returns expected values at key levels (1, 10, 50, 100)
- `starUpgradeGoldCost` returns expected values for each star tier
- `starUpgradeLevelRequirement` returns correct thresholds
- Verify formulas never return negative or NaN values

### 8.4 Frontend Tests

**File:** `apps/client/src/app/core/services/heroes.service.spec.ts`
- Mock `ApiService`, verify correct endpoints called
- Verify signal updates after API responses

**File:** `apps/client/src/app/features/heroes/heroes-list.component.spec.ts`
- Renders hero cards from signal data
- Click navigates to detail route

**File:** `apps/client/src/app/features/heroes/hero-detail.component.spec.ts`
- Displays hero stats, skills, level/star info
- Upgrade button disabled when insufficient resources
- Upgrade button calls service method

**File:** `apps/client/src/app/features/heroes/team-builder.component.spec.ts`
- Renders 5 position slots
- Assigning hero updates local state
- Save calls service with correct positions

---

## 9. Key Design Decisions

### 9.1 Starter Hero Assignment Location

**Decision:** Call `assignStarterHeroes()` from `AuthService.register()`, not from a database trigger or separate endpoint.

**Rationale:** Keeps the flow explicit and testable. If assignment fails, registration fails -- the player never exists without heroes. This matches the game design where heroes are the core progression mechanic.

### 9.2 Upgrade as Explicit Action

**Decision:** Level-up is an explicit player action (POST request), not automatic when XP threshold is reached.

**Rationale:** Mirrors the Hero Wars game design where players choose when to invest gold in upgrades. This adds a strategic gold management element. XP accumulation happens passively through battles; spending gold to level up is the active choice.

### 9.3 Team Can Be Empty

**Decision:** Players can save an empty team (0 heroes). The battle system (Sprint 3) will enforce minimum team size at battle start.

**Rationale:** Simpler validation in Sprint 2. Team management is about arrangement, not enforcement. Battle requirements belong in the battle module.

### 9.4 No Separate Team Endpoint Prefix

**Decision:** Team endpoints live under `/heroes/team` rather than a separate `/team` controller.

**Rationale:** Teams are a view of heroes. The data is in `player_heroes` table. A separate controller would be an unnecessary abstraction for what is essentially hero state management.

### 9.5 Template Endpoint Under Heroes Controller

**Decision:** Templates are at `/heroes/templates` rather than a separate `/templates` controller.

**Rationale:** Templates are the hero catalog. From a REST perspective, they are a sub-resource of the heroes domain. This keeps all hero-related endpoints under one controller.

---

## 10. Risk Assessment and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Circular dependency: AuthModule <-> HeroesModule | Build failure | HeroesModule exports HeroesService; AuthModule imports HeroesModule. One-way dependency, no circular. |
| Route collision: `/heroes/team` vs `/heroes/:id` | Wrong endpoint called | Declare specific routes before parameterized routes in both controller and Angular router. |
| Race condition on team update | Inconsistent team state | Use Prisma transaction for the reset-then-set pattern. |
| Gold overflow on high-level upgrades | Integer overflow | Gold costs are bounded (max level 100, max stars 7). Max possible gold cost is ~48K for star 6->7. Int32 handles this. |
| Starter hero duplicate on retry | Duplicate heroes | Add a guard in `assignStarterHeroes`: check if player already has heroes before creating. |

---

## 11. Dependencies Between Sprints

### What Sprint 2 Provides for Sprint 3 (Battle Engine):
- `GET /heroes/team` -- Battle module will call this to get the player's team for battle
- `HeroesService.getTeam()` -- Can be injected into BattlesService
- `calculateHeroStats()` -- Already exists, used by both heroes and battle modules
- `PlayerHeroResponse.computedStats` -- Battle engine needs these stats

### What Sprint 2 Defers to Sprint 3+:
- **XP Grant:** Battles will call `heroesService.addXp(playerId, heroId, amount)` after victories. This method is included in Sprint 2's `HeroesService` (see Section 4.4) and is fully tested, but will only be called from the battle completion flow in Sprint 3.
- **Equipment:** Slots exist in the schema (`equipment` JSON field) but are not used in Sprint 2. The UI shows them as locked/placeholder.
- **Hero Shard System:** Not in MVP scope. Star upgrades use gold only.

---

## 12. Implementation Notes

### 12.1 Prisma JSON Handling

The `skills` field on `HeroTemplate` is stored as `Json` in Prisma. When reading, Prisma returns it as `Prisma.JsonValue`. The service layer must cast/parse it to `HeroSkill[]`:

```typescript
const skills = template.skills as unknown as HeroSkill[];
```

This is consistent with how `seed.ts` stores skills via `JSON.stringify()`.

### 12.2 Transaction Pattern

Follow the pattern established in `battles.service.ts` for atomic operations:

```typescript
await this.prisma.$transaction(async (tx) => {
  // All reads and writes within the transaction
});
```

### 12.3 Logging Pattern

Use `StructuredLogger` for all significant events, following auth service conventions:

```typescript
StructuredLogger.info('heroes.upgrade.level', { playerId, heroId, newLevel: hero.level + 1, goldCost });
StructuredLogger.info('heroes.team.updated', { playerId, teamSize: dto.heroPositions.length });
StructuredLogger.info('heroes.starter.assigned', { playerId, heroCount: 3 });
```

### 12.4 Frontend Signal Pattern

Follow the `AuthService` pattern of using Angular signals for reactive state:

```typescript
readonly heroes = signal<PlayerHeroResponse[]>([]);
```

Components read signals directly in templates. Service methods update signals after successful API calls.

---

## 13. Summary Checklist

- [ ] A1: Update game-config.ts with hero upgrade formulas and starter config
- [ ] A2: Add shared response/request types to hero.ts
- [ ] B1-B5: Create heroes module (DTOs, service incl. addXp method, controller, module)
- [ ] C1: Register HeroesModule in AppModule
- [ ] C2-C3: Wire starter hero assignment into AuthService registration
- [ ] D1: Create frontend HeroesService
- [ ] E1: Create heroes list component
- [ ] E2: Create hero detail component
- [ ] E3: Create team builder component
- [ ] F1: Add hero routes to app.routes.ts
- [ ] F2: Enable Heroes card in lobby
- [ ] Tests: Unit tests for service, controller, shared formulas
- [ ] Tests: E2E tests for hero flows
- [ ] Tests: Frontend component tests

---

## Review Feedback

**Reviewer:** plan-reviewer
**Date:** 2026-02-22
**Verdict:** APPROVED ~~with required changes~~ — all 5 blockers resolved (7 recommendations remain)

Overall this is a well-structured, thorough plan that follows existing patterns and correctly leverages the shared library. The implementation order is sound, the testing strategy covers the important paths, and the design decisions are well-reasoned. Below are issues organized by severity.

---

### BLOCKERS (must fix before implementation)

#### B1. Auth-Heroes Circular Dependency Risk is Real

The plan correctly identifies the one-way dependency (AuthModule imports HeroesModule), but the current `AuthModule` does NOT import `PrismaModule` directly -- it relies on `PrismaModule` being global or imported elsewhere. `HeroesService` depends on `PrismaService`. If `HeroesModule` does not import `PrismaModule`, the injection will fail at runtime.

**Fix:** Either:
- Verify `PrismaModule` is marked `@Global()` (check `prisma.module.ts`), OR
- Explicitly import `PrismaModule` in `HeroesModule`

Also, consider using `forwardRef()` as a safety net, or better yet, extract the `assignStarterHeroes` logic into a small standalone service/function that both modules can use without cross-module imports. The cleanest approach: keep `HeroesModule` independent and have the `AuthController` (or a registration event listener) call `HeroesService` via a NestJS event (`EventEmitter2`) instead of a direct import. This fully decouples the modules.

#### B2. Star Upgrade Level Requirements are Too High

The formula `starUpgradeLevelRequirement(targetStars) = targetStars * 10` means:
- 2 stars requires level **20**
- 3 stars requires level **30**
- 7 stars requires level **70**

But the XP required to reach level 20 is cumulative: sum of `floor(100 * 1.15^(n-1))` for n=1..19 = approximately **5,480 XP**. Combined with the gold cost at each level (cumulative ~2,900 gold for levels 1-20), this means a player needs thousands of XP and gold just to earn the first star upgrade.

With starting gold of 500 and XP only coming from battles (Sprint 3, which awards ~50 XP per victory), reaching the first star upgrade would take **110+ battles minimum**, which is extremely grindy for a 2-star upgrade on a common hero.

**Fix:** Lower the formula to `starUpgradeLevelRequirement(targetStars) = (targetStars - 1) * 10` so:
- 2 stars = level 10 (more achievable early)
- 3 stars = level 20
- 7 stars = level 60

Or even `5 + (targetStars - 2) * 10` for: 2 stars=5, 3 stars=15, 4 stars=25, etc.

#### B3. Registration Transaction is Not Atomic

The plan says: "If hero assignment fails, the entire registration should fail (wrap in a transaction or let the error propagate)." But the proposed code calls `assignStarterHeroes` AFTER `player.create()` completes. If `assignStarterHeroes` fails (e.g., invalid template ID, DB constraint), the player exists without heroes -- a broken state.

**Fix:** Wrap the entire registration in a single Prisma `$transaction`:

```typescript
const player = await this.prisma.$transaction(async (tx) => {
  const p = await tx.player.create({ data: { ... } });
  await tx.playerHero.createMany({
    data: starterHeroTemplateIds.map((templateId, i) => ({
      playerId: p.id,
      templateId,
      isInTeam: true,
      teamPosition: i,
    })),
  });
  return p;
});
```

This means `assignStarterHeroes` should accept a Prisma transaction client (`tx`) as a parameter, not use `this.prisma` directly.

#### B4. Missing `addXp` Method in Service

Section 11 mentions: "We should add this method to HeroesService now... but it will only be called from the battle completion flow." However, the method is not listed in Section 4.4's method specifications, not included in the testing strategy (Section 8), and not in the implementation checklist (Section 13).

**Fix:** Either:
- Add `addXp(playerId: string, heroId: string, amount: number)` to the service specification in Section 4.4, include it in tests, and add it to the checklist. OR
- Explicitly defer it to Sprint 3 and remove the mention from Section 11. Do not leave it ambiguous.

#### B5. Route Order Conflict Between `GET /heroes/team` and `GET /heroes/:id`

The plan correctly identifies this routing issue (Section 4.3 and 6.6) but the controller definition in Section 4.3 lists endpoints in this order:
1. `GET /heroes/templates`
2. `GET /heroes/templates/:id`
3. `GET /heroes`
4. **`GET /heroes/:id`** (comes BEFORE `PUT /heroes/team` and `GET /heroes/team`)
5. `POST /heroes/:id/upgrade`
6. `PUT /heroes/team`
7. `GET /heroes/team`

The `:id` route at position 4 will match "team" as an ID before NestJS reaches the team routes at positions 6-7. The warning note at the bottom of 4.3 says "team and templates routes must be declared BEFORE the :id parameter routes" but the actual listing contradicts this.

**Fix:** Reorder the controller methods in Section 4.3 to:
1. `GET /heroes/templates`
2. `GET /heroes/templates/:id`
3. `GET /heroes/team` (BEFORE `:id`)
4. `PUT /heroes/team` (BEFORE `:id`)
5. `GET /heroes`
6. `GET /heroes/:id`
7. `POST /heroes/:id/upgrade`

---

### RECOMMENDATIONS (should fix, not blocking)

#### R1. Templates Endpoint Should Not Require Auth

Section 5.4 shows `GET /heroes/templates` as "None (public catalog)" but the controller in Section 4.3 applies `@UseGuards(JwtAuthGuard)` at the class level, which means ALL endpoints require auth -- including templates.

**Fix:** Either:
- Remove class-level guard and apply `@UseGuards(JwtAuthGuard)` per-method (excluding templates), OR
- Keep templates behind auth (simpler, prevents data scraping) and update Section 5.4 to say "Auth required" for templates too

The second option is simpler and recommended for MVP.

#### R2. Missing Error Type Imports

The service specification mentions `BadRequestException` for validation failures (insufficient gold, max level, etc.) but this is not imported or listed. The existing codebase uses `ConflictException`, `NotFoundException`, `UnauthorizedException`, `ForbiddenException` from `@nestjs/common`. `BadRequestException` is the correct choice for "insufficient resources" type errors, but the plan should be explicit.

**Fix:** Add a note that the service should import and use `BadRequestException` from `@nestjs/common` for business rule violations (insufficient gold, max level reached, insufficient XP, level requirement not met).

#### R3. Consider Player Gold Update After Upgrade on Frontend

Section 6.4 mentions "update player gold in AuthService" after an upgrade. This implies the frontend `AuthService` holds the player state including gold. The `UpgradeResult` response already includes `playerGoldRemaining`, so this should work, but the plan should specify HOW the gold is synchronized. If `AuthService` has a `player` signal, the heroes service or component needs to update it.

**Fix:** Add a specific note about cross-service state synchronization. For example:
```typescript
// In hero-detail component, after upgrade:
this.authService.updatePlayerGold(result.playerGoldRemaining);
```
This requires `AuthService` to expose a method or writable signal for gold updates.

#### R4. No Rate Limiting on Upgrade Endpoint

The auth endpoints have `@Throttle()` applied. The upgrade endpoint `POST /heroes/:id/upgrade` has no rate limiting mentioned. A player could spam upgrade requests. While the gold check prevents abuse, rapid-fire requests could cause race conditions on the gold deduction.

**Fix:** Either:
- Apply `@Throttle({ default: { limit: 10, ttl: 60000 } })` to the upgrade endpoint, OR
- Rely on the global ThrottlerModule (60 req/min) configured in AppModule -- this is probably sufficient for MVP

The global throttle from AppModule should suffice, but the plan should explicitly call this out as the mitigation.

#### R5. `createMany` Does Not Support `returning` in All Prisma Versions

Section 4.4 uses `prisma.playerHero.createMany()` for starter heroes. In PostgreSQL, `createMany` does support `skipDuplicates` but does NOT return the created records in older Prisma versions. If the return values are needed (e.g., for the registration response to include heroes), use individual `create()` calls or `createManyAndReturn()` (Prisma 5.14.0+).

**Fix:** Verify the project's Prisma version supports `createManyAndReturn()` if starter heroes need to be returned. If not, `createMany` is fine since the registration response only returns player data (not heroes).

#### R6. Missing Frontend `ApiService` Pattern

Section 6.2 references `ApiService` as a dependency of `HeroesService`, but the plan doesn't describe its interface or confirm it exists. The existing `auth.service.ts` in the backend uses `HttpClient` directly (there's no `ApiService` wrapper visible in the frontend code). The plan should verify whether an `ApiService` wrapper exists in `apps/client/src/app/core/api/` or whether `HttpClient` should be used directly.

**Fix:** Check existing frontend code for `ApiService`. If it doesn't exist, either create it as a thin wrapper or use `HttpClient` directly (matching whatever pattern is already established in the frontend).

#### R7. Equipment JSON Field Typing

The plan correctly uses `Record<string, string>` for equipment in the shared types. However, the Prisma schema stores it as `Json @default("{}")`. When reading from Prisma, this comes back as `Prisma.JsonValue`, not `Record<string, string>`. The service should explicitly cast it:

```typescript
equipment: hero.equipment as Record<string, string>,
```

This is the same pattern as the skills JSON parsing mentioned in Section 12.1, but equipment is not called out.

**Fix:** Add a note in Section 12.1 about equipment JSON casting alongside the skills casting.

---

### MINOR OBSERVATIONS (informational, no action required)

1. **Star multiplier balance:** The existing `calculateHeroStats` uses `starMultiplier = 1 + (stars - 1) * 0.15`, meaning a 7-star hero has a 1.9x multiplier. Combined with level 100 (`levelMultiplier = 10.9`), a maxed hero has `10.9 * 1.9 = 20.71x` base stats. This is a massive power range (common in mobile RPGs) but worth noting for Sprint 3 battle balance.

2. **No optimistic locking on hero upgrades:** Two concurrent upgrade requests for the same hero could both read the same gold balance, both pass validation, and both deduct. The Prisma transaction prevents inconsistent hero state, but player gold could go negative if two upgrades run simultaneously. This is an edge case at MVP scale. A `SELECT ... FOR UPDATE` or Redis lock (like the battle lock pattern) would fix it if it becomes a problem.

3. **Frontend component structure:** All three components (list, detail, team-builder) are standalone with lazy loading -- this is good for bundle size. Consider adding a shared `hero-card.component.ts` used by both the list and team-builder to avoid duplicating the hero card rendering logic.

4. **The `heroes/team` route in Angular router is correctly placed before `heroes/:id`** in Section 6.6 -- good catch on the routing order there. Make sure the backend controller matches.

---

### Summary Table

| # | Type | Issue | Section |
|---|------|-------|---------|
| B1 | ~~BLOCKER~~ RESOLVED | Auth-Heroes module dependency / PrismaModule is `@Global()` — confirmed | 4.2, 4.7 |
| B2 | ~~BLOCKER~~ RESOLVED | Star upgrade formula lowered to `(targetStars - 1) * 10` | 3.1, 5.3 |
| B3 | ~~BLOCKER~~ RESOLVED | Registration + starter heroes now in single `$transaction` | 4.4, 4.7 |
| B4 | ~~BLOCKER~~ RESOLVED | `addXp` method fully specified in 4.4, tested in 8.1, in checklist 13 | 4.4, 8, 11, 13 |
| B5 | ~~BLOCKER~~ RESOLVED | Controller routes reordered: static paths before `:id` params | 4.3 |
| R1 | RECOMMENDATION | Templates auth inconsistency (class guard vs. docs) | 4.3, 5.4 |
| R2 | RECOMMENDATION | Missing BadRequestException specification | 4.4 |
| R3 | RECOMMENDATION | Frontend gold sync after upgrade not specified | 6.4 |
| R4 | RECOMMENDATION | No explicit rate limiting discussion for upgrades | 4.3 |
| R5 | RECOMMENDATION | createMany return value limitations | 4.4 |
| R6 | RECOMMENDATION | Frontend ApiService existence not verified | 6.2 |
| R7 | RECOMMENDATION | Equipment JSON casting not documented | 12.1 |
