import { Module } from '@nestjs/common';
import { ModerationSettingsController } from './moderation-settings.controller';
import { ModerationSettingsService } from './moderation-settings.service';

@Module({
  controllers: [ModerationSettingsController],
  providers: [ModerationSettingsService],
  exports: [ModerationSettingsService],
})
export class ModerationSettingsModule {}
