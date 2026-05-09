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
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex">
        <aside className="w-72 border-r border-slate-800 bg-slate-900 p-6">
          <div className="mb-10">
            <div className="text-lg font-semibold">Painel Telegram</div>
            <p className="mt-2 text-sm text-slate-400">Supergrupo privado</p>
          </div>
          <nav className="space-y-2">
            {menu.map((item) => (
              <Link key={item.href} href={item.href} className={`block rounded-xl px-4 py-3 text-sm ${router.pathname === item.href ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
