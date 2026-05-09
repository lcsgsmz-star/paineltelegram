import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { usePanelToast } from '../components/PanelToastProvider';
import { StatusBadge } from '../components/StatusBadge';
import { TelegramPhoto } from '../components/TelegramPhoto';
import { apiRequest, getApiError } from '../lib/api';
import { actionLabel, formatDate, formatDateTime, formatModerationDuration } from '../lib/format';
import { TelegramMember } from '../lib/types';

type MemberFilters = {
  query: string;
  status: string;
  type: string;
};

type DurationUnit = 'SECONDS' | 'MINUTES' | 'DAYS';

function MembersPageContent() {
  const toast = usePanelToast();
  const [members, setMembers] = useState<TelegramMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<TelegramMember | null>(null);
  const [filters, setFilters] = useState<MemberFilters>({ query: '', status: '', type: '' });
  const [draftFilters, setDraftFilters] = useState<MemberFilters>({ query: '', status: '', type: '' });
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [actionType, setActionType] = useState<'mute' | 'ban' | 'warn'>('mute');
  const [reason, setReason] = useState('');
  const [durationValue, setDurationValue] = useState('60');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('MINUTES');

  const hasMembers = members.length > 0;
  const selectedMemberStatus = useMemo(() => selectedMember?.status || '', [selectedMember]);

  const resetModerationForm = () => {
    setActionType('mute');
    setReason('');
    setDurationValue('60');
    setDurationUnit('MINUTES');
  };

  const closeMemberModal = () => {
    setSelectedMember(null);
    resetModerationForm();
  };

  const loadMembers = async (nextFilters: MemberFilters = filters) => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (nextFilters.query) params.set('query', nextFilters.query);
      if (nextFilters.status) params.set('status', nextFilters.status);
      if (nextFilters.type) params.set('type', nextFilters.type);

      const response = await apiRequest<TelegramMember[]>({
        url: `/members${params.toString() ? `?${params.toString()}` : ''}`,
        method: 'GET',
      });
      setMembers(response.data);
    } catch (nextError) {
      setError(getApiError(nextError, 'Não foi possível carregar os membros.'));
    } finally {
      setLoading(false);
    }
  };

  const loadMemberDetails = async (memberId: number) => {
    setDetailsLoading(true);
    setError('');

    try {
      const response = await apiRequest<TelegramMember>({
        url: `/members/${memberId}`,
        method: 'GET',
      });
      setSelectedMember(response.data);
    } catch (nextError) {
      toast.error(getApiError(nextError, 'Não foi possível carregar os detalhes do membro.'));
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, []);

  useEffect(() => {
    if (!selectedMember || typeof document === 'undefined') {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedMember]);

  const handleFilterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters(draftFilters);
    await loadMembers(draftFilters);
  };

  const handleOpenMember = async (memberId: number) => {
    await loadMemberDetails(memberId);
  };

  const handleModerationAction = async (mode: 'mute' | 'ban' | 'warn' | 'unmute' | 'unban') => {
    if (!selectedMember) {
      return;
    }

    if ((mode === 'mute' || mode === 'ban' || mode === 'warn') && reason.trim().length < 3) {
      toast.error('Informe um motivo com pelo menos 3 caracteres.');
      return;
    }

    if (mode === 'mute' && (!durationValue || Number(durationValue) < 1)) {
      toast.error('Defina uma duração válida para o silenciamento.');
      return;
    }

    if (mode === 'ban' && durationValue && Number(durationValue) < 1) {
      toast.error('Defina uma duração válida ou deixe o campo em branco para banimento permanente.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      if (mode === 'mute') {
        await apiRequest({
          url: `/members/${selectedMember.id}/mute`,
          method: 'POST',
          data: {
            durationValue: Number(durationValue || 60),
            durationUnit,
            reason,
          },
        });
      }

      if (mode === 'ban') {
        await apiRequest({
          url: `/members/${selectedMember.id}/ban`,
          method: 'POST',
          data: {
            ...(durationValue ? { durationValue: Number(durationValue), durationUnit } : {}),
            reason,
          },
        });
      }

      if (mode === 'warn') {
        await apiRequest({
          url: `/members/${selectedMember.id}/warn`,
          method: 'POST',
          data: { reason },
        });
      }

      if (mode === 'unmute') {
        await apiRequest({
          url: `/members/${selectedMember.id}/unmute`,
          method: 'POST',
        });
      }

      if (mode === 'unban') {
        await apiRequest({
          url: `/members/${selectedMember.id}/unban`,
          method: 'POST',
        });
      }

      resetModerationForm();
      toast.success('Ação aplicada com sucesso.');
      await Promise.all([loadMembers(filters), loadMemberDetails(selectedMember.id)]);
    } catch (nextError) {
      toast.error(getApiError(nextError, 'Falha ao executar a ação de moderação.'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderMemberHandle = (member: TelegramMember) =>
    member.telegramUsername ? `@${member.telegramUsername}` : 'Sem usuário público';

  return (
    <DashboardLayout>
      <div className="space-y-5 sm:space-y-6">
        <section className="rounded-[1.6rem] border border-slate-800/80 bg-slate-900/85 p-4 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-300 sm:text-sm">Membros</p>
              <h1 className="mt-3 text-xl font-semibold text-white sm:text-3xl">Perfis capturados pelo bot</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                Pesquise por nome ou usuário, abra o perfil com foto, acompanhe a atividade e aplique
                silenciamentos ou banimentos diretamente do painel.
              </p>
            </div>
          </div>

          <form
            className="mt-5 grid gap-2.5 sm:mt-6 sm:gap-3 lg:grid-cols-[1.4fr_0.8fr_0.8fr_auto]"
            onSubmit={handleFilterSubmit}
          >
            <input
              value={draftFilters.query}
              onChange={(event) => setDraftFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="Buscar por nome ou usuário"
              className="rounded-2xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500 sm:px-4 sm:py-3"
            />

            <select
              value={draftFilters.status}
              onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500 sm:px-4 sm:py-3"
            >
              <option value="">Todos os status</option>
              <option value="MEMBER">Membros</option>
              <option value="ADMIN">Administradores</option>
              <option value="BOT">Bots</option>
              <option value="MUTED">Silenciados</option>
              <option value="BANNED">Banidos</option>
            </select>

            <select
              value={draftFilters.type}
              onChange={(event) => setDraftFilters((current) => ({ ...current, type: event.target.value }))}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500 sm:px-4 sm:py-3"
            >
              <option value="">Todos os tipos</option>
              <option value="HUMAN">Humanos</option>
              <option value="BOT">Bots</option>
            </select>

            <button
              type="submit"
              className="w-full rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 lg:w-auto lg:px-5 lg:py-3"
            >
              Filtrar
            </button>
          </form>
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="rounded-[1.6rem] border border-slate-800/80 bg-slate-900/85 p-3 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-6">
          <div className="space-y-2.5 md:hidden">
            {!hasMembers && !loading && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                Nenhum membro encontrado. Verifique se o bot já entrou no grupo e sincronizou os dados.
              </div>
            )}

            {loading && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                Carregando membros...
              </div>
            )}

            {members.map((member) => (
              <article key={member.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
                <div className="flex gap-3">
                  <TelegramPhoto
                    endpoint={member.photoFileId ? `/members/${member.id}/photo` : null}
                    name={member.fullName}
                    alt={`Foto de ${member.fullName}`}
                    className="h-12 w-12 flex-none"
                    imageClassName="h-12 w-12 rounded-[0.95rem] object-cover"
                    fallbackClassName="flex h-12 w-12 items-center justify-center rounded-[0.95rem] bg-cyan-500/10 text-xs font-semibold text-cyan-200"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{member.fullName}</p>
                        <p className="mt-1 truncate text-xs text-slate-400">{renderMemberHandle(member)}</p>
                      </div>
                      <StatusBadge value={member.status} />
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-2.5 py-2">
                        <p>Mensagens</p>
                        <p className="mt-1 text-sm font-medium text-white">{member.messageCount}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-2.5 py-2">
                        <p>Última atividade</p>
                        <p className="mt-1 text-xs font-medium leading-4 text-white">{formatDateTime(member.lastMessageAt)}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleOpenMember(member.id)}
                      className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900 px-3.5 py-2.5 text-xs font-medium text-slate-100 transition hover:bg-slate-800"
                    >
                      Abrir perfil
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[780px] border-collapse text-left text-sm text-slate-200">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="px-3 py-3 font-medium">Membro</th>
                  <th className="px-3 py-3 font-medium">Telegram</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Mensagens</th>
                  <th className="px-3 py-3 font-medium">Última atividade</th>
                  <th className="px-3 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {!hasMembers && !loading && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                      Nenhum membro encontrado. Verifique se o bot já entrou no grupo e sincronizou os dados.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                      Carregando membros...
                    </td>
                  </tr>
                )}

                {members.map((member) => (
                  <tr key={member.id} className="border-b border-slate-800/70 hover:bg-slate-950/40">
                    <td className="px-3 py-4">
                      <div>
                        <p className="font-medium text-white">{member.fullName}</p>
                        <p className="text-xs text-slate-500">ID Telegram: {member.telegramId}</p>
                      </div>
                    </td>
                    <td className="px-3 py-4 text-slate-300">{renderMemberHandle(member)}</td>
                    <td className="px-3 py-4">
                      <StatusBadge value={member.status} />
                    </td>
                    <td className="px-3 py-4">{member.messageCount}</td>
                    <td className="px-3 py-4">{formatDateTime(member.lastMessageAt)}</td>
                    <td className="px-3 py-4">
                      <button
                        type="button"
                        onClick={() => void handleOpenMember(member.id)}
                        className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-800"
                      >
                        Abrir perfil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {selectedMember && (
          <div
            className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur sm:items-center sm:p-5"
            onClick={closeMemberModal}
          >
            <div
              className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[2rem] border border-slate-800/80 bg-slate-900/95 shadow-2xl shadow-black/40 sm:max-w-6xl sm:rounded-[2rem]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-4 border-b border-slate-800/80 px-4 py-4 sm:px-6">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-cyan-300 sm:text-sm">Perfil do membro</p>
                  <h2 className="mt-2 text-lg font-semibold text-white sm:text-2xl">{selectedMember.fullName}</h2>
                </div>

                <button
                  type="button"
                  onClick={closeMemberModal}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-800"
                >
                  Fechar
                </button>
              </div>

              <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
                <div className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
                  <article className="rounded-[1.6rem] border border-slate-800/80 bg-slate-900/85 p-4 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-4">
                        <TelegramPhoto
                          endpoint={`/members/${selectedMember.id}/photo`}
                          name={selectedMember.fullName}
                          alt={`Foto de ${selectedMember.fullName}`}
                          className="h-20 w-20 flex-none sm:h-24 sm:w-24"
                          imageClassName="h-20 w-20 rounded-[1.3rem] object-cover shadow-lg shadow-black/20 sm:h-24 sm:w-24 sm:rounded-[1.5rem]"
                          fallbackClassName="flex h-20 w-20 items-center justify-center rounded-[1.3rem] bg-cyan-500/10 text-xl font-semibold text-cyan-200 sm:h-24 sm:w-24 sm:rounded-[1.5rem] sm:text-2xl"
                        />

                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.25em] text-cyan-300 sm:text-sm">Resumo</p>
                          <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">{selectedMember.fullName}</h3>
                          <p className="mt-2 truncate text-sm text-slate-400">{renderMemberHandle(selectedMember)}</p>
                          <p className="mt-1 text-xs text-slate-500">ID Telegram: {selectedMember.telegramId}</p>
                        </div>
                      </div>

                      <StatusBadge value={selectedMember.status} />
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <p className="text-sm text-slate-400">Mensagens capturadas</p>
                        <p className="mt-2 text-2xl font-semibold text-white">{selectedMember.messageCount}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <p className="text-sm text-slate-400">Primeiro registro</p>
                        <p className="mt-2 text-sm text-white">{formatDate(selectedMember.firstMessageAt)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <p className="text-sm text-slate-400">Última mensagem</p>
                        <p className="mt-2 text-sm text-white">{formatDateTime(selectedMember.lastMessageAt)}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <p className="text-sm text-slate-400">Tipo</p>
                        <p className="mt-2 text-sm text-white">{selectedMember.isBot ? 'Bot' : 'Humano'}</p>
                      </div>
                    </div>

                    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 sm:p-5">
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => setActionType('mute')}
                          className={`w-full rounded-2xl px-4 py-2 text-sm font-medium transition sm:w-auto ${
                            actionType === 'mute'
                              ? 'bg-cyan-500 text-slate-950'
                              : 'border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                          }`}
                        >
                          Silenciar
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionType('ban')}
                          className={`w-full rounded-2xl px-4 py-2 text-sm font-medium transition sm:w-auto ${
                            actionType === 'ban'
                              ? 'bg-cyan-500 text-slate-950'
                              : 'border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                          }`}
                        >
                          Banir
                        </button>
                        <button
                          type="button"
                          onClick={() => setActionType('warn')}
                          className={`w-full rounded-2xl px-4 py-2 text-sm font-medium transition sm:w-auto ${
                            actionType === 'warn'
                              ? 'bg-cyan-500 text-slate-950'
                              : 'border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                          }`}
                        >
                          Advertir
                        </button>

                        {selectedMemberStatus === 'MUTED' && (
                          <button
                            type="button"
                            onClick={() => void handleModerationAction('unmute')}
                            disabled={submitting}
                            className="w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50 sm:w-auto"
                          >
                            Remover mute
                          </button>
                        )}

                        {selectedMemberStatus === 'BANNED' && (
                          <button
                            type="button"
                            onClick={() => void handleModerationAction('unban')}
                            disabled={submitting}
                            className="w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50 sm:w-auto"
                          >
                            Desbanir
                          </button>
                        )}
                      </div>

                      <div className="mt-5 grid gap-3">
                        <input
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="Motivo da ação"
                          className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                        />

                        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                          <input
                            value={durationValue}
                            onChange={(event) => setDurationValue(event.target.value)}
                            placeholder={actionType === 'mute' ? 'Valor da duração' : 'Valor da duração (opcional)'}
                            disabled={actionType === 'warn'}
                            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                          />

                          <select
                            value={durationUnit}
                            onChange={(event) => setDurationUnit(event.target.value as DurationUnit)}
                            disabled={actionType === 'warn'}
                            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                          >
                            <option value="SECONDS">Segundos</option>
                            <option value="MINUTES">Minutos</option>
                            <option value="DAYS">Dias</option>
                          </select>
                        </div>
                      </div>

                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        {actionType === 'mute'
                          ? 'Escolha a duração do silenciamento em segundos, minutos ou dias.'
                          : actionType === 'ban'
                            ? 'Para banimento temporário, informe valor e unidade. Para banimento permanente, deixe o valor em branco.'
                            : 'Ao atingir 3 advertências, o membro será banido automaticamente.'}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleModerationAction(actionType)}
                          className="w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50 sm:w-auto"
                        >
                          {submitting
                            ? 'Executando...'
                            : actionType === 'mute'
                              ? 'Aplicar silenciamento'
                              : actionType === 'ban'
                                ? 'Aplicar banimento'
                                : 'Aplicar advertência'}
                        </button>
                        <button
                          type="button"
                          disabled={detailsLoading}
                          onClick={() => void loadMemberDetails(selectedMember.id)}
                          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
                        >
                          {detailsLoading ? 'Atualizando...' : 'Atualizar perfil'}
                        </button>
                      </div>
                    </div>
                  </article>

                  <article className="rounded-[1.6rem] border border-slate-800/80 bg-slate-900/85 p-4 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-cyan-300 sm:text-sm">Histórico</p>
                        <h3 className="mt-3 text-xl font-semibold text-white sm:text-2xl">Logs do membro</h3>
                      </div>
                      {detailsLoading && <span className="text-sm text-slate-400">Atualizando...</span>}
                    </div>

                    <div className="mt-6 space-y-3">
                      {(selectedMember.actionLogs || []).length === 0 && (
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                          Este membro ainda não possui logs associados.
                        </div>
                      )}

                      {(selectedMember.actionLogs || []).map((log) => {
                        const durationText = formatModerationDuration(
                          log.durationValue,
                          log.durationUnit,
                          log.durationSeconds,
                          log.durationMinutes,
                        );

                        return (
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

                            <p className="mt-3 text-slate-300">{log.reason || 'Sem motivo informado.'}</p>
                            <p className="mt-2 text-xs leading-5 text-slate-500">
                              Autor: {log.actor?.username || 'Sistema'}
                              {durationText ? ` • ${durationText}` : ''}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default MembersPageContent;
