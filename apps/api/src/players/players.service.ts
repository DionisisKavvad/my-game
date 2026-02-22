import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlayersService {
  constructor(private prisma: PrismaService) {}

  async getProfile(userId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        level: true,
        xp: true,
        gold: true,
        gems: true,
        energy: true,
        maxEnergy: true,
        energyRegenAt: true,
        createdAt: true,
      },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return player;
  }
}
