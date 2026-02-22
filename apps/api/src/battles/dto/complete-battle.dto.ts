import { IsObject, IsString } from 'class-validator';

export class CompleteBattleDto {
  @IsString()
  battleId!: string;

  @IsObject()
  clientLog!: Record<string, unknown>;
}
