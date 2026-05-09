import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiRequest, getApiError, getStoredToken, setSession } from '../lib/api';
import { AuthResponse } from '../lib/types';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (getStoredToken()) {
      router.replace('/');
    }
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      const response = await apiRequest<AuthResponse>({
        url: '/auth/login',
        method: 'POST',
        data: { username, password },
      });

      setSession(response.data);
      setMessage('Login realizado com sucesso.');
      router.push('/');
    } catch (error) {
      setMessage(getApiError(error, 'Erro ao fazer login'));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#15315d_0%,#081126_48%,#03060f_100%)] px-4 py-10 text-slate-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="hidden rounded-[2rem] border border-slate-800/80 bg-slate-900/60 p-10 shadow-2xl shadow-black/30 backdrop-blur lg:block">
            <p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Telegram Control Center</p>
            <h1 className="mt-5 text-5xl font-semibold leading-tight text-white">
              Painel privado para moderar seu supergrupo com o bot conectado.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">
              Entre no painel para acompanhar membros, sincronizar o grupo, aplicar silenciamentos,
              banimentos e auditar tudo em um único lugar.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { label: 'Sincronização', value: 'Grupo + bot' },
                { label: 'Moderação', value: 'Mute e ban' },
                { label: 'Auditoria', value: 'Logs completos' },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                  <p className="text-sm text-slate-400">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-8 shadow-2xl shadow-black/30 backdrop-blur sm:p-10">
            <div className="text-center">
              <p className="text-sm uppercase tracking-[0.28em] text-cyan-300">Acesso restrito</p>
              <h2 className="mt-4 text-3xl font-semibold text-white">Entrar no admdotcbot</h2>
              <p className="mt-3 text-sm text-slate-400">
                Use o usuário do painel para acessar membros, logs e configurações do bot.
              </p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div>
                <label className="text-sm font-medium text-slate-300">Usuario ou e-mail</label>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={isLoading}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500 disabled:opacity-50"
                  placeholder="admin"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isLoading}
                  className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500 disabled:opacity-50"
                  placeholder="Sua senha"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
              >
                {isLoading ? 'Entrando...' : 'Entrar no painel'}
              </button>
            </form>

            {message && (
              <div
                className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
                  message.toLowerCase().includes('sucesso')
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                }`}
              >
                {message}
              </div>
            )}

            <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
              <p className="font-medium text-slate-200">Ambiente esperado</p>
              <p className="mt-2">API: {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
