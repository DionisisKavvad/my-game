import { IsOptional, IsString } from 'class-validator';

export class StartBattleDto {
  @IsOptional()
  @IsString()
  stageId?: string;
}
