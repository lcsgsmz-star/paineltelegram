import { useEffect, useState } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { usePanelToast } from '../components/PanelToastProvider';
import { StatusBadge } from '../components/StatusBadge';
import { TelegramPhoto } from '../components/TelegramPhoto';
import { apiRequest, fetchCurrentUser, getApiError, getStoredUser } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { BotStatus, GroupStats, SessionUser, TelegramGroup } from '../lib/types';

type ClearBotDataResponse = {
  deletedLogs: number;
  deletedMembers: number;
  deletedGroups: number;
};

export default function BotsPage() {
  const toast = usePanelToast();
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [group, setGroup] = useState<TelegramGroup | null>(null);
  const [groupStats, setGroupStats] = useState<GroupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');

  const isOwner = currentUser?.role === 'OWNER';

  const loadBotData = async () => {
    setLoading(true);
    setError('');

    try {
      const [me, statusResponse, groupResponse, statsResponse] = await Promise.all([
        fetchCurrentUser(),
        apiRequest<BotStatus>({ url: '/bot/status', method: 'GET' }),
        apiRequest<TelegramGroup | null>({ url: '/bot/group', method: 'GET' }),
        apiRequest<GroupStats | null>({ url: '/group/stats', method: 'GET' }),
      ]);

      setCurrentUser(me);
      setStatus(statusResponse.data);
      setGroup(groupResponse.data);
      setGroupStats(statsResponse.data);
    } catch (nextError) {
      setError(getApiError(nextError, 'Não foi possível carregar o status do bot.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentUser(getStoredUser());
    void loadBotData();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setError('');

    try {
      await apiRequest({
        url: '/bot/sync',
        method: 'POST',
        data: {},
      });
      toast.success('Sincronização concluída com sucesso.');
      await loadBotData();
    } catch (nextError) {
      toast.error(getApiError(nextError, 'Falha ao sincronizar o bot.'));
    } finally {
      setSyncing(false);
    }
  };

  const handleClearData = async () => {
    if (!isOwner) {
      return;
    }

    const confirmed = window.confirm(
      'Isso vai remover do painel o grupo salvo, os membros sincronizados e os logs ligados ao bot. Deseja continuar?',
    );

    if (!confirmed) {
      return;
    }

    setClearing(true);
    setError('');

    try {
      const response = await apiRequest<ClearBotDataResponse>({
        url: '/bot/data',
        method: 'DELETE',
      });

      toast.success(
        `Dados do bot limpos: ${response.data.deletedMembers} membros, ${response.data.deletedGroups} grupo(s) e ${response.data.deletedLogs} log(s).`,
      );
      await loadBotData();
    } catch (nextError) {
      toast.error(getApiError(nextError, 'Não foi possível limpar os dados do bot.'));
    } finally {
      setClearing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6">
        <section className="rounded-[1.6rem] border border-slate-800/80 bg-slate-900/85 p-4 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-300 sm:text-sm">Bot e integração</p>
              <h1 className="mt-3 text-xl font-semibold text-white sm:text-3xl">Saúde da conexão com o Telegram</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Confira se o token está configurado, se o grupo foi reconhecido com nome e foto e qual foi a
                última sincronização registrada no painel.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncing}
              className="w-full rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50 sm:w-auto sm:px-5 sm:py-3"
            >
              {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Token configurado', value: status?.tokenConfigured ? 'Sim' : 'Não' },
            { label: 'Cliente do bot', value: status?.clientReady ? 'Pronto' : 'Aguardando' },
            { label: 'Grupo reconhecido', value: group?.title || 'Nenhum' },
            { label: 'Mensagens capturadas', value: groupStats?.capturedMessageCount ?? '-' },
          ].map((item) => (
            <article key={item.label} className="rounded-[1.4rem] border border-slate-800/80 bg-slate-900/85 p-4 sm:rounded-3xl sm:p-5">
              <p className="text-xs text-slate-400 sm:text-sm">{item.label}</p>
              <p className="mt-2 text-xl font-semibold text-white sm:mt-3 sm:text-2xl">{loading ? '...' : item.value}</p>
            </article>
          ))}
        </section>

        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-[1.6rem] border border-slate-800/80 bg-slate-900/85 p-4 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white sm:text-xl">Listener em tempo real</h2>
                <p className="mt-2 text-sm text-slate-400">Resumo do ciclo de escuta contínua do bot.</p>
              </div>
              {status && <StatusBadge value={status.botReady ? 'ONLINE' : 'OFFLINE'} kind="action" />}
            </div>

            <div className="mt-5 space-y-3 sm:mt-6 sm:space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4">
                <p className="text-xs text-slate-400 sm:text-sm">Grupo conectado</p>
                <p className="mt-2 text-base font-semibold text-white sm:text-lg">{group?.title || 'Nenhum grupo salvo'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4">
                <p className="text-xs text-slate-400 sm:text-sm">Última sincronização</p>
                <p className="mt-2 text-sm text-white">{formatDateTime(status?.lastSyncAt)}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4">
                <p className="text-xs text-slate-400 sm:text-sm">Último erro reportado</p>
                <p className="mt-2 text-sm text-white">{status?.lastError || 'Nenhum erro registrado'}</p>
              </div>
            </div>
          </section>

          <section className="rounded-[1.6rem] border border-slate-800/80 bg-slate-900/85 p-4 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-6">
            <h2 className="text-lg font-semibold text-white sm:text-xl">Grupo salvo no painel</h2>
            <p className="mt-2 text-sm text-slate-400">Nome, foto e metadados do grupo reconhecido pelo bot.</p>

            {group ? (
              <div className="mt-5 space-y-3 sm:mt-6 sm:space-y-4">
                <div className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 sm:gap-4 sm:p-4">
                  <TelegramPhoto
                    endpoint={group.photoFileId ? '/group/photo' : null}
                    name={group.title}
                    alt={`Foto do grupo ${group.title}`}
                    className="h-16 w-16 flex-none sm:h-20 sm:w-20"
                    imageClassName="h-16 w-16 rounded-[1rem] object-cover sm:h-20 sm:w-20 sm:rounded-[1.25rem]"
                    fallbackClassName="flex h-16 w-16 items-center justify-center rounded-[1rem] bg-cyan-500/10 text-lg font-semibold text-cyan-200 sm:h-20 sm:w-20 sm:rounded-[1.25rem] sm:text-xl"
                  />

                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 sm:text-sm">Nome do grupo</p>
                    <p className="mt-2 truncate text-base font-semibold text-white sm:text-lg">{group.title}</p>
                    <p className="mt-2 text-sm text-slate-400">
                      {group.username ? `@${group.username}` : 'Grupo privado sem usuário público'}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4">
                  <p className="text-xs text-slate-400 sm:text-sm">Descrição</p>
                  <p className="mt-2 text-sm text-white">{group.description || 'Sem descrição registrada.'}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4">
                    <p className="text-xs text-slate-400 sm:text-sm">Membros contabilizados</p>
                    <p className="mt-2 text-sm text-white">{groupStats?.memberCount ?? 'Aguardando dados'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 sm:p-4">
                    <p className="text-xs text-slate-400 sm:text-sm">Perfis no painel</p>
                    <p className="mt-2 text-sm text-white">{groupStats?.trackedMemberCount ?? 'Aguardando dados'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400 sm:mt-6">
                Nenhum grupo foi salvo ainda. Adicione o bot ao supergrupo como administrador e execute a sincronização.
              </div>
            )}
          </section>
        </div>

        {isOwner && (
          <section className="rounded-[1.6rem] border border-amber-500/20 bg-amber-500/5 p-4 shadow-xl shadow-black/10 sm:rounded-[2rem] sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-amber-200 sm:text-sm">Limpeza administrativa</p>
                <h2 className="mt-3 text-lg font-semibold text-white sm:text-2xl">Limpar dados do bot no painel</h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
                  Remove do banco local o grupo salvo, os membros sincronizados, as fotos vinculadas e os logs ligados
                  ao bot. O acesso fica restrito ao perfil `owner`.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleClearData()}
                disabled={clearing}
                className="w-full rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-50 sm:w-auto sm:px-5 sm:py-3"
              >
                {clearing ? 'Limpando dados...' : 'Limpar dados do bot'}
              </button>
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
