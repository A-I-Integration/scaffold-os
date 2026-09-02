'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  HardHat, LayoutDashboard, Warehouse, CalendarClock, Truck,
  KeyRound, Ruler, Navigation, LogOut, Menu, X, Database, TrendingUp, Timer, Route,
  FileText, Settings, BookOpen, HelpCircle, Upload, Euro, Users, Handshake, ClipboardList,
  Wrench, ChevronDown, ChevronRight, CreditCard,
} from 'lucide-react';

// ============================================================
// SCAFFOLD OS – SidebarLayout (Optik-Stufe 4: Gruppierte Sidebar)
// Helle Sidebar, Brand-Orange #E8590C als Akzentfarbe.
// NEU: Menüpunkte sind zu Hauptbereichen gruppiert, die sich
// als Akkordeon auf-/zuklappen (statt einer langen Einzelliste).
// Logik sonst UNVERÄNDERT: echtes Login, echte Rollen aus Supabase,
// Sidebar einklappbar, auf dem Handy startet sie eingeklappt.
// ============================================================

type RoleKey = 'admin' | 'disponent' | 'bauleiter' | 'mitarbeiter' | 'lager';

interface NavItem {
  href: string;
  label: string;
  icon: any;
  roles: RoleKey[];
}

interface NavGroup {
  key: string;
  label: string;
  icon: any;
  items: NavItem[];
}

