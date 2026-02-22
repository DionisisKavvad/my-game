# Hero Wars

Turn-based tactical RPG with hero collection, team building, and campaign progression. Built as a full-stack monorepo with Angular, NestJS, and Phaser.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 19, Phaser 3 |
| Backend | NestJS 10, Prisma 6 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Monorepo | Nx 22, pnpm |
| Language | TypeScript 5.7 |

## Project Structure

```
hero-wars/
├── apps/
│   ├── api/              # NestJS backend (REST API, auth, game logic)
│   └── client/           # Angular frontend (UI, Phaser battle scenes)
├── libs/
│   ├── shared/           # Shared models, constants, game config
│   └── battle-engine/    # Deterministic battle simulator (shared between client & server)
├── docker-compose.yml    # PostgreSQL + Redis + API
└── .env.example          # Environment variables template
```

### Backend Modules (apps/api)

- **auth** - JWT authentication with refresh tokens, bcrypt, login lockout
- **heroes** - Hero CRUD, team building, level/star upgrades
- **battles** - Battle lifecycle (start, client submit, server-side validation)
- **campaign** - Stage unlocking, progression, reward distribution
- **players** - Player profile, stats, economy (gold/gems/energy)
- **quests** - Daily quest tracking
- **scheduled** - Cron jobs (energy regeneration, daily quest resets)
- **redis** - Cache layer (battle seeds, locks)

### Frontend Routes (apps/client)

| Route | Screen |
|-------|--------|
| `/login` | Login form |
| `/register` | Registration form |
| `/lobby` | Main menu with player stats and campaign map |
| `/heroes` | Hero collection grid |
| `/heroes/team` | Team builder (drag & drop 5-hero lineup) |
| `/heroes/:id` | Hero detail with upgrade options |
| `/battle/:stageId` | Phaser battle scene with animations |

### Shared Libraries

- **@hero-wars/shared** - TypeScript interfaces (Hero, Battle, Player, Campaign), `GAME_CONFIG` constants, campaign stage definitions
- **@hero-wars/battle-engine** - Deterministic battle simulator with seeded RNG. Both client and server run the same simulation to enable anti-cheat validation.

## Prerequisites

- Node.js 20+
- pnpm
- Docker & Docker Compose

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment

```bash
cp .env.example .env
```

The defaults work out of the box for local development.

### 3. Start PostgreSQL and Redis

```bash
docker compose up postgres redis -d
```

### 4. Set up the database

```bash
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
```

### 5. Start the dev servers

```bash
# Terminal 1 - API (port 3000)
pnpm start:api

# Terminal 2 - Client (port 4200, proxies /api to :3000)
pnpm start:client
```

Open http://localhost:4200

## Other Commands

```bash
pnpm build              # Build all apps
pnpm test               # Run all tests
pnpm lint               # Lint all projects
pnpm prisma:migrate     # Run database migrations
pnpm prisma:seed        # Re-seed hero templates
```

## What You See with Seed Data

When you run the seed and register a new account, here's what's available:

### Starter Heroes

Every new player gets 3 heroes automatically:

| Hero | Class | Rarity | HP | ATK | DEF | SPD |
|------|-------|--------|----|-----|-----|-----|
| Aric the Bold | Warrior | Common | 1200 | 150 | 100 | 80 |
| Lyra the Wise | Mage | Rare | 800 | 200 | 60 | 90 |
| Seraphina | Healer | Rare | 900 | 80 | 80 | 95 |

Two additional heroes can be earned through campaign rewards:

| Hero | Class | Rarity | HP | ATK | DEF | SPD |
|------|-------|--------|----|-----|-----|-----|
| Kael Swiftarrow | Archer | Common | 850 | 180 | 70 | 110 |
| Gorath Ironwall | Tank | Epic | 2000 | 90 | 180 | 50 |

### Starting Resources

- **500 Gold** - Used for hero leveling and star upgrades
- **100 Gems** - Premium currency
- **120 Energy** - Regenerates 1 per 5 minutes, spent to enter campaign stages

### Campaign

30 stages across 10 chapters with scaling difficulty:

- **Chapters 1-3**: 2 enemies per stage, levels 1-10, 6 energy cost
- **Chapters 4-6**: 3 enemies, levels 10-25, 8 energy
- **Chapters 7-10**: 4-5 enemies, levels 25-60, 10-12 energy

Stages award 1-3 stars based on hero survival rate. Completing stages unlocks the next one and grants gold + XP rewards.

### Gameplay Loop

1. **Register** an account at `/register`
2. Land on the **Lobby** - see your player stats and energy
3. Visit **Heroes** to view your 3 starter heroes
4. Open **Team Builder** to arrange your lineup (up to 5 heroes)
5. Start a **Battle** from the campaign map - watch the Phaser-animated turn-based combat
6. Earn rewards, **level up** and **star up** your heroes
7. Progress through harder stages to unlock new heroes and better rewards

### Battle System

Battles are turn-based with 5 hero classes, each with 2 skills:

- **Warrior**: Power Slash (150% single target), Battle Shout (+20% ATK buff)
- **Mage**: Fireball (180% single target), Blizzard (80% AoE)
- **Healer**: Divine Heal (200% heal), Holy Shield (150% shield)
- **Archer**: Multi Shot (70% AoE), Snipe (220% single target)
- **Tank**: Defensive Stance (+30% DEF buff), Shield Slam (120% single target)

Combat features critical hits (15%), dodge (5%), cooldown management, and AI-controlled enemies with smart targeting.

## Docker (Full Stack)

To run everything in Docker:

```bash
docker compose up
```

This starts PostgreSQL, Redis, and the API. The client needs to be built and served separately or via a reverse proxy.
