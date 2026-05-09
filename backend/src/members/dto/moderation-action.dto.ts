import { IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class ModerationActionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationValue?: number;

  @IsOptional()
  @IsString()
  @IsIn(['SECONDS', 'MINUTES', 'DAYS', 'seconds', 'minutes', 'days'])
  durationUnit?: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}
