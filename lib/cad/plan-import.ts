// ============================================================
// SCAFFOLD OS – Plan-Import: Grundrisse aus einem Vektor-PDF lesen und als Maße für den Aufmaß aufbereiten.
// Das Lesen (Browser, pdf.js) und die Aufbereitung (rein) sind getrennt, damit die Aufbereitung testbar bleibt.
// ============================================================

import type { GefundenerGrundriss, PlanText } from './grundriss-finden'
import { dachformAusPlan, type PlanDachform } from './dachform-aus-plan'

export interface PlanImportGeschoss { titel: string; ebene: number; laengeM: number; breiteM: number; flaecheM2: number }

export interface PlanImport {
  dateiname: string
  massstab: number
  geschosse: PlanImportGeschoss[]
  /** Geschoss, dessen Maße als Länge/Breite des Gebäudes gelten: das flächengrößte über dem Gelände (ab Erdgeschoss) */
  hauptEbene: number
  /** Aus First-/Traufe-Beschriftungen gelesen; fehlt, wenn der Plan es nicht eindeutig zeigt */
  dachform?: PlanDachform
}

const runde = (v: number) => Math.round(v * 100) / 100

/** Aus den gefundenen Grundrissen die Maße je Geschoss bilden (Länge = längere Seite) und das Hauptgeschoss wählen. */
export function planImportAus(dateiname: string, massstab: number, gefunden: GefundenerGrundriss[], texte: PlanText[] = []): PlanImport | null {
  if (!gefunden.length) return null
  const geschosse: PlanImportGeschoss[] = gefunden.map((g) => ({
    titel: g.titel,
    ebene: g.ebene,
    laengeM: runde(Math.max(g.breiteM, g.tiefeM)),
    breiteM: runde(Math.min(g.breiteM, g.tiefeM)),
    flaecheM2: Math.round(g.flaecheM2 * 10) / 10,
  }))
  const ueberGelaende = geschosse.filter((g) => g.ebene >= 0)
  if (!ueberGelaende.length) return null // nur Keller gefunden: kein Gerüst-Grundriss
  const haupt = ueberGelaende.reduce((a, b) => (b.flaecheM2 > a.flaecheM2 ? b : a))
  const dachform = dachformAusPlan(gefunden, texte, 0.0254 / 72 * massstab) ?? undefined
  return { dateiname, massstab, geschosse, hauptEbene: haupt.ebene, ...(dachform ? { dachform } : {}) }
}

/** Geschosse über dem Gelände, die deutlich (> 1 m) kürzer sind als das Hauptgeschoss: Rücksprünge. */
export function ruecksprunge(p: PlanImport): PlanImportGeschoss[] {
  const haupt = p.geschosse.find((g) => g.ebene === p.hauptEbene)
  if (!haupt) return []
  return p.geschosse.filter((g) => g.ebene >= 0 && g.ebene !== p.hauptEbene && g.laengeM < haupt.laengeM - 1)
}

/** Browser: Plan-PDF lesen (erste 3 Seiten), bis Grundrisse gefunden werden. null bei Bildern, Scans und Plänen ohne Geschoss-Überschrift. */
export async function planLesen(datei: File): Promise<PlanImport | null> {
  if (!/\.pdf$/i.test(datei.name) && datei.type !== 'application/pdf') return null
  const [{ ladePlanQuelle }, { grundrisseFinden }, { massstabAusTexten, meterJePunkt }] = await Promise.all([
    import('./plan-rendern'), import('./grundriss-finden'), import('./plan-vorlage'),
  ])
  const q = await ladePlanQuelle(datei)
  try {
    for (let nr = 1; nr <= Math.min(q.seiten, 3); nr++) {
      const texte = await q.texte(nr, 0)
      const ms = massstabAusTexten(texte.map((t) => t.s))
      if (!ms) continue
      const fl = await q.vektoren(nr, 0)
      if (!fl.length) continue
      const r = planImportAus(datei.name, ms, grundrisseFinden(fl, texte, meterJePunkt(ms)), texte)
      if (r) return r
    }
    return null
  } finally {
    q.freigeben()
  }
}
