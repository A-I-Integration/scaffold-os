import {
  LayoutDashboard, Users, Ruler, Box, FileText, FolderOpen, Handshake, CreditCard, Euro, Mail, CalendarClock,
  Truck, Route, Timer, Navigation, ClipboardList, Warehouse, TrendingUp, BookOpen, KeyRound, Settings, Database,
  Upload, Scale, HelpCircle, ShieldCheck, Triangle, Receipt, FilePlus2,
} from 'lucide-react'

// ============================================================
// SCAFFOLD OS – eine einzige Menüstruktur für alle Rollen und alle Bildschirmgrößen.
// Gruppiert nach dem Weg eines Auftrags: Anfrage → Aufmaß & Planung → Angebot → Ausführung → Abrechnung,
// dazu "Betrieb" für alles, was nicht an einem einzelnen Auftrag hängt.
// Jede Seite steht in genau einer Gruppe.
// ============================================================

export type Rolle = 'admin' | 'disponent' | 'bauleiter' | 'mitarbeiter' | 'lager'
export interface NavEintrag {
  href: string
  label: string
  icon: typeof LayoutDashboard
  roles?: Rolle[] // ohne Angabe: alle Rollen
  neuAufmass?: boolean // Link startet bewusst ein leeres Aufmaß
  stichwoerter?: string // zusätzliche Suchbegriffe für die Suche (Strg K)
}
export interface NavGruppe {
  key: string
  nummer?: number
  label: string
  eintraege: NavEintrag[]
}

const BUERO: Rolle[] = ['admin', 'disponent']
const BAU: Rolle[] = ['admin', 'disponent', 'bauleiter']

export const NAV_UEBERSICHT: NavEintrag = { href: '/dashboard', label: 'Übersicht', icon: LayoutDashboard, roles: BUERO, stichwoerter: 'dashboard projektmanager start' }

