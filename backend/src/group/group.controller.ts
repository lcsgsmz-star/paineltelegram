import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GroupService } from './group.service';

@Controller('group')
@UseGuards(JwtAuthGuard)
export class GroupController {
  constructor(private readonly groupService: GroupService) {}

  @Get()
  getGroup() {
    return this.groupService.getGroup();
  }

  @Get('photo')
  getPhoto() {
    return this.groupService.getGroupPhoto();
  }

  @Get('stats')
  getStats() {
    return this.groupService.getGroupStats();
  }
}
