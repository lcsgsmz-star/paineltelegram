import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

const punishments = ['WARNING', 'MUTE', 'BAN'] as const;
const durationUnits = ['SECONDS', 'MINUTES', 'DAYS'] as const;

export class UpdateModerationSettingsDto {
  @IsOptional()
  @IsBoolean()
  floodEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  floodMessageLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  floodTimeWindowSeconds?: number;

  @IsOptional()
  @IsString()
  @IsIn(punishments)
  floodPunishment?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  floodDurationValue?: number;

  @IsOptional()
  @IsString()
  @IsIn(durationUnits)
  floodDurationUnit?: string;

  @IsOptional()
  @IsBoolean()
  inlineBotsEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedInlineBots?: string[];

  @IsOptional()
  @IsString()
  @IsIn(punishments)
  inlineBotPunishment?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  inlineBotDurationValue?: number;

  @IsOptional()
  @IsString()
  @IsIn(durationUnits)
  inlineBotDurationUnit?: string;

  @IsOptional()
  @IsBoolean()
  scheduledAnnouncementsEnabled?: boolean;
}
