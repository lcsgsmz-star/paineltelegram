import { Body, Controller, Get, Patch, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { UpdateModerationSettingsDto } from './dto/update-moderation-settings.dto';
import { ModerationSettingsService } from './moderation-settings.service';

@Controller('moderation-settings')
@UseGuards(JwtAuthGuard)
export class ModerationSettingsController {
  constructor(private readonly moderationSettingsService: ModerationSettingsService) {}

  @Get()
  getSettings() {
    return this.moderationSettingsService.getSettings();
  }

  @Patch()
  @UseGuards(PermissionsGuard)
  @Permissions('MANAGE_FORBIDDEN_WORDS')
  updateSettings(@Body() body: UpdateModerationSettingsDto, @Request() req: AuthenticatedRequest) {
    return this.moderationSettingsService.updateSettings(body, req.user.userId);
  }
}
