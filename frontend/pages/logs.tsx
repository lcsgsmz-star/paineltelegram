import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { StatusBadge } from '../components/StatusBadge';
import { TelegramPhoto } from '../components/TelegramPhoto';
import { apiRequest, fetchCurrentUser, getApiError } from '../lib/api';
import { actionLabel, formatDateTime, formatModerationDuration, roleLabel } from '../lib/format';
import { ActionLog, PanelUser, TelegramMember } from '../lib/types';

const roleRank: Record<string, number> = {
  OWNER: 50,
  SUB_OWNER: 40,
  ADMIN: 30,
  HELPER: 20,
  MODERATOR: 10,
};

export default function LogsPage() {
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [type, setType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState<PanelUser | null>(null);
  const [selectedMember, setSelectedMember] = useState<TelegramMember | null>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<PanelUser | null>(null);
  const [memberProfileView, setMemberProfileView] = useState<'profile' | 'logs'>('profile');

  const loadLogs = async (nextType = type, nextFromDate = fromDate, nextToDate = toDate) => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (nextType) params.set('type', nextType);
      if (nextFromDate) params.set('fromDate', nextFromDate);
      if (nextToDate) params.set('toDate', nextToDate);

      const [meResponse, response] = await Promise.all([
        fetchCurrentUser(),
        apiRequest<ActionLog[]>({
        url: `/logs${params.toString() ? `?${params.toString()}` : ''}`,
        method: 'GET',
        }),
      ]);
      setCurrentUser(meResponse);
      setLogs(response.data);
    } catch (nextError) {
      setError(getApiError(nextError, 'Não foi possível carregar os logs.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  const counters = useMemo(() => {
    return logs.reduce<Record<string, number>>((accumulator, log) => {
      accumulator[log.type] = (accumulator[log.type] || 0) + 1;
      return accumulator;
    }, {});
  }, [logs]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await loadLogs(type, fromDate, toDate);
  };

  const canOpenAdminProfile = (admin?: { role: string } | null) => {
    if (!currentUser || !admin) return false;
    return (roleRank[currentUser.role] || 0) > (roleRank[admin.role] || 0);
  };

  const openMemberProfile = async (memberId?: number | null) => {
    if (!memberId) return;
    const response = await apiRequest<TelegramMember>({ url: `/members/${memberId}`, method: 'GET' });
    setMemberProfileView('profile');
    setSelectedMember(response.data);
  };

  const openAdminProfile = async (admin?: { id: number; role: string } | null) => {
    if (!admin || !canOpenAdminProfile(admin)) return;
    const response = await apiRequest<PanelUser>({ url: `/panel-users/${admin.id}`, method: 'GET' });
    setSelectedAdmin(response.data);
  };

  const renderActorName = (log: ActionLog) => {
    if (!log.actor) return 'Sistema';
    if (!canOpenAdminProfile(log.actor)) return log.actor.username;
    return (
      <button type="button" onClick={() => void openAdminProfile(log.actor)} className="font-medium text-cyan-200 hover:text-cyan-100">
        {log.actor.username}
      </button>
    );
  };

  const renderTargetName = (log: ActionLog) => {
    if (!log.targetMember) return log.targetTelegramId || '-';
    return (
      <button
        type="button"
        onClick={() => void openMemberProfile(log.targetMemberId)}
        className="font-medium text-cyan-200 hover:text-cyan-100"
      >
        {log.targetMember.fullName}
      </button>
    );
  };

  const telegramUsername = selectedMember?.telegramUsername?.replace(/^@/, '');
  const telegramProfileUrl = telegramUsername ? `https://t.me/${telegramUsername}` : null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-5 shadow-xl shadow-black/20 sm:p-6">
          <p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Auditoria</p>
          <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">Histórico de eventos</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Consulte entradas, saídas, logins, punições e ações administrativas executadas pelo painel.
          </p>

          <form className="mt-6 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={handleSubmit}>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
            >
              <option value="">Todos os tipos</option>
              <option value="JOIN">Entrada</option>
              <option value="LEAVE">Saída</option>
              <option value="MUTE">Mute</option>
              <option value="UNMUTE">Unmute</option>
              <option value="BAN">Ban</option>
              <option value="UNBAN">Unban</option>
              <option value="WARNING">Advertência</option>
              <option value="PANEL_LOGIN">Login</option>
              <option value="PANEL_ACTION">Ação do painel</option>
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
            />
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
            />
            <button
              type="submit"
              className="w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 lg:w-auto"
            >
              Aplicar filtros
            </button>
          </form>
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total', value: logs.length },
            { label: 'Mutes', value: counters.MUTE || 0 },
            { label: 'Bans', value: counters.BAN || 0 },
            { label: 'Logins no painel', value: counters.PANEL_LOGIN || 0 },
          ].map((item) => (
            <article key={item.label} className="rounded-3xl border border-slate-800/80 bg-slate-900/85 p-5">
              <p className="text-sm text-slate-400">{item.label}</p>
              <p className="mt-3 text-2xl font-semibold text-white sm:text-3xl">{loading ? '...' : item.value}</p>
            </article>
          ))}
        </section>

        <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-4 shadow-xl shadow-black/20 sm:p-6">
          <div className="space-y-3 md:hidden">
            {!loading && logs.length === 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                Nenhum log encontrado para os filtros selecionados.
              </div>
            )}

            {loading && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                Carregando logs...
              </div>
            )}

            {logs.map((log) => {
              const duration = formatModerationDuration(
                log.durationValue,
                log.durationUnit,
                log.durationSeconds,
                log.durationMinutes,
              );

              return (
                <article key={log.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge value={log.type} kind="action" />
                      <span className="font-medium text-white">{actionLabel(log.type)}</span>
                    </div>
                    <span className="text-xs text-slate-500">{formatDateTime(log.createdAt)}</span>
                  </div>

                  <div className="mt-4 grid gap-3 text-xs text-slate-400">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                      <p>Origem</p>
                      <p className="mt-1 text-sm font-medium text-white">{log.origin}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                      <p>Autor</p>
                      <p className="mt-1 text-sm font-medium text-white">{renderActorName(log)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                      <p>Alvo</p>
                      <p className="mt-1 text-sm font-medium text-white">{renderTargetName(log)}</p>
                    </div>
                    {duration && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                        <p>Duração</p>
                        <p className="mt-1 text-sm font-medium text-white">{duration}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-3">
                    <p className="text-xs text-slate-400">Motivo</p>
                    <p className="mt-1 text-sm text-slate-200">{log.reason || '-'}</p>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[860px] border-collapse text-left text-sm text-slate-200">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="px-3 py-3 font-medium">Evento</th>
                  <th className="px-3 py-3 font-medium">Origem</th>
                  <th className="px-3 py-3 font-medium">Autor</th>
                  <th className="px-3 py-3 font-medium">Alvo</th>
                  <th className="px-3 py-3 font-medium">Motivo</th>
                  <th className="px-3 py-3 font-medium">Quando</th>
                </tr>
              </thead>
              <tbody>
                {!loading && logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                      Nenhum log encontrado para os filtros selecionados.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                      Carregando logs...
                    </td>
                  </tr>
                )}

                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800/70 hover:bg-slate-950/40">
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge value={log.type} kind="action" />
                        <span className="font-medium text-white">{actionLabel(log.type)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-4">{log.origin}</td>
                    <td className="px-3 py-4">{renderActorName(log)}</td>
                    <td className="px-3 py-4">{renderTargetName(log)}</td>
                    <td className="px-3 py-4 text-slate-300">{log.reason || '-'}</td>
                    <td className="px-3 py-4 text-slate-400">{formatDateTime(log.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {selectedMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
            <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-slate-800 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <TelegramPhoto
                    endpoint={`/members/${selectedMember.id}/photo`}
                    name={selectedMember.fullName}
                    alt={`Foto de ${selectedMember.fullName}`}
                    className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950"
                    imageClassName="h-full w-full object-cover"
                    fallbackClassName="flex h-full w-full items-center justify-center bg-cyan-500/10 text-lg font-semibold text-cyan-100"
                  />
                  <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Perfil do membro</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">{selectedMember.fullName}</h2>
                  {telegramProfileUrl ? (
                    <a
                      href={telegramProfileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex text-sm font-medium text-cyan-200 hover:text-cyan-100"
                    >
                      @{telegramUsername}
                    </a>
                  ) : (
                    <p className="mt-1 text-sm text-slate-400">ID do Telegram: {selectedMember.telegramId}</p>
                  )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMember(null)}
                  className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Fechar
                </button>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMemberProfileView('profile')}
                  className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                    memberProfileView === 'profile'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  Perfil
                </button>
                <button
                  type="button"
                  onClick={() => setMemberProfileView('logs')}
                  className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                    memberProfileView === 'logs'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  Ver histórico de logs
                </button>
              </div>

              {memberProfileView === 'profile' && (
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs text-slate-400">Status</p>
                  <p className="mt-2 text-sm font-medium text-white">{selectedMember.status}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs text-slate-400">Mensagens</p>
                  <p className="mt-2 text-sm font-medium text-white">{selectedMember.messageCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs text-slate-400">Última mensagem</p>
                  <p className="mt-2 text-sm font-medium text-white">{formatDateTime(selectedMember.lastMessageAt)}</p>
                </div>
              </div>
              )}
              {memberProfileView === 'logs' && (
                <div className="mt-6 space-y-3">
                  {(selectedMember.actionLogs || []).length === 0 && (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                      Este membro ainda não possui logs associados.
                    </div>
                  )}

                  {(selectedMember.actionLogs || []).map((log) => {
                    const duration = formatModerationDuration(
                      log.durationValue,
                      log.durationUnit,
                      log.durationSeconds,
                      log.durationMinutes,
                    );

                    return (
                      <article key={log.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <StatusBadge value={log.type} kind="action" />
                            <span className="font-medium text-white">{actionLabel(log.type)}</span>
                          </div>
                          <span className="text-xs text-slate-500">{formatDateTime(log.createdAt)}</span>
                        </div>
                        <p className="mt-3 text-slate-300">{log.reason || 'Sem motivo informado.'}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          Autor: {log.actor?.username || 'Sistema'}
                          {duration ? ` • ${duration}` : ''}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {selectedAdmin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
            <section className="w-full max-w-xl rounded-[2rem] border border-slate-800 bg-slate-900 p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Perfil administrativo</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">{selectedAdmin.username}</h2>
                  <p className="mt-1 text-sm text-slate-400">{selectedAdmin.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAdmin(null)}
                  className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Fechar
                </button>
              </div>
              <div className="mt-6 space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs text-slate-400">Cargo</p>
                  <p className="mt-2 text-sm font-medium text-white">{roleLabel(selectedAdmin.role)}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs text-slate-400">Criado em</p>
                  <p className="mt-2 text-sm font-medium text-white">{formatDateTime(selectedAdmin.createdAt)}</p>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
