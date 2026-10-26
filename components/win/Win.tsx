'use client'

import type { ReactNode } from 'react'

// Bausteine für die Desktop-Optik (Windows-Stil): Titelleiste, Menüband mit Gruppen, Baumansicht, Dokument-Reiter, Statusleiste.
// Farben als Variablen, damit alle Seiten gleich aussehen und später zentral anpassbar sind.
export const WIN = {
  grund: '#f3f3f3', flaeche: '#ffffff', rand: '#d6d6d6', randHell: '#e5e5e5', text: '#1b1b1b', textGedaempft: '#605e5c',
  akzent: '#e8590c', akzentHell: '#fdeee5', auswahl: '#e5f1fb', auswahlRand: '#99c8f0', titel: '#2b2b2b',
}

export function Titelleiste({ titel, untertitel, rechts }: { titel: string; untertitel?: string; rechts?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-3 h-10 text-white text-[19px]" style={{ background: 'linear-gradient(#4a86c8,#2d63a3)' }}>
      <span className="font-bold">{titel}</span>
      {untertitel && <span className="opacity-70 truncate">– {untertitel}</span>}
      <span className="ml-auto flex items-center gap-2">{rechts}</span>
    </div>
  )
}

export function Menueband({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-stretch overflow-x-auto border-b" style={{ background: WIN.flaeche, borderColor: WIN.rand }}>
      {children}
    </div>
  )
}

export function BandGruppe({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col px-2 border-r shrink-0" style={{ borderColor: WIN.randHell }}>
      <div className="flex items-start gap-0.5 pt-1.5 pb-0.5">{children}</div>
      <div className="text-center text-[15px] pb-1" style={{ color: WIN.textGedaempft }}>{name}</div>
    </div>
  )
}

export function BandKnopf({ icon, label, onClick, disabled, aktiv, gefahr, titel }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; aktiv?: boolean; gefahr?: boolean; titel?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={titel || label}
      className="flex flex-col items-center gap-1 w-[104px] px-1 py-1.5 rounded text-[16px] leading-tight text-center transition-colors disabled:opacity-40 disabled:pointer-events-none hover:bg-[#e8f0f8] active:bg-[#cfe3f5]"
      style={{ color: gefahr ? '#b42318' : WIN.text, background: aktiv ? WIN.auswahl : undefined, outline: aktiv ? `1px solid ${WIN.auswahlRand}` : undefined }}>
      <span className="h-6 flex items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

export function BaumKnoten({ ebene, label, aktiv, href, onClick, rechts, symbol }: { ebene: number; label: string; aktiv?: boolean; href?: string; onClick?: () => void; rechts?: string; symbol?: string }) {
  const stil = { paddingLeft: 8 + ebene * 14, background: aktiv ? WIN.auswahl : undefined, borderLeft: `3px solid ${aktiv ? WIN.akzent : 'transparent'}` }
  const inhalt = (<><span className="w-4 text-center opacity-70">{symbol}</span><span className="truncate">{label}</span>{rechts && <span className="ml-auto pl-2 text-[16px] tabular-nums whitespace-nowrap" style={{ color: WIN.textGedaempft }}>{rechts}</span>}</>)
  const klasse = 'flex items-center gap-1.5 py-1 pr-2 text-[19px] hover:bg-[#eef4fa] w-full text-left'
  return href ? <a href={href} className={klasse} style={stil}>{inhalt}</a> : <button type="button" onClick={onClick} className={klasse} style={stil}>{inhalt}</button>
}

export function DokumentReiter({ reiter, aktiv, onWahl }: { reiter: { key: string; label: string }[]; aktiv: string; onWahl: (k: string) => void }) {
  return (
    <div className="flex items-end gap-0.5 px-2 pt-1.5 border-b" style={{ borderColor: WIN.rand, background: WIN.grund }}>
      {reiter.map((r) => (
        <button key={r.key} type="button" onClick={() => onWahl(r.key)}
          className="px-3 py-1.5 text-[19px] rounded-t border border-b-0"
          style={{ background: aktiv === r.key ? WIN.flaeche : 'transparent', borderColor: aktiv === r.key ? WIN.rand : 'transparent', marginBottom: -1, fontWeight: aktiv === r.key ? 600 : 400 }}>
          {r.label}
        </button>
      ))}
    </div>
  )
}

export function Statusleiste({ links, rechts }: { links: ReactNode; rechts?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-3 h-10 text-[17px] border-t whitespace-nowrap overflow-hidden" style={{ background: WIN.grund, borderColor: WIN.rand, color: WIN.textGedaempft }}>
      <span className="flex items-center gap-4">{links}</span>
      <span className="ml-auto flex items-center gap-4">{rechts}</span>
    </div>
  )
}

export function Aufgabenbereich({ titel, onZu, children }: { titel: string; onZu: () => void; children: ReactNode }) {
  return (
    <aside className="flex flex-col border-l bg-white min-h-0" style={{ borderColor: WIN.rand }}>
      <div className="flex items-center px-3 h-11 border-b text-[19px] font-semibold" style={{ borderColor: WIN.randHell, background: WIN.grund }}>
        {titel}<button type="button" onClick={onZu} className="ml-auto px-2 hover:bg-black/10 rounded" aria-label="Schließen">✕</button>
      </div>
      <div className="p-3 space-y-3 overflow-y-auto">{children}</div>
    </aside>
  )
}
