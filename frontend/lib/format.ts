const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
});

export function formatDateTime(value?: string | null) {
  if (!value) return 'Nunca';
  return dateTimeFormatter.format(new Date(value));
}

export function formatDate(value?: string | null) {
  if (!value) return 'Nunca';
  return dateFormatter.format(new Date(value));
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    MEMBER: 'Membro',
    ADMIN: 'Administrador',
    BOT: 'Bot',
    MUTED: 'Silenciado',
    BANNED: 'Banido',
    LEFT: 'Saiu',
  };
  return labels[status] || status;
}

export function roleLabel(role: string) {
  const labels: Record<string, string> = {
    OWNER: 'Owner',
    SUB_OWNER: 'Sub dono',
    ADMIN: 'Administrador',
    HELPER: 'Ajudante',
    MODERATOR: 'Moderador',
  };
  return labels[role] || role;
}

export function actionLabel(type: string) {
  const labels: Record<string, string> = {
    JOIN: 'Entrada',
    LEAVE: 'Saída',
    MUTE: 'Silenciamento',
    UNMUTE: 'Remoção de mute',
    BAN: 'Banimento',
    UNBAN: 'Remoção de ban',
    REMOVE: 'Remoção do grupo',
    WARNING: 'Advertência',
    PANEL_LOGIN: 'Login no painel',
    PANEL_ACTION: 'Ação do painel',
    ONLINE: 'Bot online',
    OFFLINE: 'Bot aguardando',
  };
  return labels[type] || type;
}

export function formatModerationDuration(
  durationValue?: number | null,
  durationUnit?: string | null,
  durationSeconds?: number | null,
  legacyMinutes?: number | null,
) {
  if (durationValue && durationUnit) {
    const labels: Record<string, [string, string]> = {
      SECONDS: ['segundo', 'segundos'],
      MINUTES: ['minuto', 'minutos'],
      DAYS: ['dia', 'dias'],
    };

    const normalizedUnit = durationUnit.toUpperCase();
    const [singular, plural] = labels[normalizedUnit] || ['unidade', 'unidades'];
    return `${durationValue} ${durationValue === 1 ? singular : plural}`;
  }

  if (durationSeconds) {
    return `${durationSeconds} s`;
  }

  if (legacyMinutes) {
    return `${legacyMinutes} min`;
  }

  return null;
}
