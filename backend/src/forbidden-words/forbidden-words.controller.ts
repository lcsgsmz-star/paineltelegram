import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CreateForbiddenWordsDto } from './dto/create-forbidden-words.dto';
import { ForbiddenWordsService } from './forbidden-words.service';

@Controller('forbidden-words')
@UseGuards(JwtAuthGuard)
export class ForbiddenWordsController {
  constructor(private readonly forbiddenWordsService: ForbiddenWordsService) {}

  @Get()
  list() {
    return this.forbiddenWordsService.list();
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @Permissions('MANAGE_FORBIDDEN_WORDS')
  create(@Body() body: CreateForbiddenWordsDto, @Request() req: AuthenticatedRequest) {
    return this.forbiddenWordsService.create(body, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @Permissions('MANAGE_FORBIDDEN_WORDS')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
    return this.forbiddenWordsService.remove(id, req.user.userId);
  }
}
