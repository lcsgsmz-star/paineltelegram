import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';

@Controller('panel-users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
    return this.usersService.findProfile(id, req.user.userId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  create(@Body() dto: CreateUserDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.create(dto, req.user.userId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserStatusDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.updateStatus(id, body.isActive, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
    return this.usersService.delete(id, req.user.userId);
  }
}