export const NAV_GRUPPEN: NavGruppe[] = [
  {
    key: 'anfrage', nummer: 1, label: 'Anfrage & Kunden',
    eintraege: [
      { href: '/kunden', label: 'Kunden & Adressen', icon: Users, roles: BUERO },
      { href: '/meine-email', label: 'Meine E-Mail', icon: Mail, stichwoerter: 'mail postfach nachrichten' },
    ],
  },
  {
    key: 'planung', nummer: 2, label: 'Aufmaß & Planung',
    eintraege: [
      { href: '/aufmass/schritt1', label: 'Aufmaß', icon: Ruler, roles: ['admin', 'bauleiter', 'mitarbeiter'], neuAufmass: true, stichwoerter: 'aufmass messen gebäude' },
      { href: '/cad', label: 'CAD Gerüstplanung', icon: Box, roles: BAU, stichwoerter: '3d plan gerüst dxf' },
      { href: '/cad/bruecke', label: 'Brücke', icon: Box, roles: BAU },
      { href: '/cad/traggeruest', label: 'Traggerüst-Anfrage', icon: Box, roles: BAU },
      { href: '/cad/pylon', label: 'Geneigter Körper', icon: Triangle, roles: BAU, stichwoerter: 'pylon schräg' },
      { href: '/mj-katalog', label: 'Herstellerkatalog', icon: BookOpen, roles: ['admin', 'disponent', 'bauleiter', 'lager'] },
    ],
  },
  {
    key: 'angebot', nummer: 3, label: 'Angebot & LV',
    eintraege: [
      { href: '/gaeb', label: 'GAEB / Leistungsverzeichnis', icon: FileText, roles: ['admin', 'disponent', 'mitarbeiter'], stichwoerter: 'lv ausschreibung angebot' },
    ],
  },
  {
    key: 'ausfuehrung', nummer: 4, label: 'Ausführung',
    eintraege: [
      { href: '/planung', label: 'Planung', icon: CalendarClock, roles: BAU },
      { href: '/wochenplanung', label: 'Wochenplanung', icon: CalendarClock, roles: BAU },
      { href: '/touren', label: 'Touren', icon: Truck, roles: BUERO },
      { href: '/routenoptimierung', label: 'Routen-KI', icon: Route, roles: BUERO },
      { href: '/meine-touren', label: 'Meine Touren', icon: Navigation },
      { href: '/kolonnen', label: 'Kolonnen', icon: Users, roles: BAU },
      { href: '/zeiterfassung', label: 'Zeiterfassung', icon: Timer, roles: BAU },
      { href: '/nachunternehmer', label: 'Nachunternehmer', icon: Handshake, roles: BUERO },
      { href: '/arbeitsschutz', label: 'Arbeitsschutz', icon: ShieldCheck, roles: BUERO },
      { href: '/dokumentation', label: 'Baustellendokumentation', icon: ClipboardList },
    ],
  },
  {
    key: 'abrechnung', nummer: 5, label: 'Abrechnung',
    eintraege: [
      { href: '/rechnungen', label: 'Rechnungen', icon: Receipt, roles: BUERO },
      { href: '/rechnungen?neu=1', label: 'Neue Rechnung', icon: FilePlus2, roles: BUERO },
      { href: '/zahlungsabgleich', label: 'Zahlungsabgleich', icon: CreditCard, roles: BUERO },
      { href: '/mietabrechnung', label: 'Mietabrechnung', icon: Euro, roles: BUERO },
      { href: '/dokumente', label: 'Dokumente', icon: FolderOpen, roles: BUERO },
    ],
  },
  {
    key: 'betrieb', label: 'Betrieb',
    eintraege: [
      { href: '/lager', label: 'Lager', icon: Warehouse, roles: ['admin', 'disponent', 'bauleiter', 'lager'] },
      { href: '/gestell-simulator', label: 'Gestell-Waage (Test)', icon: Scale, roles: ['admin', 'disponent', 'lager'] },
      { href: '/prognose', label: 'Prognose', icon: TrendingUp, roles: ['admin', 'disponent', 'lager'] },
      { href: '/mitarbeiter', label: 'Mitarbeiter & Zugänge', icon: KeyRound, roles: BUERO },
      { href: '/datenimport', label: 'Datenimport', icon: Upload, roles: BUERO },
      { href: '/datenpflege', label: 'Datenpflege', icon: Database, roles: ['admin'] },
      { href: '/einstellungen', label: 'Einstellungen', icon: Settings, roles: ['admin'] },
      { href: '/hilfe', label: 'Hilfe', icon: HelpCircle },
    ],
  },
]

export const erlaubt = (e: NavEintrag, rolle: Rolle) => !e.roles || e.roles.includes(rolle)

export function sichtbareGruppen(rolle: Rolle): NavGruppe[] {
  return NAV_GRUPPEN.map((g) => ({ ...g, eintraege: g.eintraege.filter((e) => erlaubt(e, rolle)) })).filter((g) => g.eintraege.length)
}

export function istAktiverPfad(href: string, pathname: string): boolean {
  if (href.includes('?')) return false // Schnellaktionen (z. B. Neue Rechnung) markieren nie die Seite
  const p = href
  if (p === '/aufmass/schritt1') return pathname.startsWith('/aufmass')
  // /cad hat Unterseiten mit eigenem Menüpunkt – dort zählt nur der genaue Treffer
  if (p === '/cad') return pathname === '/cad'
  return pathname === p || pathname.startsWith(p + '/')
}

export function findeAktuell(rolle: Rolle, pathname: string): { gruppe: NavGruppe; eintrag: NavEintrag } | null {
  for (const g of sichtbareGruppen(rolle)) {
    // genauere Treffer zuerst (längster Pfad gewinnt)
    const treffer = g.eintraege.filter((e) => istAktiverPfad(e.href, pathname)).sort((a, b) => b.href.length - a.href.length)[0]
    if (treffer) return { gruppe: g, eintrag: treffer }
  }
  return null
}

export const ROLLEN_NAME: Record<Rolle, string> = {
  admin: 'Chef', disponent: 'Disposition', bauleiter: 'Bauleitung', mitarbeiter: 'Mitarbeiter', lager: 'Lager',
}
