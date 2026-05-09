import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode } from 'react';

const menu = [
  { label: 'Dashboard', href: '/' },
  { label: 'Membros', href: '/members' },
  { label: 'Administradores', href: '/admins' },
  { label: 'Bots', href: '/bots' },
  { label: 'Moderação', href: '/moderation' },
  { label: 'Logs', href: '/logs' },
  { label: 'Usuários', href: '/panel-users' },
  { label: 'Configurações', href: '/settings' },
];

export function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex">
        <aside className="w-72 border-r border-slate-800 bg-slate-900 p-6 flex flex-col h-screen fixed left-0 top-0">
          <div className="mb-10">
            <div className="text-xl font-bold text-cyan-400">🤖 AdministradorBot</div>
            <p className="mt-2 text-sm text-slate-400">Painel de Controle</p>
          </div>
          <nav className="space-y-2 flex-1 overflow-y-auto">
            {menu.map((item) => (
              <Link 
                key={item.href} 
                href={item.href} 
                className={`block rounded-xl px-4 py-3 text-sm transition ${
                  router.pathname === item.href 
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={handleLogout}
            className="w-full rounded-xl bg-red-900/20 px-4 py-3 text-sm text-red-300 hover:bg-red-900/40 transition border border-red-900/30 font-medium"
          >
            🚪 Sair
          </button>
        </aside>
        <main className="flex-1 p-6 ml-72 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
