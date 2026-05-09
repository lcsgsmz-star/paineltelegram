import { useEffect, useState } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { StatusBadge } from '../components/StatusBadge';
import { apiRequest, getApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { TelegramMember } from '../lib/types';

export default function AdminsPage() {
  const [admins, setAdmins] = useState<TelegramMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadAdmins = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await apiRequest<TelegramMember[]>({
          url: '/members?status=ADMIN',
          method: 'GET',
        });
        setAdmins(response.data);
      } catch (error) {
        setError(getApiError(error, 'Não foi possível carregar os administradores.'));
      } finally {
        setLoading(false);
      }
    };

    void loadAdmins();
  }, []);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
          <p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Administradores</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Lista sincronizada pelo bot</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Esta tela mostra os perfis identificados como administradores do grupo na última sincronização.
          </p>
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          {!loading && admins.length === 0 && (
            <div className="rounded-3xl border border-slate-800/80 bg-slate-900/85 p-6 text-sm text-slate-400">
              Nenhum administrador foi sincronizado ainda.
            </div>
          )}

          {loading && (
            <div className="rounded-3xl border border-slate-800/80 bg-slate-900/85 p-6 text-sm text-slate-400">
              Carregando administradores...
            </div>
          )}

          {admins.map((admin) => (
            <article key={admin.id} className="rounded-3xl border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">{admin.fullName}</h2>
                  <p className="mt-2 text-sm text-slate-400">{admin.telegramUsername || 'Sem usuário público'}</p>
                </div>
                <StatusBadge value="ADMIN" />
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm text-slate-400">Mensagens registradas</p>
                  <p className="mt-2 text-lg font-semibold text-white">{admin.messageCount}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm text-slate-400">Última atividade</p>
                  <p className="mt-2 text-sm text-white">{formatDateTime(admin.lastMessageAt)}</p>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </DashboardLayout>
  );
}
