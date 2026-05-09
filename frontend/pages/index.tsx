import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { usePanelToast } from '../components/PanelToastProvider';
import { StatusBadge } from '../components/StatusBadge';
import { TelegramPhoto } from '../components/TelegramPhoto';
import { apiRequest, getApiError } from '../lib/api';
import { ActionLog, BotStatus, GroupStats } from '../lib/types';
import { actionLabel, formatDateTime } from '../lib/format';

export default function HomePage() {
  const toast = usePanelToast();
  const [groupStats, setGroupStats] = useState<GroupStats | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [recentLogs, setRecentLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setLoading(true);
    setError('');

    try {
      const [groupResponse, botResponse, logResponse] = await Promise.all([
        apiRequest<GroupStats | null>({ url: '/group/stats', method: 'GET' }),
        apiRequest<BotStatus>({ url: '/bot/status', method: 'GET' }),
        apiRequest<ActionLog[]>({ url: '/logs', method: 'GET' }),
      ]);

      setGroupStats(groupResponse.data);
      setBotStatus(botResponse.data);
      setRecentLogs(logResponse.data.slice(0, 6));
    } catch (nextError) {
      setError(getApiError(nextError, 'Não foi possível carregar o dashboard.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const handleSyncBot = async () => {
    setSyncing(true);

    try {
      await apiRequest({ url: '/bot/sync', method: 'POST', data: {} });
      toast.success('Sincronização do bot concluída com sucesso.');
      await loadDashboard();
    } catch (nextError) {
      toast.error(getApiError(nextError, 'Falha ao sincronizar o bot.'));
    } finally {
      setSyncing(false);
    }
  };

  const cards = [
    {
      title: 'Membros do grupo',
      value: groupStats?.memberCount ?? '-',
      helper: groupStats ? `${groupStats.trackedMemberCount} perfis salvos no painel` : 'Aguardando sincronização',
    },
    {
      title: 'Mensagens capturadas',
      value: groupStats?.capturedMessageCount ?? '-',
      helper: 'Contagem acumulada pelo bot',
    },
    {
      title: 'Administradores',
      value: groupStats?.adminCount ?? '-',
      helper: 'Reconhecidos na última sincronização',
    },
    {
      title: 'Status do bot',
      value: botStatus ? (botStatus.botReady ? 'Online' : botStatus.clientReady ? 'Sincronização manual ativa' : 'Aguardando') : '-',
      helper: botStatus?.botReady
        ? 'Eventos em tempo real ativos'
        : botStatus?.clientReady
          ? 'Painel apto a sincronizar e moderar'
          : botStatus?.tokenConfigured
            ? 'Inicializando cliente do bot'
            : 'Token ausente',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-5 shadow-2xl shadow-black/20 backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
              <TelegramPhoto
                endpoint={groupStats?.photoFileId ? '/group/photo' : null}
                name={groupStats?.title || 'Telegram'}
                alt={groupStats?.title || 'Grupo do Telegram'}
                className="h-20 w-20 flex-none sm:h-24 sm:w-24"
                imageClassName="h-20 w-20 rounded-[1.75rem] object-cover shadow-xl shadow-black/20 sm:h-24 sm:w-24"
                fallbackClassName="flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-cyan-500/10 text-2xl font-semibold text-cyan-200 sm:h-24 sm:w-24"
              />

              <div className="min-w-0">
                <p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Visão geral</p>
                <h1 className="mt-3 text-2xl font-semibold text-white sm:text-4xl">
                  {groupStats?.title || 'Painel do supergrupo Telegram'}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  {groupStats?.description ||
                    'Acompanhe a integração com o bot, a saúde do grupo e as ações mais recentes do painel.'}
                </p>
                {groupStats?.username && <p className="mt-2 text-sm text-slate-400">@{groupStats.username}</p>}
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={handleSyncBot}
                disabled={syncing}
                className="w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50 sm:w-auto"
              >
                {syncing ? 'Sincronizando...' : 'Sincronizar bot'}
              </button>
              <Link
                href="/members"
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-slate-100 transition hover:bg-slate-800 sm:w-auto"
              >
                Ver membros
              </Link>
            </div>
          </div>

          {botStatus && (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <StatusBadge value={botStatus.botReady ? 'ONLINE' : 'OFFLINE'} kind="action" />
              <div className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-300 sm:rounded-full">
                Grupo conectado: <span className="font-semibold text-white">{groupStats?.title || 'Nenhum grupo salvo'}</span>
              </div>
              {botStatus.lastSyncAt && (
                <div className="rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-300 sm:rounded-full">
                  Última sincronização: <span className="font-semibold text-white">{formatDateTime(botStatus.lastSyncAt)}</span>
                </div>
              )}
            </div>
          )}
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {botStatus?.lastError && (
          <div className="rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
            Último erro do bot: {botStatus.lastError}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => (
            <article
              key={card.title}
              className="rounded-[1.75rem] border border-slate-800/80 bg-slate-900/85 p-5 shadow-xl shadow-black/15 sm:p-6"
            >
              <p className="text-sm text-slate-400">{card.title}</p>
              <p className="mt-4 text-2xl font-semibold text-white sm:text-3xl">{loading ? '...' : card.value}</p>
              <p className="mt-3 text-sm text-slate-500">{card.helper}</p>
            </article>
          ))}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-5 shadow-xl shadow-black/15 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Atividades recentes</h2>
                <p className="mt-2 text-sm text-slate-400">Últimos eventos capturados pelo bot e pelo painel.</p>
              </div>
              <Link href="/logs" className="text-sm font-medium text-cyan-300 hover:text-cyan-200">
                Abrir logs
              </Link>
            </div>

            <div className="mt-6 space-y-3">
              {recentLogs.length === 0 && !loading && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                  Ainda não há eventos registrados. Assim que o bot receber mensagens ou o painel aplicar ações,
                  eles aparecerão aqui.
                </div>
              )}

              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm text-slate-200"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge value={log.type} kind="action" />
                      <span className="font-medium text-white">{actionLabel(log.type)}</span>
                    </div>
                    <span className="text-xs text-slate-500">{formatDateTime(log.createdAt)}</span>
                  </div>

                  <p className="mt-3 text-slate-300">
                    {log.targetMember?.fullName || log.targetTelegramId || 'Sem alvo identificado'}
                  </p>
                  {log.reason && <p className="mt-1 text-xs text-slate-500">{log.reason}</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-5 shadow-xl shadow-black/15 sm:p-6">
            <h2 className="text-xl font-semibold text-white">Ações rápidas</h2>
            <p className="mt-2 text-sm text-slate-400">Atalhos para as rotas mais usadas no dia a dia.</p>

            <div className="mt-6 grid gap-3">
              {[
                { href: '/members', title: 'Membros', description: 'Abrir perfis, ver fotos e moderar usuários.' },
                { href: '/moderation', title: 'Moderação', description: 'Acompanhar punições ativas e reverter ações.' },
                { href: '/panel-users', title: 'Usuários do painel', description: 'Gerenciar acessos internos.' },
                { href: '/bots', title: 'Bot e grupo', description: 'Conferir nome, foto, sincronização e status.' },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 transition hover:bg-slate-800/80"
                >
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-400">{item.description}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
