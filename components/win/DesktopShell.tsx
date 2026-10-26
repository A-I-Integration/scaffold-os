'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useOhneBuntSymbole } from './useOhneBuntSymbole'
import { usePathname } from 'next/navigation'
import {
  Home, Ruler, Box, FileText, Users, Euro, Mail, Settings, Truck, Warehouse, CalendarClock, Route, TrendingUp,
  KeyRound, Timer, Navigation, ClipboardList, FolderOpen, Handshake, CreditCard, Database, Upload, HelpCircle, BookOpen,
  LayoutDashboard, Printer, LogOut, Briefcase, Calculator, Wrench, PanelLeft,
} from 'lucide-react'
import { starteNeuesAufmass } from '@/lib/aufmass-projekt-session'

// ============================================================
// SCAFFOLD OS – Desktop-Oberfläche für Büro (Chef/Disposition) am großen Bildschirm:
// Menüleiste, Symbolleiste, Schnellstartfenster mit Bereichen, Statusleiste – wie man es aus Büro-Software kennt.
// Alle Einträge verlinken auf bestehende Seiten; die Seitenleiste der kleinen Bildschirme bleibt unverändert.
// ============================================================

type Rolle = 'admin' | 'disponent' | 'bauleiter' | 'mitarbeiter' | 'lager'
interface Eintrag { href: string; label: string; icon: typeof Home; roles?: Rolle[]; neuAufmass?: boolean }
interface Bereich { key: string; label: string; icon: typeof Home; eintraege: Eintrag[] }

const BUERO: Rolle[] = ['admin', 'disponent']
const BAU: Rolle[] = ['admin', 'disponent', 'bauleiter']
const E: Record<string, Eintrag> = {
  dashboard: { href: '/dashboard', label: 'Projektmanager', icon: LayoutDashboard, roles: BUERO },
  kunden: { href: '/kunden', label: 'Kunden / Adressen', icon: Users, roles: BUERO },
  aufmass: { href: '/aufmass/schritt1', label: 'Aufmaß', icon: Ruler, neuAufmass: true, roles: ['admin', 'bauleiter', 'mitarbeiter'] },
  cad: { href: '/cad', label: 'CAD', icon: Box, roles: BAU },
  bruecke: { href: '/cad/bruecke', label: 'Brücke', icon: Box, roles: BAU },
  traggeruest: { href: '/cad/traggeruest', label: 'Traggerüst-Anfrage', icon: Box, roles: BAU },
  gaeb: { href: '/gaeb', label: 'GAEB', icon: FileText, roles: ['admin', 'disponent', 'mitarbeiter'] },
  dokumente: { href: '/dokumente', label: 'Dokumente', icon: FolderOpen, roles: BUERO },
  dokumentation: { href: '/dokumentation', label: 'Dokumentation', icon: ClipboardList },
  nu: { href: '/nachunternehmer', label: 'Nachunternehmer', icon: Handshake, roles: BUERO },
  rechnungen: { href: '/rechnungen', label: 'Rechnungen', icon: FileText, roles: BUERO },
  neueRechnung: { href: '/rechnungen?neu=1', label: 'Neue Rechnung', icon: FileText, roles: BUERO },
  zahlung: { href: '/zahlungsabgleich', label: 'Zahlungsabgleich', icon: CreditCard, roles: BUERO },
  miete: { href: '/mietabrechnung', label: 'Mietabrechnung', icon: Euro, roles: BUERO },
  email: { href: '/meine-email', label: 'Meine E-Mail', icon: Mail },
  planung: { href: '/planung', label: 'Planung', icon: CalendarClock, roles: BAU },
  touren: { href: '/touren', label: 'Touren', icon: Truck, roles: BUERO },
  routen: { href: '/routenoptimierung', label: 'Routen-KI', icon: Route, roles: BUERO },
  wochen: { href: '/wochenplanung', label: 'Wochenplanung', icon: CalendarClock, roles: BAU },
  kolonnen: { href: '/kolonnen', label: 'Kolonnen', icon: Users, roles: BAU },
  zeit: { href: '/zeiterfassung', label: 'Zeiterfassung', icon: Timer, roles: BAU },
  meineTouren: { href: '/meine-touren', label: 'Meine Touren', icon: Navigation },
  lager: { href: '/lager', label: 'Lager', icon: Warehouse, roles: ['admin', 'disponent', 'bauleiter', 'lager'] },
  prognose: { href: '/prognose', label: 'Prognose', icon: TrendingUp, roles: ['admin', 'disponent', 'lager'] },
  katalog: { href: '/mj-katalog', label: 'Herstellerkatalog', icon: BookOpen, roles: ['admin', 'disponent', 'bauleiter', 'lager'] },
  zugaenge: { href: '/mitarbeiter', label: 'Mitarbeiter / Zugänge', icon: KeyRound, roles: BUERO },
  einstellungen: { href: '/einstellungen', label: 'Einstellungen', icon: Settings, roles: ['admin'] },
  datenpflege: { href: '/datenpflege', label: 'Datenpflege', icon: Database, roles: ['admin'] },
  import: { href: '/datenimport', label: 'Datenimport', icon: Upload, roles: BUERO },
  hilfe: { href: '/hilfe', label: 'Hilfe', icon: HelpCircle },
}

