import { IsArray, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export const PANEL_ROLES = ['SUB_OWNER', 'ADMIN', 'HELPER', 'MODERATOR'] as const;

export const PANEL_PERMISSIONS = [
  'VIEW_LOGS',
  'MANAGE_MEMBERS',
  'MANAGE_FORBIDDEN_WORDS',
  'MANAGE_BOT',
  'MANAGE_PANEL_USERS',
] as const;

export class CreateUserDto {
  @IsString()
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsIn(PANEL_ROLES)
  role?: (typeof PANEL_ROLES)[number];

  @IsOptional()
  @IsArray()
  @IsIn(PANEL_PERMISSIONS, { each: true })
  permissions?: Array<(typeof PANEL_PERMISSIONS)[number]>;
}
