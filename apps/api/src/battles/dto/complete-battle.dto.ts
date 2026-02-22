import {
  IsString,
  IsArray,
  IsNumber,
  IsIn,
  ValidateNested,
  IsOptional,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

class StatusEffectDto {
  @IsString()
  id!: string;

  @IsString()
  type!: string;

  @IsNumber()
  value!: number;

  @IsNumber()
  remainingTurns!: number;

  @IsOptional()
  @IsString()
  stat?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;
}

class TurnActionDto {
  @IsNumber()
  turn!: number;

  @IsString()
  actorId!: string;

  @IsString()
  actorName!: string;

  @IsString()
  skillId!: string;

  @IsString()
  skillName!: string;

  @IsArray()
  @IsString({ each: true })
  targetIds!: string[];

  @IsNumber()
  damage!: number;

  @IsNumber()
  healing!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StatusEffectDto)
  effects!: StatusEffectDto[];

  @IsObject()
  resultHp!: Record<string, number>;
}

class BattleLogDto {
  @IsNumber()
  seed!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TurnActionDto)
  turns!: TurnActionDto[];

  @IsIn(['victory', 'defeat', 'timeout'])
  result!: string;

  @IsNumber()
  totalTurns!: number;

  @IsNumber()
  durationMs!: number;
}

export class CompleteBattleDto {
  @IsString()
  battleId!: string;

  @ValidateNested()
  @Type(() => BattleLogDto)
  clientLog!: BattleLogDto;
}