// Jede Seite steht in genau einem Bereich (keine Doppelungen), geordnet nach dem Weg eines Auftrags:
// Kunde → Aufmaß/CAD → Rechnung → Einsatzplanung → Lager → Stammdaten
const BEREICHE: Bereich[] = [
  { key: 'projekt', label: 'Projektverwaltung', icon: Briefcase, eintraege: [E.dashboard, E.kunden, E.aufmass, E.cad, E.bruecke, E.traggeruest, E.gaeb, E.dokumente, E.dokumentation] },
  { key: 'kaufm', label: 'Kaufmännische Verwaltung', icon: Calculator, eintraege: [E.rechnungen, E.neueRechnung, E.zahlung, E.miete, E.email] },
  { key: 'dispo', label: 'Disposition', icon: Truck, eintraege: [E.planung, E.wochen, E.touren, E.routen, E.kolonnen, E.zeit, E.meineTouren] },
  { key: 'lager', label: 'Lager', icon: Warehouse, eintraege: [E.lager, E.prognose, E.katalog] },
  { key: 'stamm', label: 'Stammdaten', icon: Wrench, eintraege: [E.zugaenge, E.nu, E.einstellungen, E.datenpflege] },
  { key: 'transfer', label: 'Datentransfer', icon: Upload, eintraege: [E.import] },
  { key: 'hilfe', label: 'Hilfe & Support', icon: HelpCircle, eintraege: [E.hilfe] },
]

type MenueEintrag = Eintrag | '---'
const MENUES: { label: string; eintraege: MenueEintrag[] }[] = [
  { label: 'Datei', eintraege: [E.aufmass, E.neueRechnung, '---', E.import] },
  { label: 'Erfassen', eintraege: [E.aufmass, E.cad, E.bruecke, E.traggeruest, E.gaeb, '---', E.neueRechnung] },
  { label: 'Auswerten', eintraege: [E.dashboard, E.prognose, E.zahlung, E.miete, E.zeit] },
  { label: 'Stammdaten', eintraege: [E.kunden, E.zugaenge, E.kolonnen, E.lager, E.nu, '---', E.einstellungen, E.datenpflege] },
]

const erlaubt = (e: Eintrag, rolle: Rolle) => !e.roles || e.roles.includes(rolle)
const FARBE = { menue: '#f0f0f0', rand: '#c9c9c9', kopf1: '#4a86c8', kopf2: '#2d63a3', auswahl: '#cfe3f7', akzent: '#e8590c' }

