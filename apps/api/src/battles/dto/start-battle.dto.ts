import { IsOptional, IsString, Matches } from 'class-validator';

export class StartBattleDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}-[1-3]$/)
  stageId?: string;
}