// Einzelne Punkte ohne Gruppe (Start/Ende der Liste)
const NAV_TOP: NavItem = { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'disponent'] };
const NAV_BOTTOM: NavItem = { href: '/hilfe', label: 'Hilfe', icon: HelpCircle, roles: ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'] };

// Hauptbereiche mit Unterpunkten (Akkordeon)
const NAV_GROUPS: NavGroup[] = [
  {
    key: 'werkzeug', label: 'Werkzeug', icon: Wrench,
    items: [
      { href: '/aufmass/schritt1', label: 'Aufmaß', icon: Ruler, roles: ['admin', 'bauleiter'] },
      { href: '/cad',              label: 'CAD',    icon: Ruler, roles: ['admin', 'bauleiter'] },
    ],
  },
  {
    key: 'auftraege', label: 'Aufträge & Kunden', icon: Users,
    items: [
      { href: '/kunden',         label: 'Kunden',         icon: Users,         roles: ['admin', 'disponent'] },
      { href: '/rechnungen',     label: 'Rechnungen',     icon: FileText,      roles: ['admin', 'disponent'] },
      { href: '/zahlungsabgleich', label: 'Zahlungsabgleich', icon: CreditCard, roles: ['admin', 'disponent'] },
      { href: '/mietabrechnung', label: 'Mietabrechnung', icon: Euro,          roles: ['admin', 'disponent'] },
      { href: '/nachunternehmer', label: 'Nachunternehmer', icon: Handshake,   roles: ['admin', 'disponent'] },
    ],
  },
  {
    key: 'fahrten', label: 'Fahrten planen', icon: Truck,
    items: [
      { href: '/planung',           label: 'Planung',    icon: CalendarClock, roles: ['admin', 'disponent', 'bauleiter'] },
      { href: '/touren',            label: 'Touren',     icon: Truck,         roles: ['admin', 'disponent'] },
      { href: '/routenoptimierung', label: 'Routen-KI',  icon: Route,         roles: ['admin', 'disponent'] },
    ],
  },
  {
    key: 'lager', label: 'Lager', icon: Warehouse,
    items: [
      { href: '/lager',    label: 'Lager',    icon: Warehouse,  roles: ['admin', 'disponent', 'bauleiter', 'lager'] },
      { href: '/prognose', label: 'Prognose', icon: TrendingUp, roles: ['admin', 'disponent', 'lager'] },
    ],
  },
  {
    key: 'mitarbeiter', label: 'Mitarbeiter', icon: KeyRound,
    items: [
      { href: '/mitarbeiter',   label: 'Zugänge',       icon: KeyRound,   roles: ['admin', 'disponent'] },
      { href: '/zeiterfassung', label: 'Zeiterfassung', icon: Timer,      roles: ['admin', 'disponent', 'bauleiter'] },
      { href: '/meine-touren',  label: 'Meine Touren',  icon: Navigation, roles: ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'] },
      { href: '/dokumentation', label: 'Dokumentation', icon: ClipboardList, roles: ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'] },
    ],
  },
  {
    key: 'verwaltung', label: 'Verwaltung', icon: Settings,
    items: [
      { href: '/datenpflege',   label: 'Datenpflege', icon: Database, roles: ['admin'] },
      { href: '/datenimport',   label: 'Datenimport', icon: Upload,   roles: ['admin', 'disponent'] },
      { href: '/einstellungen', label: 'Einstellungen', icon: Settings, roles: ['admin'] },
    ],
  },
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
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

  const isActive = (href: string) => {
    if (href === '/aufmass/schritt1') return pathname.startsWith('/aufmass');
    return pathname === href || pathname.startsWith(href + '/');
  };

  // Die Gruppe, die die aktuelle Seite enthält, automatisch aufklappen –
  // sonst wüsste man nach einem Klick nicht mehr, wo man sich befindet.
  useEffect(() => {
    const aktiveGruppe = NAV_GROUPS.find((g) => g.items.some((i) => isActive(i.href)));
    if (aktiveGruppe) setOpenGroups((prev) => ({ ...prev, [aktiveGruppe.key]: true }));
  }, [pathname]);

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

  function toggleGroup(key: string) {
    if (!open) { setOpen(true); setOpenGroups((prev) => ({ ...prev, [key]: true })); return; }
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="flex h-screen bg-[#fbfbfd]">
      {/* ─── Sidebar ─── */}
      <aside className={`bg-white/90 backdrop-blur border-r border-black/5 text-[#1d1d1f] flex flex-col transition-all duration-300 shrink-0 ${open ? 'w-64' : 'w-16'}`}>
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
          {/* ── Dashboard (einzeln) ── */}
          {NAV_TOP.roles.includes(role) && (
            <Link
              href={NAV_TOP.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-full transition-colors ${
                isActive(NAV_TOP.href) ? 'bg-[#e8590c]/10 text-[#e8590c]' : 'hover:bg-black/5 text-[#424245]'
              } ${!open ? 'justify-center' : ''}`}
              title={!open ? NAV_TOP.label : undefined}
            >
              <NAV_TOP.icon className={`w-5 h-5 shrink-0 ${isActive(NAV_TOP.href) ? 'text-[#e8590c]' : 'text-[#86868b]'}`} />
              {open && <span className="text-sm font-medium">{NAV_TOP.label}</span>}
            </Link>
          )}

          {/* ── Hauptbereiche (Akkordeon) ── */}
          {NAV_GROUPS.map((group) => {
            const sichtbareItems = group.items.filter((i) => i.roles.includes(role));
            if (sichtbareItems.length === 0) return null;
            const gruppeAktiv = sichtbareItems.some((i) => isActive(i.href));
            const isOpen = open && !!openGroups[group.key];

            return (
              <div key={group.key}>
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-full transition-colors ${
                    gruppeAktiv && !isOpen ? 'bg-[#e8590c]/10 text-[#e8590c]' : 'hover:bg-black/5 text-[#424245]'
                  } ${!open ? 'justify-center' : ''}`}
                  title={!open ? group.label : undefined}
                >
                  <group.icon className={`w-5 h-5 shrink-0 ${gruppeAktiv ? 'text-[#e8590c]' : 'text-[#86868b]'}`} />
                  {open && <span className="text-sm font-medium flex-1 text-left">{group.label}</span>}
                  {open && (isOpen ? <ChevronDown className="w-4 h-4 text-[#86868b]" /> : <ChevronRight className="w-4 h-4 text-[#86868b]" />)}
                </button>

                {isOpen && (
                  <div className="ml-4 pl-3 border-l border-black/5 space-y-1 mt-1 mb-1">
                    {sichtbareItems.map((item) => {
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-full transition-colors ${
                            active ? 'bg-[#e8590c]/10 text-[#e8590c]' : 'hover:bg-black/5 text-[#424245]'
                          }`}
                        >
                          <item.icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#e8590c]' : 'text-[#86868b]'}`} />
                          <span className="text-sm">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Hilfe (einzeln) ── */}
          {NAV_BOTTOM.roles.includes(role) && (
            <Link
              href={NAV_BOTTOM.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-full transition-colors ${
                isActive(NAV_BOTTOM.href) ? 'bg-[#e8590c]/10 text-[#e8590c]' : 'hover:bg-black/5 text-[#424245]'
              } ${!open ? 'justify-center' : ''}`}
              title={!open ? NAV_BOTTOM.label : undefined}
            >
              <NAV_BOTTOM.icon className={`w-5 h-5 shrink-0 ${isActive(NAV_BOTTOM.href) ? 'text-[#e8590c]' : 'text-[#86868b]'}`} />
              {open && <span className="text-sm font-medium">{NAV_BOTTOM.label}</span>}
            </Link>
          )}
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
