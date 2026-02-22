import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignService } from './campaign.service';

@Controller('campaign')
@UseGuards(JwtAuthGuard)
export class CampaignController {
  constructor(private campaignService: CampaignService) {}

  @Get('stages')
  getStages(@Req() req: { user: { userId: string } }) {
    return this.campaignService.getStages(req.user.userId);
  }

  @Get('stages/:id')
  async getStage(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    const stage = await this.campaignService.getStageById(req.user.userId, id);
    if (!stage) {
      throw new NotFoundException(`Stage ${id} not found`);
    }
    return stage;
  }
}
