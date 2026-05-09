import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { ModerationSettingsModule } from '../moderation-settings/moderation-settings.module';

@Module({
  imports: [ModerationSettingsModule],
  providers: [BotService],
  controllers: [BotController],
  exports: [BotService],
})
export class BotModule {}
