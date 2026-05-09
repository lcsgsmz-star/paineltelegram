import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MembersModule } from './members/members.module';
import { LogsModule } from './logs/logs.module';
import { GroupModule } from './group/group.module';
import { BotModule } from './bot/bot.module';
import { PrismaModule } from './common/prisma.module';
import { ForbiddenWordsModule } from './forbidden-words/forbidden-words.module';
import { ModerationSettingsModule } from './moderation-settings/moderation-settings.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    MembersModule,
    LogsModule,
    GroupModule,
    BotModule,
    ForbiddenWordsModule,
    ModerationSettingsModule,
  ],
})
export class AppModule {}
