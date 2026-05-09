import { Module } from '@nestjs/common';
import { ForbiddenWordsController } from './forbidden-words.controller';
import { ForbiddenWordsService } from './forbidden-words.service';

@Module({
  controllers: [ForbiddenWordsController],
  providers: [ForbiddenWordsService],
})
export class ForbiddenWordsModule {}
