import { FormEvent, useEffect, useState } from 'react';
import { DashboardLayout } from '../components/DashboardLayout';
import { usePanelToast } from '../components/PanelToastProvider';
import { StatusBadge } from '../components/StatusBadge';
import { apiRequest, fetchCurrentUser, getApiError } from '../lib/api';
import { formatDateTime, roleLabel } from '../lib/format';
import { PanelUser } from '../lib/types';

const permissionOptions = [
  { value: 'VIEW_LOGS', label: 'Ver logs' },
  { value: 'MANAGE_MEMBERS', label: 'Moderar membros' },
  { value: 'MANAGE_FORBIDDEN_WORDS', label: 'Gerenciar palavras proibidas' },
  { value: 'MANAGE_BOT', label: 'Gerenciar bot' },
  { value: 'MANAGE_PANEL_USERS', label: 'Gerenciar acessos' },
];

export default function PanelUsersPage() {
  const toast = usePanelToast();
  const [currentUser, setCurrentUser] = useState<PanelUser | null>(null);
  const [users, setUsers] = useState<PanelUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'ADMIN',
    permissions: ['VIEW_LOGS'],
  });

  const isOwner = currentUser?.role === 'OWNER';

  const loadUsers = async () => {
    setLoading(true);
    setError('');

    try {
      const [meResponse, usersResponse] = await Promise.all([
        fetchCurrentUser(),
        apiRequest<PanelUser[]>({ url: '/panel-users', method: 'GET' }),
      ]);

      setCurrentUser(meResponse);
      setUsers(usersResponse.data);
    } catch (error) {
      setError(getApiError(error, 'Não foi possível carregar os usuários do painel.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      await apiRequest({
        url: '/panel-users',
        method: 'POST',
        data: form,
      });

      setForm({
        username: '',
        email: '',
        password: '',
        role: 'ADMIN',
        permissions: ['VIEW_LOGS'],
      });
      toast.success('Usuário criado com sucesso.');
      await loadUsers();
    } catch (error) {
      toast.error(getApiError(error, 'Não foi possível criar o usuário.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: PanelUser) => {
    try {
      await apiRequest({
        url: `/panel-users/${user.id}/status`,
        method: 'PATCH',
        data: { isActive: !user.isActive },
      });
      toast.success(`Usuário ${user.isActive ? 'desativado' : 'ativado'} com sucesso.`);
      await loadUsers();
    } catch (error) {
      toast.error(getApiError(error, 'Não foi possível atualizar o status do usuário.'));
    }
  };

  const handleDelete = async (user: PanelUser) => {
    if (!window.confirm(`Remover o usuário ${user.username}?`)) {
      return;
    }

    try {
      await apiRequest({
        url: `/panel-users/${user.id}`,
        method: 'DELETE',
      });
      toast.success('Usuário removido com sucesso.');
      await loadUsers();
    } catch (error) {
      toast.error(getApiError(error, 'Não foi possível remover o usuário.'));
    }
  };

  const togglePermission = (permission: string) => {
    setForm((current) => {
      const permissions = current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission];
      return { ...current, permissions };
    });
  };

  const formatPermissions = (rawPermissions?: string) => {
    try {
      const permissions = JSON.parse(rawPermissions || '[]') as string[];
      if (!permissions.length) return 'Sem permissões extras';
      return permissions
        .map((permission) => permissionOptions.find((option) => option.value === permission)?.label || permission)
        .join(', ');
    } catch {
      return 'Permissões não identificadas';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
          <p className="text-sm uppercase tracking-[0.25em] text-cyan-300">Acesso interno</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Usuários do painel</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            O owner pode criar novos acessos, ativar ou desativar contas e controlar quem opera o painel.
          </p>
        </section>

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">Seu acesso</h2>
                <p className="mt-2 text-sm text-slate-400">Informações da sessão atual.</p>
              </div>
              {currentUser && <StatusBadge value={currentUser.role} kind="role" />}
            </div>

            {currentUser && (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm text-slate-400">Usuario</p>
                  <p className="mt-2 text-lg font-semibold text-white">{currentUser.username}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm text-slate-400">E-mail</p>
                  <p className="mt-2 text-sm text-white">{currentUser.email}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm text-slate-400">Permissão</p>
                  <p className="mt-2 text-sm text-white">{roleLabel(currentUser.role)}</p>
                </div>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
              {isOwner
                ? 'Seu perfil possui acesso total para criar, ativar, desativar e remover usuários do painel.'
                : 'Seu perfil pode consultar a lista, mas a criação e a gestão de contas ficam restritas ao owner.'}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-800/80 bg-slate-900/85 p-6 shadow-xl shadow-black/20">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Lista de acessos</h2>
                <p className="mt-2 text-sm text-slate-400">Contas autorizadas a entrar no painel.</p>
              </div>
            </div>

            {isOwner && (
              <form className="mt-6 grid gap-3 rounded-3xl border border-slate-800 bg-slate-950/60 p-4 md:grid-cols-2" onSubmit={handleCreateUser}>
                <input
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  placeholder="Username"
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                />
                <input
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="email@painel.local"
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                />
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Senha com 8+ caracteres"
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                />
                <select
                  value={form.role}
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 outline-none transition focus:border-cyan-500"
                >
                  <option value="SUB_OWNER">Sub dono</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="HELPER">Ajudante</option>
                  <option value="MODERATOR">Moderador</option>
                </select>
                <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:col-span-2">
                  <p className="text-sm font-medium text-white">Permissões do administrador</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {permissionOptions.map((permission) => (
                      <label
                        key={permission.value}
                        className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(permission.value)}
                          onChange={() => togglePermission(permission.value)}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500"
                        />
                        {permission.label}
                      </label>
                    ))}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50 md:col-span-2"
                >
                  {submitting ? 'Criando usuário...' : 'Criar usuário'}
                </button>
              </form>
            )}

            <div className="mt-6 space-y-3">
              {loading && <div className="text-sm text-slate-400">Carregando usuários...</div>}

              {!loading &&
                users.map((user) => (
                  <article
                    key={user.id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-200"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="font-semibold text-white">{user.username}</p>
                          <StatusBadge value={user.role} kind="role" />
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              user.isActive ? 'bg-emerald-500/10 text-emerald-200' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {user.isActive ? 'Ativo' : 'Desativado'}
                          </span>
                        </div>
                        <p className="mt-2 text-slate-400">{user.email}</p>
                        <p className="mt-1 text-xs text-slate-400">{formatPermissions(user.permissions)}</p>
                        <p className="mt-1 text-xs text-slate-500">Criado em {formatDateTime(user.createdAt)}</p>
                      </div>

                      {isOwner && user.role !== 'OWNER' && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleToggleStatus(user)}
                            className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-800"
                          >
                            {user.isActive ? 'Desativar' : 'Ativar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(user)}
                            className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
                          >
                            Remover
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
