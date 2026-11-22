'use client'
// Kopfzeile des CAD-Arbeitsplatzes (ca. 48 px): Produkt, Projekt, System, Speicherstatus, Version – rechts die Hauptaktionen.
// Keine eigene Datenhaltung: alles kommt aus der CAD-Seite.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Undo2, Redo2, History, Save, Share2, Download, UserCircle, Boxes } from 'lucide-react'
import { SPEICHER_HINWEIS, SPEICHER_TEXT, type SpeicherStatus } from '@/lib/cad/speicherstatus'

export interface MenuEintrag { id: string; label: string; onClick: () => void; aus?: boolean; aktiv?: boolean }

export interface CadKopfzeileProps {
  projektName: string | null
  systemName: string | null
  status: SpeicherStatus
  versionText: string
  kannZurueck: boolean; kannVor: boolean; onZurueck: () => void; onVor: () => void
  onVersionen: () => void
  onSpeichern: () => void; speichernAus: boolean; speichernTitel?: string
  onTeilen: () => void; teilenAus: boolean
  exportEintraege: MenuEintrag[]
  profilEintraege: MenuEintrag[]
  /** weitere Kennzahlen (nur auf breiten Bildschirmen) */
  zusatz?: ReactNode
}

const PUNKT: Record<SpeicherStatus, string> = { gespeichert: '#22c55e', aenderungen: '#f2a900', laeuft: '#3b82f6', fehler: '#ef4444', offline: '#687383' }

function Aktion({ icon: Icon, label, titel, aus, onClick, kurz }: { icon: typeof Save; label: string; titel: string; aus?: boolean; onClick: () => void; kurz?: boolean }) {
  return (
    <button type='button' onClick={onClick} disabled={aus} title={titel} aria-label={label}
      className='cad-kopf-knopf inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-[12px] font-medium disabled:pointer-events-none disabled:opacity-40'>
      <Icon className='h-4 w-4' strokeWidth={1.8} />{kurz ? null : <span className='hidden xl:inline'>{label}</span>}
    </button>
  )
}

function MenuKnopf({ icon: Icon, label, titel, eintraege, kurz }: { icon: typeof Save; label: string; titel: string; eintraege: MenuEintrag[]; kurz?: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const wurzel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!pos) return
    const zu = (e: Event) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wurzel.current?.contains(e.target as Node)) setPos(null) }
    document.addEventListener('mousedown', zu); document.addEventListener('keydown', zu)
    return () => { document.removeEventListener('mousedown', zu); document.removeEventListener('keydown', zu) }
  }, [pos])
  return (
    <div ref={wurzel} className='relative'>
      <Aktion icon={Icon} label={label} titel={titel} kurz={kurz} onClick={() => setPos((p) => p ? null : (() => { const r = wurzel.current!.getBoundingClientRect(); return { x: Math.max(8, Math.min(r.left, window.innerWidth - 208)), y: r.bottom + 2 } })())} />
      {pos && (
        <div role='menu' aria-label={label} className='cad-kopf-menue fixed z-50 min-w-[200px] max-h-[70vh] overflow-y-auto rounded-md border py-1 text-[13px] shadow-lg' style={{ left: pos.x, top: pos.y }}>
          {eintraege.map((x) => (
            <button key={x.id} type='button' role='menuitem' disabled={x.aus} onClick={() => { setPos(null); x.onClick() }}
              className='flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left disabled:opacity-40'>
              <span>{x.label}</span>{x.aktiv ? <span aria-hidden>✓</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CadKopfzeile(p: CadKopfzeileProps) {
  return (
    <header aria-label='Kopfzeile' data-testid='cad-kopfzeile' className='cad-kopf flex h-12 shrink-0 items-center gap-3 border-b px-3'>
      <div className='flex shrink-0 items-center gap-2'>
        <span aria-hidden className='flex h-7 w-7 items-center justify-center rounded' style={{ background: '#f2a900', color: '#101216' }}><Boxes className='h-4 w-4' strokeWidth={2.2} /></span>
        <div className='leading-tight'>
          <div className='text-[13px] font-bold tracking-wide'>SCAFFOLD OS</div>
          <div className='cad-kopf-leise text-[10px]'>Gerüstbau-CAD</div>
        </div>
      </div>
      <span aria-hidden className='h-6 w-px shrink-0 cad-kopf-trenner' />
      <div className='min-w-0 flex-1 leading-tight'>
        <div className='truncate text-[13px] font-semibold' data-testid='kopf-projekt'>{p.projektName || 'Unbenanntes Projekt'}</div>
        <div className='cad-kopf-leise flex min-w-0 items-center gap-2 text-[11px]'>
          <span className='truncate' data-testid='kopf-system'>{p.systemName || 'Kein System'}</span>
          <span aria-hidden>·</span>
          <span className='inline-flex shrink-0 items-center gap-1' title={SPEICHER_HINWEIS[p.status]} role='status' data-testid='kopf-status' data-status={p.status}>
            <span aria-hidden className='inline-block h-2 w-2 rounded-full' style={{ background: PUNKT[p.status] }} />{SPEICHER_TEXT[p.status]}
          </span>
          <span aria-hidden>·</span>
          <span className='shrink-0' data-testid='kopf-version'>{p.versionText}</span>
        </div>
      </div>
      {p.zusatz ? <div className='cad-kopf-leise hidden shrink-0 text-[11px] 2xl:block'>{p.zusatz}</div> : null}
      <div className='flex shrink-0 items-center gap-0.5'>
        <Aktion icon={Undo2} label='Rückgängig' titel='Letzte Änderung rückgängig machen (Strg/Cmd+Z)' aus={!p.kannZurueck} onClick={p.onZurueck} />
        <Aktion icon={Redo2} label='Wiederholen' titel='Rückgängig gemachte Änderung wiederholen (Strg/Cmd+Umschalt+Z)' aus={!p.kannVor} onClick={p.onVor} />
        <span aria-hidden className='mx-1 h-5 w-px cad-kopf-trenner' />
        <Aktion icon={History} label='Versionen' titel='Gespeicherte Stände ansehen oder wiederherstellen' onClick={p.onVersionen} />
        <Aktion icon={Save} label='Speichern' titel={p.speichernTitel ?? 'Projekt als Datei speichern'} aus={p.speichernAus} onClick={p.onSpeichern} />
        <Aktion icon={Share2} label='Teilen' titel='Projekt als Datei zum Weitergeben speichern' aus={p.teilenAus} onClick={p.onTeilen} />
        <MenuKnopf icon={Download} label='Export' titel='Plan, Montageplan, DXF, IFC oder Bild ausgeben' eintraege={p.exportEintraege} />
        <span aria-hidden className='mx-1 h-5 w-px cad-kopf-trenner' />
        <MenuKnopf icon={UserCircle} label='Profil' titel='Darstellung, Konto und Neustart' eintraege={p.profilEintraege} kurz />
      </div>
    </header>
  )
}
