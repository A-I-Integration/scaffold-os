'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  HardHat, LayoutDashboard, Warehouse, CalendarClock, Truck,
  KeyRound, Ruler, Navigation, LogOut, Menu, X, Database, TrendingUp, Timer, Route,
  FileText, Settings, BookOpen, HelpCircle, Upload, Euro, Users, Handshake, ClipboardList,
} from 'lucide-react';

// ============================================================
// SCAFFOLD OS – SidebarLayout (Optik-Stufe 3: Apple-Look)
// Helle Sidebar, Brand-Orange #E8590C als Akzentfarbe,
// dezente Linien und weiche Abstände.
// Logik UNVERÄNDERT: echtes Login, echte Rollen aus Supabase,
// einklappbar, auf dem Handy startet das Menü eingeklappt.
// ============================================================

type RoleKey = 'admin' | 'disponent' | 'bauleiter' | 'mitarbeiter' | 'lager';

interface NavItem {
  href: string;
  label: string;
  icon: any;
  roles: RoleKey[];
}

// Menü-Reihenfolge = Arbeitsablauf eines Gerüstbau-Tags:
// Verkauf → Planung → Baustelle → Abrechnung → Verwaltung → Hilfe
const NAV_ITEMS: NavItem[] = [
  // ── Start ──
  { href: '/dashboard',      label: 'Dashboard',    icon: LayoutDashboard, roles: ['admin', 'disponent'] },
  // ── 1 · Verkauf ──
  { href: '/aufmass/schritt1', label: 'Aufmaß',     icon: Ruler,           roles: ['admin', 'bauleiter'] },
  { href: '/cad',              label: 'CAD',        icon: Ruler,           roles: ['admin', 'bauleiter'] },
  { href: '/rechnungen',     label: 'Rechnungen',   icon: FileText,        roles: ['admin', 'disponent'] },
  { href: '/mietabrechnung', label: 'Mietabrechnung', icon: Euro,          roles: ['admin', 'disponent'] },
  { href: '/kunden',         label: 'Kunden',         icon: Users,         roles: ['admin', 'disponent'] },
  { href: '/nachunternehmer', label: 'Nachunternehmer', icon: Handshake,     roles: ['admin', 'disponent'] },
  // ── 2 · Planung ──
  { href: '/planung',        label: 'Planung',      icon: CalendarClock,   roles: ['admin', 'disponent', 'bauleiter'] },
  { href: '/routenoptimierung', label: 'Routen-KI', icon: Route,           roles: ['admin', 'disponent'] },
  { href: '/lager',          label: 'Lager',        icon: Warehouse,       roles: ['admin', 'disponent', 'bauleiter', 'lager'] },
  { href: '/prognose',       label: 'Prognose',     icon: TrendingUp,      roles: ['admin', 'disponent', 'lager'] },
  // ── 3 · Baustelle ──
  { href: '/touren',         label: 'Touren',       icon: Truck,           roles: ['admin', 'disponent'] },
  { href: '/meine-touren',   label: 'Meine Touren', icon: Navigation,      roles: ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'] },
  { href: '/zeiterfassung',  label: 'Zeiterfassung', icon: Timer,           roles: ['admin', 'disponent', 'bauleiter'] },
  { href: '/dokumentation',  label: 'Dokumentation', icon: ClipboardList,   roles: ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'] },
  // ── 4 · Verwaltung ──
  { href: '/mitarbeiter',    label: 'Zugänge',      icon: KeyRound,        roles: ['admin', 'disponent'] },
  { href: '/datenpflege',    label: 'Datenpflege',  icon: Database,        roles: ['admin'] },
  { href: '/datenimport',    label: 'Datenimport',  icon: Upload,          roles: ['admin', 'disponent'] },
  { href: '/einstellungen',  label: 'Einstellungen', icon: Settings,       roles: ['admin'] },
  // ── Hilfe ──
  { href: '/hilfe',          label: 'Hilfe',        icon: HelpCircle,      roles: ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'] },
];

// Weiche, dezente Rollen-Badges (getönt statt knallig)
const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-red-50 text-red-600',
  disponent: 'bg-amber-50 text-amber-700',
  bauleiter: 'bg-emerald-50 text-emerald-700',
  mitarbeiter: 'bg-sky-50 text-sky-700',
  lager: 'bg-violet-50 text-violet-700',
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
    <div className="flex h-screen bg-[#fbfbfd]">
      {/* ─── Sidebar ─── */}
      <aside className={`bg-white/90 backdrop-blur border-r border-black/5 text-[#1d1d1f] flex flex-col transition-all duration-300 shrink-0 ${open ? 'w-60' : 'w-16'}`}>
        <div className="p-4 flex items-center justify-between border-b border-black/5">
          {open && (
            <Link href="/" className="flex items-center gap-2">
              <HardHat className="w-6 h-6 text-[#e8590c]" />
              <span className="font-semibold text-lg tracking-tight">SCAFFOLD OS</span>
            </Link>
          )}
          <button
            onClick={() => setOpen(!open)}
            className="p-1.5 hover:bg-black/5 rounded-full transition text-[#86868b]"
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-full transition-colors ${
                  active ? 'bg-[#e8590c]/10 text-[#e8590c]' : 'hover:bg-black/5 text-[#424245]'
                } ${!open ? 'justify-center' : ''}`}
                title={!open ? item.label : undefined}
              >
                <item.icon className={`w-5 h-5 shrink-0 ${active ? 'text-[#e8590c]' : 'text-[#86868b]'}`} />
                {open && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-black/5 space-y-2">
          {open && (
            <div className="bg-[#f5f5f7] rounded-2xl px-3 py-2">
              <p className="text-xs font-medium text-[#1d1d1f] truncate">{profile?.full_name || user.email}</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_BADGE[role] || 'bg-black/5 text-[#86868b]'}`}>
                {role.toUpperCase()}
              </span>
            </div>
          )}
          {/* Benutzerhandbuch – ganz unten, für alle Rollen */}
          <a
            href="/handbuch.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 text-xs text-[#86868b] hover:text-[#e8590c] transition-colors w-full px-2 py-1.5 rounded-full hover:bg-black/5 ${!open ? 'justify-center' : ''}`}
            title="Benutzerhandbuch (PDF)"
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            {open && 'Handbuch'}
          </a>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-2 text-xs text-[#86868b] hover:text-[#1d1d1f] transition-colors w-full px-2 py-1.5 rounded-full hover:bg-black/5 ${!open ? 'justify-center' : ''}`}
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
