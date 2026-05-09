import { Injectable } from '@nestjs/common';
import { BotService } from '../bot/bot.service';

@Injectable()
export class TelegramService {
  constructor(private readonly botService: BotService) {}

  muteUser(
    telegramId: string | number,
    durationSeconds: number,
    reason: string,
    durationValue: number,
    durationUnit: 'SECONDS' | 'MINUTES' | 'DAYS',
  ) {
    return this.botService.muteUser(telegramId, durationSeconds, reason, durationValue, durationUnit);
  }

  banUser(
    telegramId: string | number,
    durationSeconds: number | null,
    reason: string,
    durationValue?: number | null,
    durationUnit?: 'SECONDS' | 'MINUTES' | 'DAYS' | null,
  ) {
    return this.botService.banUser(telegramId, durationSeconds, reason, durationValue, durationUnit);
  }

  unbanUser(telegramId: string | number) {
    return this.botService.restoreBannedUser(telegramId);
  }

  syncCurrentGroup() {
    return this.botService.syncCurrentGroup();
  }

  getGroupId() {
    return this.botService.getStatus().groupId;
  }
}
