import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HeroesService } from './heroes.service';
import { UpdateTeamDto } from './dto/update-team.dto';
import { UpgradeHeroDto } from './dto/upgrade-hero.dto';

@Controller('heroes')
@UseGuards(JwtAuthGuard)
export class HeroesController {
  constructor(private heroesService: HeroesService) {}

  // --- Static path routes FIRST (before :id) ---

  @Get('templates')
  getTemplates() {
    return this.heroesService.getTemplates();
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.heroesService.getTemplate(id);
  }

  @Get('team')
  getTeam(@Req() req: { user: { userId: string } }) {
    return this.heroesService.getTeam(req.user.userId);
  }

  @Put('team')
  updateTeam(
    @Req() req: { user: { userId: string } },
    @Body() dto: UpdateTeamDto,
  ) {
    return this.heroesService.updateTeam(req.user.userId, dto);
  }

  // --- Parameterized routes AFTER static paths ---

  @Get()
  getMyHeroes(@Req() req: { user: { userId: string } }) {
    return this.heroesService.getPlayerHeroes(req.user.userId);
  }

  @Get(':id')
  getMyHero(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.heroesService.getPlayerHero(req.user.userId, id);
  }

  @Post(':id/upgrade')
  upgradeHero(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() dto: UpgradeHeroDto,
  ) {
    return this.heroesService.upgradeHero(req.user.userId, id, dto);
  }
}
