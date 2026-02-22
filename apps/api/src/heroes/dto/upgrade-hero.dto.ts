import { IsIn, IsString } from 'class-validator';

export class UpgradeHeroDto {
  @IsString()
  @IsIn(['level', 'star'])
  type!: 'level' | 'star';
}
