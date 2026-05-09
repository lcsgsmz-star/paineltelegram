import { FormEvent, useEffect, useState } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { usePanelToast } from '../components/PanelToastProvider';
import { StatusBadge } from '../components/StatusBadge';
import { apiRequest, getApiError } from '../lib/api';
import { formatDateTime, formatModerationDuration } from '../lib/format';
import { ActionLog, ForbiddenWord, ModerationSettings, TelegramMember } from '../lib/types';

type DurationUnit = 'SECONDS' | 'MINUTES' | 'DAYS';
type ForbiddenPunishment = 'WARNING' | 'MUTE' | 'BAN';

export default function ModerationPage() {
  const toast = usePanelToast();
  const [mutedMembers, setMutedMembers] = useState<TelegramMember[]>([]);
  const [bannedMembers, setBannedMembers] = useState<TelegramMember[]>([]);
  const [forbiddenWords, setForbiddenWords] = useState<ForbiddenWord[]>([]);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingWords, setSavingWords] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [error, setError] = useState('');
  const [wordInput, setWordInput] = useState('');
  const [punishment, setPunishment] = useState<ForbiddenPunishment>('WARNING');
  const [durationValue, setDurationValue] = useState('60');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('MINUTES');
  const [confirmedPunishment, setConfirmedPunishment] = useState<ForbiddenPunishment>('WARNING');
  const [confirmedDurationValue, setConfirmedDurationValue] = useState('60');
  const [confirmedDurationUnit, setConfirmedDurationUnit] = useState<DurationUnit>('MINUTES');
  const [settings, setSettings] = useState<ModerationSettings>({
    floodEnabled: false,
    floodMessageLimit: 5,
    floodTimeWindowSeconds: 10,
    floodPunishment: 'MUTE',
    floodDurationValue: 10,
    floodDurationUnit: 'MINUTES',
    inlineBotsEnabled: true,
    allowedInlineBots: [],
    inlineBotPunishment: 'WARNING',
    inlineBotDurationValue: 10,
    inlineBotDurationUnit: 'MINUTES',
    scheduledAnnouncementsEnabled: false,
  });
  const [allowedInlineBotsInput, setAllowedInlineBotsInput] = useState('');

  const loadModerationData = async () => {
    setLoading(true);
    setError('');

    try {
      const [mutedResponse, bannedResponse, logsResponse, forbiddenResponse, settingsResponse] = await Promise.all([
        apiRequest<TelegramMember[]>({ url: '/members?status=MUTED', method: 'GET' }),
        apiRequest<TelegramMember[]>({ url: '/members?status=BANNED', method: 'GET' }),
        apiRequest<ActionLog[]>({ url: '/logs', method: 'GET' }),
        apiRequest<ForbiddenWord[]>({ url: '/forbidden-words', method: 'GET' }),
        apiRequest<ModerationSettings>({ url: '/moderation-settings', method: 'GET' }),
      ]);

      setMutedMembers(mutedResponse.data);
      setBannedMembers(bannedResponse.data);
      setForbiddenWords(forbiddenResponse.data);
      setSettings(settingsResponse.data);
      setAllowedInlineBotsInput(settingsResponse.data.allowedInlineBots.map((bot) => `@${bot}`).join(', '));
      setLogs(
        logsResponse.data.filter((log) =>
          ['MUTE', 'UNMUTE', 'BAN', 'UNBAN', 'WARNING'].includes(log.type),
        ).slice(0, 10),
      );
    } catch (error) {
      setError(getApiError(error, 'Não foi possível carregar o centro de moderação.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadModerationData();
  }, []);

  const handleRestore = async (memberId: number, action: 'unmute' | 'unban') => {
    try {
      await apiRequest({
        url: `/members/${memberId}/${action}`,
        method: 'POST',
      });
      toast.success(action === 'unban' ? 'Membro desbanido com sucesso.' : 'Silenciamento removido com sucesso.');
      await loadModerationData();
    } catch (error) {
      toast.error(getApiError(error, 'Não foi possível reverter a ação.'));
    }
  };

  const handleCreateForbiddenWords = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!wordInput.trim()) {
      toast.error('Informe pelo menos uma palavra proibida.');
      return;
    }

    if (!confirmedDurationValue || Number(confirmedDurationValue) < 1) {
      toast.error('Defina um tempo válido para a punição.');
      return;
    }

    setSavingWords(true);
    try {
      const response = await apiRequest<ForbiddenWord[]>({
        url: '/forbidden-words',
        method: 'POST',
        data: {
          words: wordInput,
          punishment: confirmedPunishment,
          durationValue: Number(confirmedDurationValue),
          durationUnit: confirmedDurationUnit,
        },
      });
      setForbiddenWords(response.data);
      setWordInput('');
      toast.success('Palavras proibidas salvas com sucesso.');
    } catch (error) {
      toast.error(getApiError(error, 'Não foi possível salvar as palavras proibidas.'));
    } finally {
      setSavingWords(false);
    }
  };

  const handleConfirmPunishment = () => {
    if (!durationValue || Number(durationValue) < 1) {
      toast.error('Defina um tempo válido para a punição.');
      return;
    }

    setConfirmedPunishment(punishment);
    setConfirmedDurationValue(durationValue);
    setConfirmedDurationUnit(durationUnit);
    toast.success('Punição confirmada para as próximas palavras proibidas.');
  };

  const handleDeleteForbiddenWord = async (id: number) => {
    try {
      await apiRequest({ url: `/forbidden-words/${id}`, method: 'DELETE' });
      setForbiddenWords((current) => current.filter((item) => item.id !== id));
      toast.success('Palavra proibida removida.');
    } catch (error) {
      toast.error(getApiError(error, 'Não foi possível remover a palavra proibida.'));
    }
  };

  const handleSaveSettings = async (event: FormEvent<HTMLFormElement>, label = 'Configurações') => {
    event.preventDefault();
    setSavingSettings(true);

    try {
      const payload = {
        ...settings,
        floodMessageLimit: Number(settings.floodMessageLimit),
        floodTimeWindowSeconds: Number(settings.floodTimeWindowSeconds),
        floodDurationValue: Number(settings.floodDurationValue),
        inlineBotDurationValue: Number(settings.inlineBotDurationValue),
        allowedInlineBots: allowedInlineBotsInput
          .split(/[,\n\r]+/)
          .map((bot) => bot.replace(/^@/, '').trim().toLowerCase())
          .filter(Boolean),
      };
      const response = await apiRequest<ModerationSettings>({
        url: '/moderation-settings',
        method: 'PATCH',
        data: payload,
      });
      setSettings(response.data);
      setAllowedInlineBotsInput(response.data.allowedInlineBots.map((bot) => `@${bot}`).join(', '));
      toast.success(`${label} salvo com sucesso.`);
    } catch (error) {
      toast.error(getApiError(error, 'Não foi possível salvar as configurações de moderação.'));
    } finally {
      setSavingSettings(false);
    }
  };

  const punishmentLabel = (value: ForbiddenPunishment | string) => {
    if (value === 'WARNING') return 'Advertência';
    if (value === 'MUTE') return 'Mute';
    return 'Ban';
  };

  const punishmentTimePlaceholder = {
    WARNING: 'Tempo da advertência',
    MUTE: 'Tempo do mute',
    BAN: 'Tempo do ban',
  }[punishment];

  const confirmedPunishmentSummary = `${punishmentLabel(confirmedPunishment)} por ${formatModerationDuration(
    Number(confirmedDurationValue),
    confirmedDurationUnit,
    null,
    null,
  )}`;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
          <p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Centro de moderação</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Punições ativas e reversões</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Acompanhe quem está silenciado ou banido no momento e desfaça a ação quando necessário.
          </p>
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
          <h2 className="text-xl font-semibold text-white">Configurações automáticas</h2>
          <div className="mt-5 grid gap-6 xl:grid-cols-2">
            <form className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5" onSubmit={(event) => handleSaveSettings(event, 'Flood')}>
              <label className="flex items-center gap-3 text-sm font-medium text-white">
                <input
                  type="checkbox"
                  checked={settings.floodEnabled}
                  onChange={(event) => setSettings((current) => ({ ...current, floodEnabled: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500"
                />
                Ativar proteção contra flood
              </label>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Defina quantas mensagens em quantos segundos serão consideradas flood e qual punição será aplicada.
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Mensagens: limite permitido. Segundos: intervalo observado. Punição: ação tomada. Tempo: duração da punição.
              </p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <label className="space-y-2">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                    Quantidade de mensagens
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={settings.floodMessageLimit}
                    onChange={(event) => setSettings((current) => ({ ...current, floodMessageLimit: Number(event.target.value) }))}
                    placeholder="Ex: 5 mensagens"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                  />
                  <span className="block text-xs leading-5 text-slate-500">Número máximo de mensagens que o membro pode enviar.</span>
                </label>
                <label className="space-y-2">
                  <span className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                    Tempo observado
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={settings.floodTimeWindowSeconds}
                    onChange={(event) => setSettings((current) => ({ ...current, floodTimeWindowSeconds: Number(event.target.value) }))}
                    placeholder="Ex: 10 segundos"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                  />
                  <span className="block text-xs leading-5 text-slate-500">Intervalo, em segundos, usado para contar as mensagens.</span>
                </label>
                <select
                  value={settings.floodPunishment}
                  onChange={(event) => setSettings((current) => ({ ...current, floodPunishment: event.target.value as ForbiddenPunishment }))}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                >
                  <option value="WARNING">Advertência</option>
                  <option value="MUTE">Mute</option>
                  <option value="BAN">Ban</option>
                </select>
                <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
                  <input
                    type="number"
                    min="1"
                    value={settings.floodDurationValue}
                    onChange={(event) => setSettings((current) => ({ ...current, floodDurationValue: Number(event.target.value) }))}
                    placeholder="Duração"
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                  />
                  <select
                    value={settings.floodDurationUnit}
                    onChange={(event) => setSettings((current) => ({ ...current, floodDurationUnit: event.target.value as DurationUnit }))}
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                  >
                    <option value="SECONDS">Segundos</option>
                    <option value="MINUTES">Minutos</option>
                    <option value="DAYS">Dias</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={savingSettings}
                className="mt-5 w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
              >
                {savingSettings ? 'Salvando flood...' : 'Salvar flood'}
              </button>
            </form>

            <form className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5" onSubmit={(event) => handleSaveSettings(event, 'Bots inline')}>
              <label className="flex items-center gap-3 text-sm font-medium text-white">
                <input
                  type="checkbox"
                  checked={settings.inlineBotsEnabled}
                  onChange={(event) => setSettings((current) => ({ ...current, inlineBotsEnabled: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500"
                />
                Proibir bots inline não permitidos
              </label>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Informe quais bots inline podem ser usados. Qualquer outro bot inline será bloqueado e punido.
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Bots permitidos: exceções liberadas. Punição: ação tomada. Tempo: duração da punição.
              </p>
              <textarea
                value={allowedInlineBotsInput}
                onChange={(event) => setAllowedInlineBotsInput(event.target.value)}
                rows={3}
                placeholder="@gif, @meubot"
                className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
              />
              <p className="mt-2 text-xs leading-5 text-slate-500">Separe os bots por vírgula, por exemplo: @gif, @meubot.</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <select
                  value={settings.inlineBotPunishment}
                  onChange={(event) => setSettings((current) => ({ ...current, inlineBotPunishment: event.target.value as ForbiddenPunishment }))}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                >
                  <option value="WARNING">Advertência</option>
                  <option value="MUTE">Mute</option>
                  <option value="BAN">Ban</option>
                </select>
                <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
                  <input
                    type="number"
                    min="1"
                    value={settings.inlineBotDurationValue}
                    onChange={(event) => setSettings((current) => ({ ...current, inlineBotDurationValue: Number(event.target.value) }))}
                    placeholder="Duração"
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                  />
                  <select
                    value={settings.inlineBotDurationUnit}
                    onChange={(event) => setSettings((current) => ({ ...current, inlineBotDurationUnit: event.target.value as DurationUnit }))}
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                  >
                    <option value="SECONDS">Segundos</option>
                    <option value="MINUTES">Minutos</option>
                    <option value="DAYS">Dias</option>
                  </select>
                </div>
              </div>
              <button
                type="submit"
                disabled={savingSettings}
                className="mt-5 w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
              >
                {savingSettings ? 'Salvando bots inline...' : 'Salvar bots inline'}
              </button>
            </form>
          </div>
          <form
            className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-5"
            onSubmit={(event) => handleSaveSettings(event, 'Avisos automáticos')}
          >
            <label className="flex items-center gap-3 text-sm font-medium text-white">
              <input
                type="checkbox"
                checked={settings.scheduledAnnouncementsEnabled}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, scheduledAnnouncementsEnabled: event.target.checked }))
                }
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500"
              />
              Ativar avisos automáticos pelo bot
            </label>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Quando estiver ativo, o owner e sub dono poderão abrir o assistente no /start do bot para criar mensagens recorrentes com botões.
            </p>
            <button
              type="submit"
              disabled={savingSettings}
              className="mt-5 w-full rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
            >
              {savingSettings ? 'Salvando avisos...' : 'Salvar avisos automáticos'}
            </button>
          </form>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
            <h2 className="text-xl font-semibold text-white">Palavras proibidas</h2>
            <form className="mt-5 space-y-4" onSubmit={handleCreateForbiddenWords}>
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                <p className="font-medium text-white">Exemplo de formatação</p>
                <p className="mt-1 text-cyan-100/90">spam, golpe, ofensiva, 🚫, #proibido</p>
                <p className="mt-1 text-xs text-cyan-100/70">Use uma palavra, emoji ou símbolo após a vírgula para adicionar vários de uma vez.</p>
              </div>

              <textarea
                value={wordInput}
                onChange={(event) => setWordInput(event.target.value)}
                placeholder={'Digite palavras, emojis ou símbolos separados por vírgula: spam, golpe, 🚫, #proibido'}
                rows={6}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
              />

              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-sm font-medium text-white">Punição aplicada</p>
                <p className="mt-1 text-xs text-slate-400">
                  Punição confirmada: <span className="text-cyan-200">{confirmedPunishmentSummary}</span>
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_150px]">
                  <select
                    value={punishment}
                    onChange={(event) => setPunishment(event.target.value as ForbiddenPunishment)}
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                  >
                    <option value="WARNING">Advertência</option>
                    <option value="MUTE">Mute</option>
                    <option value="BAN">Ban</option>
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={durationValue}
                    onChange={(event) => setDurationValue(event.target.value)}
                    placeholder={punishmentTimePlaceholder}
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                  />

                  <select
                    value={durationUnit}
                    onChange={(event) => setDurationUnit(event.target.value as DurationUnit)}
                    className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500"
                  >
                    <option value="SECONDS">Segundos</option>
                    <option value="MINUTES">Minutos</option>
                    <option value="DAYS">Dias</option>
                  </select>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleConfirmPunishment}
                    className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
                  >
                    Confirmar punição
                  </button>
                  <button
                    type="submit"
                    disabled={savingWords}
                    className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {savingWords ? 'Salvando...' : 'Confirmar palavras'}
                  </button>
                </div>
              </div>
            </form>
          </article>

          <article className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
            <h2 className="text-xl font-semibold text-white">Lista cadastrada</h2>
            <div className="mt-5 space-y-3">
              {!loading && forbiddenWords.length === 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                  Nenhuma palavra proibida cadastrada.
                </div>
              )}

              {forbiddenWords.map((item) => {
                const duration = formatModerationDuration(
                  item.durationValue,
                  item.durationUnit,
                  item.durationSeconds,
                  item.durationSeconds ? Math.max(1, Math.ceil(item.durationSeconds / 60)) : null,
                );

                return (
                  <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-white">{item.word}</p>
                        <p className="mt-1 text-slate-400">
                          {punishmentLabel(item.punishment)}
                          {duration ? ` • ${duration}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteForbiddenWord(item.id)}
                        className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <article className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Membros silenciados</h2>
                <p className="mt-2 text-sm text-slate-400">Lista atual de restrições temporárias.</p>
              </div>
              <StatusBadge value="MUTED" />
            </div>

            <div className="mt-6 space-y-3">
              {!loading && mutedMembers.length === 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                  Nenhum membro silenciado no momento.
                </div>
              )}

              {loading && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                  Carregando silencios...
                </div>
              )}

              {mutedMembers.map((member) => (
                <div key={member.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-white">{member.fullName}</p>
                      <p className="mt-1 text-slate-400">{member.telegramUsername || 'Sem usuário público'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestore(member.id, 'unmute')}
                      className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                    >
                      Remover mute
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Membros banidos</h2>
                <p className="mt-2 text-sm text-slate-400">Usuários removidos do grupo pelo painel.</p>
              </div>
              <StatusBadge value="BANNED" />
            </div>

            <div className="mt-6 space-y-3">
              {!loading && bannedMembers.length === 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                  Nenhum membro banido no momento.
                </div>
              )}

              {loading && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                  Carregando banimentos...
                </div>
              )}

              {bannedMembers.map((member) => (
                <div key={member.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-white">{member.fullName}</p>
                      <p className="mt-1 text-slate-400">{member.telegramUsername || 'Sem usuário público'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRestore(member.id, 'unban')}
                      className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/20"
                    >
                      Desbanir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
          <h2 className="text-xl font-semibold text-white">Histórico recente de moderação</h2>
          <p className="mt-2 text-sm text-slate-400">Últimas ações aplicadas ou revertidas pelo painel.</p>

          <div className="mt-6 space-y-3">
            {!loading && logs.length === 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-5 text-sm text-slate-400">
                Ainda não há ações de moderação registradas.
              </div>
            )}

            {logs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge value={log.type} kind="action" />
                    <span className="font-medium text-white">{log.targetMember?.fullName || 'Membro não identificado'}</span>
                  </div>
                  <span className="text-xs text-slate-500">{formatDateTime(log.createdAt)}</span>
                </div>
                {log.reason && <p className="mt-3 text-slate-300">{log.reason}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
