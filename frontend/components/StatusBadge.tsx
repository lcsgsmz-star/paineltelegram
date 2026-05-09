import { actionLabel, roleLabel, statusLabel } from '../lib/format';

type BadgeKind = 'status' | 'role' | 'action';

const toneByValue: Record<string, string> = {
  OWNER: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  SUB_OWNER: 'border-lime-500/40 bg-lime-500/10 text-lime-200',
  ADMIN: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  HELPER: 'border-teal-500/40 bg-teal-500/10 text-teal-200',
  MODERATOR: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200',
  MEMBER: 'border-slate-600 bg-slate-800/80 text-slate-200',
  BOT: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200',
  MUTED: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  BANNED: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  LEFT: 'border-slate-700 bg-slate-900 text-slate-400',
  JOIN: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  LEAVE: 'border-slate-700 bg-slate-900 text-slate-300',
  MUTE: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  UNMUTE: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  BAN: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  UNBAN: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
  REMOVE: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  PANEL_LOGIN: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
  PANEL_ACTION: 'border-violet-500/40 bg-violet-500/10 text-violet-200',
  ONLINE: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  OFFLINE: 'border-slate-700 bg-slate-900 text-slate-300',
};

function resolveLabel(kind: BadgeKind, value: string) {
  if (kind === 'role') return roleLabel(value);
  if (kind === 'action') return actionLabel(value);
  return statusLabel(value);
}

export function StatusBadge({ value, kind = 'status' }: { value: string; kind?: BadgeKind }) {
  const tone = toneByValue[value] || 'border-slate-700 bg-slate-900 text-slate-200';

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>
      {resolveLabel(kind, value)}
    </span>
  );
}
