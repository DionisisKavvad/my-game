import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const heroTemplates = [
  {
    name: 'Aric the Bold',
    class: 'warrior',
    rarity: 'common',
    baseHp: 1200,
    baseAttack: 150,
    baseDefense: 100,
    baseSpeed: 80,
    skills: JSON.stringify([
      {
        id: 'warrior-slash',
        name: 'Power Slash',
        description: 'A powerful slash that deals 150% damage',
        damage: 150,
        cooldown: 2,
        target: 'single',
      },
      {
        id: 'warrior-shout',
        name: 'Battle Shout',
        description: 'Boosts own attack by 20% for 3 turns',
        damage: 0,
        cooldown: 4,
        target: 'self',
        effect: { type: 'buff', value: 20, duration: 3 },
      },
    ]),
    spriteKey: 'hero_warrior',
  },
  {
    name: 'Lyra the Wise',
    class: 'mage',
    rarity: 'rare',
    baseHp: 800,
    baseAttack: 200,
    baseDefense: 60,
    baseSpeed: 90,
    skills: JSON.stringify([
      {
        id: 'mage-fireball',
        name: 'Fireball',
        description: 'Hurls a fireball dealing 180% damage to a single target',
        damage: 180,
        cooldown: 3,
        target: 'single',
      },
      {
        id: 'mage-blizzard',
        name: 'Blizzard',
        description: 'Deals 80% damage to all enemies',
        damage: 80,
        cooldown: 5,
        target: 'all',
      },
    ]),
    spriteKey: 'hero_mage',
  },
  {
    name: 'Seraphina',
    class: 'healer',
    rarity: 'rare',
    baseHp: 900,
    baseAttack: 80,
    baseDefense: 80,
    baseSpeed: 95,
    skills: JSON.stringify([
      {
        id: 'healer-heal',
        name: 'Divine Heal',
        description: 'Heals an ally for 200% of attack',
        damage: 0,
        cooldown: 2,
        target: 'ally',
        effect: { type: 'heal', value: 200, duration: 1 },
      },
      {
        id: 'healer-shield',
        name: 'Holy Shield',
        description: 'Grants a shield absorbing 150% of attack as damage',
        damage: 0,
        cooldown: 4,
        target: 'ally',
        effect: { type: 'shield', value: 150, duration: 3 },
      },
    ]),
    spriteKey: 'hero_healer',
  },
  {
    name: 'Kael Swiftarrow',
    class: 'archer',
    rarity: 'common',
    baseHp: 850,
    baseAttack: 180,
    baseDefense: 70,
    baseSpeed: 110,
    skills: JSON.stringify([
      {
        id: 'archer-multishot',
        name: 'Multi Shot',
        description: 'Fires arrows at all enemies for 70% damage each',
        damage: 70,
        cooldown: 3,
        target: 'all',
      },
      {
        id: 'archer-snipe',
        name: 'Snipe',
        description: 'A precise shot dealing 220% damage with extra crit chance',
        damage: 220,
        cooldown: 4,
        target: 'single',
      },
    ]),
    spriteKey: 'hero_archer',
  },
  {
    name: 'Gorath Ironwall',
    class: 'tank',
    rarity: 'epic',
    baseHp: 2000,
    baseAttack: 90,
    baseDefense: 180,
    baseSpeed: 50,
    skills: JSON.stringify([
      {
        id: 'tank-taunt',
        name: 'Taunt',
        description: 'Forces all enemies to attack this hero for 2 turns',
        damage: 0,
        cooldown: 4,
        target: 'self',
        effect: { type: 'buff', value: 30, duration: 2 },
      },
      {
        id: 'tank-slam',
        name: 'Shield Slam',
        description: 'Slams enemies with shield, dealing 120% damage based on defense',
        damage: 120,
        cooldown: 3,
        target: 'single',
      },
    ]),
    spriteKey: 'hero_tank',
  },
];

async function main() {
  console.log('Seeding hero templates...');

  for (const template of heroTemplates) {
    await prisma.heroTemplate.upsert({
      where: { name: template.name },
      update: template,
      create: template,
    });
  }

  console.log(`Seeded ${heroTemplates.length} hero templates.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
