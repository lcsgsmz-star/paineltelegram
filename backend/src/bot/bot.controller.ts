import { Controller, Delete, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BotService } from './bot.service';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';

@Controller('bot')
@UseGuards(JwtAuthGuard)
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Get('status')
  getStatus() {
    return this.botService.getStatus();
  }

  @Get('group')
  getGroup() {
    return this.botService.getGroupInfo();
  }

  @Post('sync')
  @UseGuards(PermissionsGuard)
  @Permissions('MANAGE_BOT')
  async syncGroup(@Request() req: AuthenticatedRequest) {
    return this.botService.syncCurrentGroup(req.user.userId);
  }

  @Delete('data')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  async clearData(@Request() req: AuthenticatedRequest) {
    return this.botService.clearStoredData(req.user.userId);
  }
}
