// ============================================================
// SCAFFOLD OS – Anschlussstatus eines Bauteils (nur Anzeige, ändert das Modell nicht)
//
// Zustände:
//  'abgeleitet' – Anschlusspunkte sind aus den Maßen abgeleitet (anschluesse.ts); keine Konflikte in Reichweite
//  'ungueltig'  – ein Anschlusspunkt liegt auf einem Punkt, der geometrisch NICHT dazu passt
//  'unbekannt'  – für diese Bauteilart sind keine Anschlusspunkte hinterlegt
// 'herstellerbestaetigt' wird NIE gesetzt: es gibt keine bestätigten Herstellerdaten. Eine geometrische Verbindung ist
// weder eine Herstellerfreigabe noch eine statische Prüfung.
// ============================================================
import { ports, kompatibel, ANSCHLUSS_TOLERANZ_M, type PortBauteil } from '@/lib/cad/anschluesse'
import { PortIndex } from '@/lib/cad/einrasten'

export type AnschlussZustand = 'abgeleitet' | 'ungueltig' | 'unbekannt'
export interface AnschlussStatus {
  zustand: AnschlussZustand
  herstellerbestaetigt: false
  punkte: number
  verbunden: number
  offen: number
  konflikte: string[]
}

export function anschlussStatus(bauteil: PortBauteil, alle: PortBauteil[], index?: PortIndex): AnschlussStatus {
  const eigene = ports(bauteil)
  if (eigene.length === 0) return { zustand: 'unbekannt', herstellerbestaetigt: false, punkte: 0, verbunden: 0, offen: 0, konflikte: [] }
  const idx = index ?? new PortIndex(alle)
  let verbunden = 0, offen = 0
  const konflikte: string[] = []
  for (const p of eigene) {
    const nah = idx.nahe(p.pos, ANSCHLUSS_TOLERANZ_M).filter((q) => q.bauteilId !== bauteil.id)
    if (nah.length === 0) { offen++; continue }
    const passend = nah.find((q) => kompatibel(p, q).ok)
    if (passend) verbunden++
    else { offen++; const g = kompatibel(p, nah[0]).grund; if (g) konflikte.push(g) }
  }
  return { zustand: konflikte.length > 0 ? 'ungueltig' : 'abgeleitet', herstellerbestaetigt: false, punkte: eigene.length, verbunden, offen, konflikte: [...new Set(konflikte)] }
}

export const ANSCHLUSS_TEXT: Record<AnschlussZustand, string> = {
  abgeleitet: 'Geometrisch abgeleitet – nicht herstellerbestätigt',
  ungueltig: 'Ungültig (geometrisch unverträglich)',
  unbekannt: 'Unbekannt (keine Anschlusspunkte hinterlegt)',
}
