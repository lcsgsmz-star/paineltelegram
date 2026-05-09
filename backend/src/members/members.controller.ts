import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MembersService } from './members.service';
import { ModerationActionDto } from './dto/moderation-action.dto';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';

@Controller('members')
@UseGuards(JwtAuthGuard)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  getAll(@Query() query: any) {
    return this.membersService.list(query);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.membersService.findById(id);
  }

  @Get(':id/photo')
  getPhoto(@Param('id', ParseIntPipe) id: number) {
    return this.membersService.getPhoto(id);
  }

  @Post(':id/mute')
  @UseGuards(PermissionsGuard)
  @Permissions('MANAGE_MEMBERS')
  mute(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ModerationActionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.membersService.muteMember(id, body, req.user.userId);
  }

  @Post(':id/ban')
  @UseGuards(PermissionsGuard)
  @Permissions('MANAGE_MEMBERS')
  ban(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ModerationActionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.membersService.banMember(id, body, req.user.userId);
  }

  @Post(':id/warn')
  @UseGuards(PermissionsGuard)
  @Permissions('MANAGE_MEMBERS')
  warn(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ModerationActionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.membersService.warnMember(id, body, req.user.userId);
  }

  @Post(':id/unmute')
  @UseGuards(PermissionsGuard)
  @Permissions('MANAGE_MEMBERS')
  unmute(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
    return this.membersService.unmuteMember(id, req.user.userId);
  }

  @Post(':id/unban')
  @UseGuards(PermissionsGuard)
  @Permissions('MANAGE_MEMBERS')
  unban(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
    return this.membersService.unbanMember(id, req.user.userId);
  }
}
