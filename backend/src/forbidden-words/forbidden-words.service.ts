import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { CreateForbiddenWordsDto } from './dto/create-forbidden-words.dto';

type DurationUnit = 'SECONDS' | 'MINUTES' | 'DAYS';

@Injectable()
export class ForbiddenWordsService {
  constructor(private prisma: PrismaService) {}

  async list() {
    return this.prisma.$queryRawUnsafe(
      'SELECT "id", "word", "punishment", "durationValue", "durationUnit", "durationSeconds", "createdAt", "updatedAt" FROM "ForbiddenWord" ORDER BY "createdAt" DESC',
    );
  }

  async create(dto: CreateForbiddenWordsDto, actorId?: number) {
    const words = this.parseWords(dto.words);
    const punishment = String(dto.punishment).toUpperCase();
    const duration = this.resolveDuration(dto.durationValue, dto.durationUnit);
    const now = new Date().toISOString();

    for (const word of words) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "ForbiddenWord" ("word", "punishment", "durationValue", "durationUnit", "durationSeconds", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT("word") DO UPDATE SET
          "punishment" = excluded."punishment",
          "durationValue" = excluded."durationValue",
          "durationUnit" = excluded."durationUnit",
          "durationSeconds" = excluded."durationSeconds",
          "updatedAt" = excluded."updatedAt"`,
        word,
        punishment,
        duration?.value ?? null,
        duration?.unit ?? null,
        duration?.seconds ?? null,
        now,
        now,
      );
    }

    if (actorId) {
      await this.logPanelAction(
        actorId,
        `Atualizou palavras proibidas: ${words.join(', ')}. Punição: ${punishment}. Duração: ${duration ? `${duration.value} ${duration.unit}` : 'sem duração'}.`,
      );
    }

    return this.list();
  }

  async remove(id: number, actorId?: number) {
    const [word] = await this.prisma.$queryRawUnsafe<Array<{ word: string }>>(
      'SELECT "word" FROM "ForbiddenWord" WHERE "id" = ?',
      id,
    );
    await this.prisma.$executeRawUnsafe('DELETE FROM "ForbiddenWord" WHERE "id" = ?', id);
    if (actorId) {
      await this.logPanelAction(actorId, `Removeu a palavra proibida: ${word?.word || id}.`);
    }
    return { deleted: true };
  }

  private async logPanelAction(actorId: number, reason: string) {
    await this.prisma.actionLog.create({
      data: {
        type: 'PANEL_ACTION',
        origin: 'PANEL',
        actorId,
        reason,
      },
    });
  }

  private parseWords(rawWords: string) {
    return Array.from(
      new Set(
        rawWords
          .split(/[,\n\r]+/)
          .map((word) => word.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
  }

  private resolveDuration(value?: number, unit?: string) {
    if (!value) {
      return null;
    }

    const normalizedUnit = this.normalizeDurationUnit(unit);
    const multipliers: Record<DurationUnit, number> = {
      SECONDS: 1,
      MINUTES: 60,
      DAYS: 86400,
    };

    return {
      value,
      unit: normalizedUnit,
      seconds: value * multipliers[normalizedUnit],
    };
  }

  private normalizeDurationUnit(value?: string): DurationUnit {
    const normalized = String(value || 'MINUTES').toUpperCase();
    if (normalized === 'SECONDS' || normalized === 'MINUTES' || normalized === 'DAYS') {
      return normalized;
    }
    return 'MINUTES';
  }
}
