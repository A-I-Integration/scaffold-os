'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, LogOut, Menu, Search, X } from 'lucide-react'
import { starteNeuesAufmass } from '@/lib/aufmass-projekt-session'
import { useOhneBuntSymbole } from '../win/useOhneBuntSymbole'
import {
  NAV_UEBERSICHT, ROLLEN_NAME, erlaubt, findeAktuell, istAktiverPfad, sichtbareGruppen,
  type NavEintrag, type Rolle,
} from './nav-config'

// ============================================================
// SCAFFOLD OS – Oberfläche "Industrial": dunkle Navigation, helle Arbeitsfläche, Orange nur als Akzent.
// Eine Shell für alle Rollen. Ab 900 px feste Seitenleiste, darunter Schublade mit Kopfzeile.
// ============================================================

function useSchmal() {
  return useSyncExternalStore(
    (cb) => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb) },
    () => window.innerWidth < 900,
    () => false,
  )
}

export default function AppShell({ rolle, name, onLogout, children }: { rolle: Rolle; name: string; onLogout: () => void; children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const schmal = useSchmal()
  const [schublade, setSchublade] = useState(false)
  const [offen, setOffen] = useState<Record<string, boolean>>({})
  const [suche, setSuche] = useState(false)
  const inhaltRef = useRef<HTMLElement>(null)
  useOhneBuntSymbole(true, inhaltRef)

  const gruppen = useMemo(() => sichtbareGruppen(rolle), [rolle])
  const zeigeUebersicht = erlaubt(NAV_UEBERSICHT, rolle)
  const aktuell = findeAktuell(rolle, pathname)

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSuche(true) }
      if (e.key === 'Escape') setSuche(false)
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [])

  const klick = (e: NavEintrag) => () => { setSchublade(false); if (e.neuAufmass) starteNeuesAufmass() }
  const uebersichtAktiv = istAktiverPfad(NAV_UEBERSICHT.href, pathname)

  const navigation = (
    <nav aria-label="Hauptmenü" className="flex h-full flex-col px-3 pb-3 pt-5" style={{ background: 'var(--os-nav)', color: 'var(--os-nav-text)' }}>
      <Link href="/" className="flex items-center gap-2.5 px-2.5 pb-4">
        <span className="flex w-6 flex-col gap-[3px]" aria-hidden="true">
          <span className="h-1 bg-[var(--os-akzent)]" /><span className="h-1 bg-[#e7ebef]" /><span className="h-1 bg-[#e7ebef]" />
        </span>
        <span className="text-[18px] font-bold tracking-[0.8px] text-white">SCAFFOLD OS</span>
      </Link>

      <div className="flex-1 overflow-y-auto pr-0.5">
        {zeigeUebersicht && (
          <Link href={NAV_UEBERSICHT.href} onClick={() => setSchublade(false)} className={`os-nav-punkt ${uebersichtAktiv ? 'os-nav-aktiv' : ''}`}>
            <NAV_UEBERSICHT.icon className="h-5 w-5 shrink-0" />Übersicht
          </Link>
        )}

        {gruppen.map((g) => {
          const istAuftragsweg = !!g.nummer
          const hatAktiv = aktuell?.gruppe.key === g.key
          const aufgeklappt = offen[g.key] ?? hatAktiv // Gruppe der aktuellen Seite ist standardmäßig offen
          return (
            <div key={g.key} className="mt-0.5">
              {g.key === 'anfrage' && <div className="os-nav-kopf">Auftragsweg</div>}
              {g.key === 'betrieb' && <div className="os-nav-kopf mt-3 border-t border-[var(--os-nav-linie)] pt-3">Betrieb</div>}
              {g.key !== 'betrieb' && (
                <button type="button" onClick={() => setOffen((o) => ({ ...o, [g.key]: !aufgeklappt }))}
                  aria-expanded={aufgeklappt}
                  className={`os-nav-punkt w-full text-left ${hatAktiv ? 'text-white' : ''}`}
                  style={hatAktiv ? { boxShadow: 'inset 2px 0 0 var(--os-akzent)', borderRadius: '0 4px 4px 0' } : undefined}>
                  <span className="w-5 shrink-0 text-center font-mono text-[13px] opacity-60">{istAuftragsweg ? g.nummer : ''}</span>
                  <span className="flex-1">{g.label}</span>
                  {aufgeklappt ? <ChevronDown className="h-4 w-4 opacity-60" /> : <ChevronRight className="h-4 w-4 opacity-60" />}
                </button>
              )}
              {(aufgeklappt || g.key === 'betrieb') && (
                <div className={g.key === 'betrieb' ? '' : 'ml-[26px] border-l border-[var(--os-nav-linie)] pl-1.5'}>
                  {g.eintraege.map((e) => {
                    const aktiv = aktuell?.eintrag.href === e.href
                    return (
                      <Link key={e.href} href={e.href} onClick={klick(e)} className={`os-nav-unterpunkt ${aktiv ? 'os-nav-aktiv' : ''}`}>
                        <e.icon className="h-[18px] w-[18px] shrink-0 opacity-70" />{e.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex items-center gap-2.5 border-t border-[var(--os-nav-linie)] px-1.5 pt-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-[#303944] text-[14px] font-semibold text-white">
          {(name || '?').split(/[\s@]+/).filter(Boolean).slice(0, 2).map((t) => t[0]?.toUpperCase()).join('') || '?'}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-medium text-white">{name}</span>
          <span className="block text-[13px] opacity-60">{ROLLEN_NAME[rolle]}</span>
        </span>
        <button type="button" onClick={onLogout} title="Abmelden" aria-label="Abmelden" className="rounded p-1.5 opacity-70 hover:bg-white/10 hover:opacity-100">
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </nav>
  )

  return (
    <div className="os-shell flex h-dvh" style={{ background: 'var(--os-grund)' }}>
      {!schmal && <aside className="w-[300px] shrink-0">{navigation}</aside>}
      {schmal && schublade && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setSchublade(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-[300px] max-w-[88vw] shadow-2xl">{navigation}</aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-5" style={{ background: '#fff', borderColor: 'var(--os-linie)', paddingTop: 'env(safe-area-inset-top)' }}>
          {schmal && (
            <button type="button" onClick={() => setSchublade(true)} aria-label="Menü öffnen" className="rounded p-2 hover:bg-black/5"><Menu className="h-5 w-5" /></button>
          )}
          <div className="min-w-0 leading-tight">
            {aktuell && <div className="truncate text-[12.5px] uppercase tracking-wider" style={{ color: 'var(--os-text-leise)' }}>{aktuell.gruppe.nummer ? `${aktuell.gruppe.nummer} · ` : ''}{aktuell.gruppe.label}</div>}
            <div className="truncate text-[18px] font-semibold">{aktuell ? aktuell.eintrag.label : uebersichtAktiv ? 'Übersicht' : 'SCAFFOLD OS'}</div>
          </div>
          <button type="button" onClick={() => setSuche(true)}
            className="ml-auto flex items-center gap-2 rounded border px-3 py-2 text-[15px] hover:bg-black/[0.03] sm:w-[360px]"
            style={{ borderColor: 'var(--os-linie)', color: 'var(--os-text-leise)' }}>
            <Search className="h-4 w-4" /><span className="hidden flex-1 text-left sm:inline">Seite suchen</span>
            <kbd className="hidden rounded border px-1 font-mono text-[11px] sm:inline" style={{ borderColor: 'var(--os-linie)' }}>Strg K</kbd>
          </button>
        </header>

        <main ref={inhaltRef} className="os-ui min-w-0 flex-1 overflow-auto">{children}</main>
      </div>

      {suche && (
        <Suche rolle={rolle} onZu={() => setSuche(false)}
          onWahl={(e) => { setSuche(false); if (e.neuAufmass) starteNeuesAufmass(); router.push(e.href) }} />
      )}
    </div>
  )
}

function Suche({ rolle, onZu, onWahl }: { rolle: Rolle; onZu: () => void; onWahl: (e: NavEintrag) => void }) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const alle = useMemo(() => {
    const liste: { e: NavEintrag; gruppe: string }[] = []
    if (erlaubt(NAV_UEBERSICHT, rolle)) liste.push({ e: NAV_UEBERSICHT, gruppe: 'Start' })
    for (const g of sichtbareGruppen(rolle)) for (const e of g.eintraege) liste.push({ e, gruppe: g.label })
    return liste
  }, [rolle])
  const treffer = alle.filter(({ e, gruppe }) => `${e.label} ${gruppe} ${e.stichwoerter || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onMouseDown={onZu}>
      <div className="w-full max-w-lg overflow-hidden rounded-md bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-3" style={{ borderColor: 'var(--os-linie)' }}>
          <Search className="h-4 w-4 opacity-50" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setI(0) }} placeholder="Seite suchen, z. B. Rechnung, Lager, CAD"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, treffer.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)) }
              if (e.key === 'Enter' && treffer[i]) onWahl(treffer[i].e)
            }}
            className="h-12 flex-1 bg-transparent text-[15px] outline-none" />
          <button type="button" onClick={onZu} aria-label="Schließen" className="rounded p-1 hover:bg-black/5"><X className="h-4 w-4" /></button>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {treffer.length === 0 && <li className="px-4 py-3 text-[14px]" style={{ color: 'var(--os-text-leise)' }}>Keine Seite gefunden.</li>}
          {treffer.map(({ e, gruppe }, n) => (
            <li key={e.href}>
              <button type="button" onClick={() => onWahl(e)} onMouseEnter={() => setI(n)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left text-[14px]" style={{ background: n === i ? '#eef0f3' : undefined }}>
                <e.icon className="h-4 w-4 opacity-60" /><span className="flex-1">{e.label}</span>
                <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--os-text-leise)' }}>{gruppe}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