function Menueleiste({ rolle, onKlassisch, onLogout }: { rolle: Rolle; onKlassisch: () => void; onLogout: () => void }) {
  const [offen, setOffen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const zu = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOffen(null) }
    document.addEventListener('mousedown', zu)
    return () => document.removeEventListener('mousedown', zu)
  }, [])
  const menues: { label: string; eintraege: MenueEintrag[] }[] = [...MENUES, { label: 'Ansicht', eintraege: [] }]
  return (
    <div ref={ref} className="flex items-center text-[19px] border-b select-none" style={{ background: FARBE.menue, borderColor: FARBE.rand }}>
      {menues.map((m) => {
        const eintraege = m.eintraege.filter((x) => x === '---' || erlaubt(x, rolle))
        return (
          <div key={m.label} className="relative">
            <button type="button" onClick={() => setOffen(offen === m.label ? null : m.label)} onMouseEnter={() => offen && setOffen(m.label)}
              className="px-3 py-1" style={{ background: offen === m.label ? FARBE.auswahl : undefined }}>{m.label}</button>
            {offen === m.label && (
              <div className="absolute left-0 top-full z-50 min-w-[280px] py-1 border shadow-lg bg-white" style={{ borderColor: FARBE.rand }}>
                {m.label === 'Ansicht' ? (
                  <button type="button" onClick={() => { setOffen(null); onKlassisch() }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[#cfe3f7]"><PanelLeft className="w-4 h-4" />Klassische Seitenleiste</button>
                ) : eintraege.map((x, i) => x === '---'
                  ? <div key={i} className="my-1 border-t" style={{ borderColor: '#e2e2e2' }} />
                  : <Link key={x.href + i} href={x.href} onClick={() => { setOffen(null); if (x.neuAufmass) starteNeuesAufmass() }} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#cfe3f7]"><x.icon className="w-4 h-4 opacity-70" />{x.label}</Link>)}
              </div>
            )}
          </div>
        )
      })}
      <button type="button" onClick={onLogout} className="ml-auto px-3 py-1 flex items-center gap-1.5 hover:bg-[#cfe3f7]"><LogOut className="w-3.5 h-3.5" />Abmelden</button>
    </div>
  )
}

export default function DesktopShell({ rolle, name, onKlassisch, onLogout, children }: { rolle: Rolle; name: string; onKlassisch: () => void; onLogout: () => void; children: ReactNode }) {
  const pathname = usePathname()
  const istAktiv = (href: string) => { const p = href.split('?')[0]; return p === '/aufmass/schritt1' ? pathname.startsWith('/aufmass') : pathname === p || pathname.startsWith(p + '/') }
  const bereiche = BEREICHE.map((b) => ({ ...b, eintraege: b.eintraege.filter((e) => erlaubt(e, rolle)) })).filter((b) => b.eintraege.length)
  const vonPfad = bereiche.find((b) => b.eintraege.some((e) => istAktiv(e.href)))?.key
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const aktiv = bereiche.find((b) => b.key === (gewaehlt || vonPfad)) || bereiche[0]
  // Gemeinsame Titelzeile für alle Bereiche (Seiten mit eigener Titelzeile oder Vollbild-Werkzeuge ausgenommen)
  const EIGENE_KOPFZEILE = ['/kunden', '/rechnungen', '/cad', '/aufmass']
  const seitenTitel = EIGENE_KOPFZEILE.some((x) => pathname === x || pathname.startsWith(x + '/'))
    ? null
    : bereiche.flatMap((b) => b.eintraege).find((e) => istAktiv(e.href))
  const inhaltRef = useRef<HTMLElement>(null)
  useOhneBuntSymbole(true, inhaltRef)
  const [datum, setDatum] = useState('')
  useEffect(() => { setDatum(new Date().toLocaleDateString('de-DE')) }, [])
  // Beim Seitenwechsel wieder dem Bereich der Seite folgen
  useEffect(() => { setGewaehlt(null) }, [pathname])
  const werkzeuge = [E.dashboard, E.aufmass, E.cad, E.kunden, E.rechnungen, E.email, E.planung, E.lager, E.einstellungen].filter((e) => erlaubt(e, rolle))

  return (
    <div className="flex flex-col h-screen text-[19px]" style={{ fontFamily: 'var(--schrift)', background: '#fff', color: '#1b1b1b' }}>
      <div className="flex items-center gap-2 px-3 h-10 text-white text-[18px]" style={{ background: 'linear-gradient(#3a3a3a,#232323)' }}>
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: FARBE.akzent }} />
        <span className="font-semibold">SCAFFOLD OS</span><span className="opacity-60">– {name}</span>
      </div>
      <Menueleiste rolle={rolle} onKlassisch={onKlassisch} onLogout={onLogout} />

      {/* Symbolleiste */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b" style={{ background: FARBE.menue, borderColor: FARBE.rand }}>
        {werkzeuge.map((w) => (
          <Link key={w.href} href={w.href} title={w.label} onClick={w.neuAufmass ? () => starteNeuesAufmass() : undefined}
            className="flex items-center justify-center w-8 h-8 rounded border border-transparent hover:bg-[#dbe9f7] hover:border-[#9cc3ea]"
            style={istAktiv(w.href) ? { background: FARBE.auswahl, borderColor: '#7eb4ea' } : undefined}><w.icon className="w-[18px] h-[18px]" style={{ color: '#2d63a3' }} /></Link>
        ))}
        <span className="mx-1 h-5 border-l" style={{ borderColor: FARBE.rand }} />
        <button type="button" onClick={() => window.print()} title="Drucken" className="flex items-center justify-center w-8 h-8 rounded border border-transparent hover:bg-[#dbe9f7] hover:border-[#9cc3ea]"><Printer className="w-[18px] h-[18px]" style={{ color: '#2d63a3' }} /></button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Schnellstartfenster */}
        <aside className="flex flex-col w-[300px] shrink-0 border-r" style={{ borderColor: FARBE.rand, background: '#fff' }}>
          <div className="px-2 py-1 text-[18px] border-b" style={{ background: FARBE.menue, borderColor: FARBE.rand }}>Schnellstartfenster</div>
          <div className="px-2 py-1 font-bold text-white text-[19px]" style={{ background: `linear-gradient(${FARBE.kopf1},${FARBE.kopf2})` }}>{aktiv.label}</div>
          <nav className="flex-1 overflow-y-auto py-1">
            {aktiv.eintraege.map((e) => (
              <Link key={e.href} href={e.href} onClick={e.neuAufmass ? () => starteNeuesAufmass() : undefined}
                className="flex items-center gap-2 px-2.5 py-[5px] font-semibold hover:bg-[#e8f1fb]"
                style={{ color: '#1f4f8f', background: istAktiv(e.href) ? FARBE.auswahl : undefined, boxShadow: istAktiv(e.href) ? `inset 3px 0 0 ${FARBE.akzent}` : undefined }}>
                <e.icon className="w-4 h-4 shrink-0" style={{ color: istAktiv(e.href) ? FARBE.akzent : '#4a86c8' }} />{e.label}
              </Link>
            ))}
          </nav>
          {/* Bereiche */}
          <div className="border-t" style={{ borderColor: FARBE.rand }}>
            {bereiche.map((b) => {
              const ist = b.key === aktiv.key
              return (
                <button key={b.key} type="button" onClick={() => setGewaehlt(b.key)}
                  className="flex w-full items-center gap-2 px-2.5 h-[38px] text-left text-[18px] font-semibold border-b whitespace-nowrap overflow-hidden"
                  style={ist ? { background: 'linear-gradient(#ffc27a,#f28a2e)', color: '#3b1d00', borderColor: '#d9791f' } : { background: `linear-gradient(${FARBE.kopf1},${FARBE.kopf2})`, color: '#fff', borderColor: '#244f85' }}>
                  <b.icon className="w-3.5 h-3.5" />{b.label}
                </button>
              )
            })}
          </div>
        </aside>

        <main ref={inhaltRef} className="win-ui flex-1 min-w-0 overflow-auto bg-[#fbfbfd]">
          {seitenTitel && (
            <div className="flex items-center gap-2 px-3 h-9 text-white sticky top-0 z-20" style={{ background: `linear-gradient(${FARBE.kopf1},${FARBE.kopf2})` }}>
              <seitenTitel.icon className="w-4 h-4" /><span className="text-[20px] font-bold">{seitenTitel.label}</span>
              <span className="text-xs opacity-80">{aktiv.label}</span>
            </div>
          )}
          {children}
        </main>
      </div>

      <div className="flex items-center gap-4 px-3 h-9 text-[18px] border-t" style={{ background: FARBE.menue, borderColor: FARBE.rand, color: '#444' }}>
        <span>Fertig</span><span className="ml-auto">{name} · {rolle === 'admin' ? 'Chef' : 'Disposition'}</span><span>{datum}</span>
      </div>
    </div>
  )
}
