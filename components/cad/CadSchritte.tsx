'use client'

// Schrittleiste für den CAD-Ablauf und die Gerüst-Auswahl nach dem Hausbau.
//   1 Haus   2 Hülle prüfen   3 Gerüst   4 Feinschliff
// Schritt 3 („Gerüst") bietet drei Wege: eine Wand komplett bauen lassen, alle Seiten bauen lassen, oder leer starten und jedes Teil selbst setzen.
// Danach (Schritt 4) ist alles von Hand änderbar: Teile wählen, verschieben, drehen, ersetzen, löschen, Katalogteile dazusetzen.

export type Seite = 'front' | 'back' | 'left' | 'right'
export type GeruestWahl = 'offen' | 'leer' | 'auto'

const SEITEN: { id: Seite; name: string }[] = [
  { id: 'front', name: 'Vorderseite' }, { id: 'back', name: 'Rückseite' }, { id: 'left', name: 'Links' }, { id: 'right', name: 'Rechts' },
]

interface Props {
  /** Aktueller Schritt 1–4 */
  schritt: 1 | 2 | 3 | 4
  wahl: GeruestWahl
  seiten: Seite[]
  onWand: (seite: Seite) => void
  onAlle: () => void
  onLeer: () => void
}

const NAMEN = ['Haus', 'Hülle prüfen', 'Gerüst', 'Feinschliff']

export default function CadSchritte({ schritt, wahl, seiten, onWand, onAlle, onLeer }: Props) {
  return (
    <div className='border-b border-black/10 bg-white px-4 py-2 text-xs'>
      <ol className='flex flex-wrap items-center gap-x-4 gap-y-1' aria-label='Ablauf'>
        {NAMEN.map((n, i) => {
          const nr = i + 1
          const aktiv = nr === schritt
          return (
            <li key={n} aria-current={aktiv ? 'step' : undefined} className={aktiv ? 'font-semibold text-[#0071e3]' : nr < schritt ? 'text-green-700' : 'text-[#6e6e73]'}>
              {nr < schritt ? '✓ ' : `${nr} · `}{n}
            </li>
          )
        })}
      </ol>
      {schritt === 3 && wahl === 'offen' && (
        <div className='mt-2 flex flex-wrap items-center gap-2' role='group' aria-label='Gerüst aufbauen'>
          <span className='font-medium'>Gerüst:</span>
          {SEITEN.map((s) => (
            <button key={s.id} type='button' onClick={() => onWand(s.id)} className='rounded-lg border border-black/15 bg-white px-2.5 py-1 hover:bg-black/5'>{s.name} komplett bauen</button>
          ))}
          <button type='button' onClick={onAlle} className='rounded-lg bg-[#0071e3] px-2.5 py-1 font-medium text-white hover:bg-[#0062c4]'>Alle Seiten bauen</button>
          <button type='button' onClick={onLeer} className='rounded-lg border border-black/15 bg-white px-2.5 py-1 hover:bg-black/5'>Leer starten – Teile selbst setzen</button>
        </div>
      )}
      {schritt === 4 && (
        <p className='mt-1 text-[#6e6e73]'>
          {wahl === 'leer' ? 'Leer gestartet: Teile aus dem Baukasten wählen und im Modell setzen. ' : `Gerüst steht${seiten.length ? ` (${seiten.map((s) => SEITEN.find((x) => x.id === s)?.name).join(', ')})` : ''}. `}
          Jedes Teil lässt sich anklicken, verschieben, drehen, ersetzen oder löschen.
        </p>
      )}
    </div>
  )
}
