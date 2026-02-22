import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

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
