export interface SessionUser {
  id: number;
  username: string;
  email: string;
  role: string;
  permissions?: string;
}

export interface AuthResponse {
  access_token: string;
  user: SessionUser;
}

export interface PanelUser {
  id: number;
  username: string;
  email: string;
  role: string;
  permissions: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramMemberSummary {
  id: number;
  telegramId: string;
  telegramUsername: string | null;
  fullName: string;
  photoFileId: string | null;
  status: string;
  isBot: boolean;
  messageCount: number;
}

export interface TelegramMember extends TelegramMemberSummary {
  firstMessageAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  actionLogs?: ActionLog[];
}

export interface ActionLogActor {
  id: number;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
}

export interface ActionLog {
  id: number;
  type: string;
  origin: string;
  actorId: number | null;
  actor?: ActionLogActor | null;
  targetMemberId: number | null;
  targetMember?: TelegramMemberSummary | null;
  targetTelegramId: string | null;
  reason: string | null;
  durationMinutes: number | null;
  durationValue: number | null;
  durationUnit: string | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface GroupStats {
  id: number;
  telegramChatId: string;
  title: string;
  username: string | null;
  description: string | null;
  photoFileId: string | null;
  memberCount: number | null;
  trackedMemberCount: number;
  activeMemberCount: number;
  adminCount: number;
  botCount: number;
  mutedCount: number;
  bannedCount: number;
  capturedMessageCount: number;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramGroup {
  id: number;
  telegramChatId: string;
  title: string;
  username: string | null;
  description: string | null;
  photoFileId: string | null;
  memberCount: number | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BotStatus {
  tokenConfigured: boolean;
  botUsername: string;
  clientReady: boolean;
  botReady: boolean;
  groupId: string | null;
  ownerTelegramId: string;
  lastError: string | null;
  lastSyncAt: string | null;
}

export interface ForbiddenWord {
  id: number;
  word: string;
  punishment: 'MUTE' | 'BAN' | 'WARNING';
  durationValue: number | null;
  durationUnit: string | null;
  durationSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationSettings {
  floodEnabled: boolean;
  floodMessageLimit: number;
  floodTimeWindowSeconds: number;
  floodPunishment: 'MUTE' | 'BAN' | 'WARNING';
  floodDurationValue: number;
  floodDurationUnit: 'SECONDS' | 'MINUTES' | 'DAYS';
  inlineBotsEnabled: boolean;
  allowedInlineBots: string[];
  inlineBotPunishment: 'MUTE' | 'BAN' | 'WARNING';
  inlineBotDurationValue: number;
  inlineBotDurationUnit: 'SECONDS' | 'MINUTES' | 'DAYS';
  scheduledAnnouncementsEnabled: boolean;
}
