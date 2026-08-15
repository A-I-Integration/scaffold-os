'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  HardHat, LayoutDashboard, Warehouse, CalendarClock, Truck,
  KeyRound, Ruler, Navigation, LogOut, Menu, X, Database, TrendingUp, Timer, Route,
  FileText, Settings, BookOpen, HelpCircle,
} from 'lucide-react';

// ============================================================
// SCAFFOLD OS – SidebarLayout (Optik-Stufe 2)
// Ersetzt die obere Menüleiste (AuthNav) durch ein seitliches
// Menü im Software-Look (aus der Demo übernommen), aber mit
// dem ECHTEN Login und den ECHTEN Rollen aus Supabase.
//
// • Nicht eingeloggt → kein Menü (Startseite/Login bleiben
//   freie Seiten)
// • Eingeloggt → Sidebar links, Inhalte gefiltert nach Rolle
// • Einklappbar (Breit ↔ nur Icons), auf dem Handy startet
//   das Menü eingeklappt
// ============================================================

type RoleKey = 'admin' | 'disponent' | 'bauleiter' | 'mitarbeiter' | 'lager';

interface NavItem {
  href: string;
  label: string;
  icon: any;
  roles: RoleKey[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',      label: 'Dashboard',    icon: LayoutDashboard, roles: ['admin', 'disponent'] },
  { href: '/aufmass/schritt1', label: 'Aufmaß',     icon: Ruler,           roles: ['admin', 'bauleiter'] },
  { href: '/lager',          label: 'Lager',        icon: Warehouse,       roles: ['admin', 'disponent', 'bauleiter', 'lager'] },
  { href: '/prognose',       label: 'Prognose',     icon: TrendingUp,      roles: ['admin', 'disponent', 'lager'] },
  { href: '/planung',        label: 'Planung',      icon: CalendarClock,   roles: ['admin', 'disponent', 'bauleiter'] },
  { href: '/zeiterfassung',  label: 'Zeiterfassung', icon: Timer,           roles: ['admin', 'disponent', 'bauleiter'] }, // NEU (Nr. 6)
  { href: '/rechnungen',     label: 'Rechnungen',   icon: FileText,        roles: ['admin', 'disponent'] }, // NEU (Phase 13)
  { href: '/touren',         label: 'Touren',       icon: Truck,           roles: ['admin', 'disponent'] },
  { href: '/routenoptimierung', label: 'Routen-KI', icon: Route,           roles: ['admin', 'disponent'] }, // NEU (Nr. 7)
  { href: '/mitarbeiter',    label: 'Zugänge',      icon: KeyRound,        roles: ['admin', 'disponent'] },
  { href: '/datenpflege',    label: 'Datenpflege',  icon: Database,        roles: ['admin'] },
  { href: '/einstellungen',  label: 'Einstellungen', icon: Settings,       roles: ['admin'] }, // NEU (Phase 14)
  { href: '/meine-touren',   label: 'Meine Touren', icon: Navigation,      roles: ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'] },
  { href: '/hilfe',          label: 'Hilfe',        icon: HelpCircle,      roles: ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'] }, // NEU (Prio-2-Sprint)
];

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-red-500 text-white',
  disponent: 'bg-yellow-500 text-black',
  bauleiter: 'bg-green-500 text-white',
  mitarbeiter: 'bg-sky-500 text-white',
  lager: 'bg-purple-500 text-white',
};

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<{ role: string; full_name?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Auf dem Handy eingeklappt starten
    if (typeof window !== 'undefined' && window.innerWidth < 768) setOpen(false);

    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', user.id)
          .single();
        setProfile(data);
      }
      setLoading(false);
    }
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        supabase.from('profiles').select('role, full_name').eq('id', session.user.id).single()
          .then(({ data }) => setProfile(data));
      } else {
        setProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  // Nicht eingeloggt (oder lädt noch) → Seite ohne Menü anzeigen
  if (loading || !user) {
    return <>{children}</>;
  }

  const role = (profile?.role || 'mitarbeiter') as RoleKey;
  const items = NAV_ITEMS.filter(i => i.roles.includes(role));
  const isActive = (href: string) => {
    if (href === '/aufmass/schritt1') return pathname.startsWith('/aufmass');
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className="flex h-screen bg-slate-100">
      {/* ─── Sidebar ─── */}
      <aside className={`bg-slate-900 text-white flex flex-col transition-all duration-300 shrink-0 ${open ? 'w-60' : 'w-16'}`}>
        <div className="p-4 flex items-center justify-between border-b border-slate-700">
          {open && (
            <Link href="/" className="flex items-center gap-2">
              <HardHat className="w-6 h-6 text-amber-400" />
              <span className="font-bold text-lg tracking-tight">SCAFFOLD OS</span>
            </Link>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="p-1.5 hover:bg-slate-700 rounded-lg transition"
            aria-label="Menü umschalten"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  active ? 'bg-amber-500/15 text-amber-400' : 'hover:bg-slate-800 text-slate-200'
                } ${!open ? 'justify-center' : ''}`}
                title={!open ? item.label : undefined}
              >
                <item.icon className={`w-5 h-5 shrink-0 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                {open && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-700 space-y-2">
          {open && (
            <div className="bg-slate-800 rounded-lg px-3 py-2">
              <p className="text-xs font-medium text-white truncate">{profile?.full_name || user.email}</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_BADGE[role] || 'bg-gray-500 text-white'}`}>
                {role.toUpperCase()}
              </span>
            </div>
          )}
          {/* NEU: Benutzerhandbuch – ganz unten, für alle Rollen */}
          <a
            href="/handbuch.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 text-xs text-slate-400 hover:text-amber-400 transition-colors w-full px-2 py-1.5 rounded-lg hover:bg-slate-800 ${!open ? 'justify-center' : ''}`}
            title="Benutzerhandbuch (PDF)"
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            {open && 'Handbuch'}
          </a>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors w-full px-2 py-1.5 rounded-lg hover:bg-slate-800 ${!open ? 'justify-center' : ''}`}
            title="Abmelden"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {open && 'Abmelden'}
          </button>
        </div>
      </aside>

      {/* ─── Inhalt ─── */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
