import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateForbiddenWordsDto {
  @IsString()
  words!: string;

  @IsString()
  @IsIn(['MUTE', 'BAN', 'WARNING', 'mute', 'ban', 'warning'])
  punishment!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationValue?: number;

  @IsOptional()
  @IsString()
  @IsIn(['SECONDS', 'MINUTES', 'DAYS', 'seconds', 'minutes', 'days'])
  durationUnit?: string;
}
