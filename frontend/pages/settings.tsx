import { useEffect, useState } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { apiRequest, fetchCurrentUser, getApiError } from '../lib/api';
import { formatDateTime, roleLabel } from '../lib/format';
import { BotStatus, PanelUser, TelegramGroup } from '../lib/types';

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<PanelUser | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [group, setGroup] = useState<TelegramGroup | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      setError('');

      try {
        const [meResponse, botResponse, groupResponse] = await Promise.all([
          fetchCurrentUser(),
          apiRequest<BotStatus>({ url: '/bot/status', method: 'GET' }),
          apiRequest<TelegramGroup | null>({ url: '/group', method: 'GET' }),
        ]);

        setCurrentUser(meResponse);
        setBotStatus(botResponse.data);
        setGroup(groupResponse.data);
      } catch (error) {
        setError(getApiError(error, 'Não foi possível carregar as configurações.'));
      }
    };

    void loadSettings();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
          <p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Configurações operacionais</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Referência rápida do ambiente</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Esta tela resume informações do usuário atual, da API e do bot para ajudar no suporte do painel.
          </p>
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
            <h2 className="text-xl font-semibold text-white">Sessão do painel</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-sm text-slate-400">Usuario</p>
                <p className="mt-2 text-lg font-semibold text-white">{currentUser?.username || 'Não carregado'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-sm text-slate-400">E-mail</p>
                <p className="mt-2 text-sm text-white">{currentUser?.email || '-'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-sm text-slate-400">Permissão</p>
                <p className="mt-2 text-sm text-white">{currentUser ? roleLabel(currentUser.role) : '-'}</p>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
            <h2 className="text-xl font-semibold text-white">API e bot</h2>
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-sm text-slate-400">API configurada no frontend</p>
                <p className="mt-2 text-sm text-white">{process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-sm text-slate-400">Token do bot</p>
                <p className="mt-2 text-sm text-white">{botStatus?.tokenConfigured ? 'Configurado' : 'Não configurado'}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-sm text-slate-400">Última sincronização</p>
                <p className="mt-2 text-sm text-white">{formatDateTime(botStatus?.lastSyncAt)}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-sm text-slate-400">Grupo associado</p>
                <p className="mt-2 text-sm text-white">{group?.title || 'Nenhum grupo salvo'}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
