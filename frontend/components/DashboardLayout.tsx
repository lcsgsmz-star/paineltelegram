import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode, useEffect, useState } from 'react';
import { clearSession, getStoredUser } from '../lib/api';
import { roleLabel } from '../lib/format';
import { SessionUser } from '../lib/types';

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

type SidebarContentProps = {
  currentUser: SessionUser | null;
  pathname: string;
  onLogout: () => void;
  onNavigate?: () => void;
};

function SidebarContent({ currentUser, pathname, onLogout, onNavigate }: SidebarContentProps) {
  return (
    <>
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div>
          <div className="text-lg font-bold text-cyan-300 sm:text-xl">AdministradorBot</div>
          <p className="mt-1.5 text-xs text-slate-400 sm:mt-2 sm:text-sm">Painel de controle do grupo</p>
        </div>
        {currentUser && (
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-2 text-right sm:px-3">
            <p className="text-xs font-semibold text-white sm:text-sm">{currentUser.username}</p>
            <p className="text-xs text-cyan-100/80">{roleLabel(currentUser.role)}</p>
          </div>
        )}
      </div>

      {currentUser && (
        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300 sm:mt-5 sm:p-4">
          <p className="truncate text-white">{currentUser.email}</p>
          <p className="mt-1 text-xs text-slate-500">Sessão ativa no painel</p>
        </div>
      )}

      <nav className="mt-5 grid gap-1.5 sm:mt-6 sm:gap-2">
        {menu.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`block rounded-xl px-3.5 py-2.5 text-[13px] transition sm:px-4 sm:py-3 sm:text-sm ${
              pathname === item.href
                ? 'border border-cyan-500/30 bg-cyan-500/20 text-cyan-300'
                : 'border border-transparent text-slate-300 hover:bg-slate-800/80'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <button
        onClick={onLogout}
        className="mt-5 w-full rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-200 transition hover:bg-rose-500/20 sm:mt-6 sm:py-3"
      >
        Encerrar sessão
      </button>
    </>
  );
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setCurrentUser(getStoredUser());
    setMobileMenuOpen(false);
  }, [router.pathname]);

  const handleLogout = () => {
    setMobileMenuOpen(false);
    clearSession();
    router.push('/login');
  };

  const currentSection = menu.find((item) => item.href === router.pathname)?.label || 'Painel';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#13203d_0%,#0b1224_45%,#050816_100%)] text-slate-100">
      <div className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur md:hidden">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-3 py-3">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-cyan-300">AdministradorBot</p>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">{currentSection}</p>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            className="rounded-2xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-800"
          >
            {mobileMenuOpen ? 'Fechar' : 'Menu'}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/80 px-3 py-3 backdrop-blur md:hidden">
          <div className="mx-auto h-full max-w-md overflow-hidden rounded-[1.75rem] border border-slate-800/80 bg-slate-900/95 shadow-2xl shadow-black/30">
            <div className="h-full overflow-y-auto p-4">
              <SidebarContent
                currentUser={currentUser}
                pathname={router.pathname}
                onLogout={handleLogout}
                onNavigate={() => setMobileMenuOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-3 py-3 md:flex-row md:gap-6 md:px-6 md:py-4">
        <aside className="hidden w-72 overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-900/85 shadow-2xl shadow-black/20 backdrop-blur md:sticky md:top-4 md:block md:h-[calc(100vh-2rem)]">
          <div className="h-full overflow-y-auto p-5">
            <SidebarContent currentUser={currentUser} pathname={router.pathname} onLogout={handleLogout} />
          </div>
        </aside>

        <main className="min-w-0 flex-1 pb-8">{children}</main>
      </div>
    </div>
  );
}
