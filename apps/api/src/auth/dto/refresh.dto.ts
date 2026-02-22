import { IsString, IsUUID } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsUUID()
  refreshToken!: string;
}
