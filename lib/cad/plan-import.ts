// ============================================================
// SCAFFOLD OS – Plan-Import: Grundrisse aus einem Vektor-PDF lesen und als Maße für den Aufmaß aufbereiten.
// Das Lesen (Browser, pdf.js) und die Aufbereitung (rein) sind getrennt, damit die Aufbereitung testbar bleibt.
// ============================================================

import type { GefundenerGrundriss, PlanText } from './grundriss-finden'
import type { VektorFlaeche } from './pdf-vektoren'
import { oeffnungenFinden } from './oeffnungen-aus-plan'
import { gelaendeAusPlan, type GelaendeAusPlan } from './gelaende-aus-plan'
import { hauptkoerperAusKontur, type Vorbau } from './hauptkoerper'
import { oeffnungenAnKanten, type PlanOeffnungAnKante } from './plan-oeffnungen-modell'
import { dachAusPlan, dachKotenAusPlan, pultdachNeigung, type PlanDachform } from './dachform-aus-plan'

export interface PlanImportGeschoss { titel: string; ebene: number; laengeM: number; breiteM: number; flaecheM2: number; fenster?: number; tueren?: number
  /** Vorsprünge (z. B. WC-Erker), die nicht in Länge/Breite stecken – diese beschreiben den Hauptkörper */
  vorbauten?: Vorbau[]
  /** Fenster und Türen an den Kanten des Hauptkörpers (für das 3D-Modell); fehlt bei Konturen ohne klaren Hauptkörper */
  oeffnungen?: PlanOeffnungAnKante[]
  /** Öffnungen, die an keiner Kante des Hauptkörpers liegen (z. B. an einem Vorbau) und nicht eingezeichnet werden */
  oeffnungenAbseits?: number
  /** Längere Seite des Hauptkörpers im Plan: 'x' = waagerecht, 'y' = senkrecht */
  langeAchse?: 'x' | 'y'
}

export interface PlanImport {
  dateiname: string
  massstab: number
  geschosse: PlanImportGeschoss[]
  /** Geschoss, dessen Maße als Länge/Breite des Gebäudes gelten: das flächengrößte über dem Gelände (ab Erdgeschoss) */
  hauptEbene: number
  /** Aus First-/Traufe-Beschriftungen gelesen; fehlt, wenn der Plan es nicht eindeutig zeigt */
  dachform?: PlanDachform
  /** Kote der First-/Traufkante laut Beschriftung im Schnitt (Meter, bezogen auf ±0,00 = Erdgeschoss-Fußboden) */
  firstKoteM?: number
  traufKoteM?: number
  /** Nur bei Pultdach mit beiden Koten: atan(Höhenunterschied / Tiefe), ohne Dachüberstand */
  dachneigungGrad?: number
  /** Geländekoten rund um das Hauptgeschoss (±0,00 = dessen Fußboden); fehlt bei weniger als 2 Punkten */
  gelaende?: GelaendeAusPlan
}

const runde = (v: number) => Math.round(v * 100) / 100

/** Aus den gefundenen Grundrissen die Maße je Geschoss bilden (Länge = längere Seite) und das Hauptgeschoss wählen. */
export function planImportAus(dateiname: string, massstab: number, gefunden: GefundenerGrundriss[], texte: PlanText[] = [], flaechen: VektorFlaeche[] = []): PlanImport | null {
  if (!gefunden.length) return null
  const mpp = (0.0254 / 72) * massstab
  const geschosse: PlanImportGeschoss[] = gefunden.map((g) => {
    // Hauptkörper statt umschließendem Rechteck, wenn nur kleine Vorbauten abstehen
    const hk = hauptkoerperAusKontur(g.kontur, mpp)
    const laenge = hk ? hk.laengeM : Math.max(g.breiteM, g.tiefeM)
    const breite = hk ? hk.breiteM : Math.min(g.breiteM, g.tiefeM)
    return {
      titel: g.titel,
      ebene: g.ebene,
      laengeM: runde(laenge),
      breiteM: runde(breite),
      flaecheM2: Math.round(g.flaecheM2 * 10) / 10,
      ...(hk && hk.vorbauten.length ? { vorbauten: hk.vorbauten } : {}),
      ...(flaechen.length ? (() => {
        const o = oeffnungenFinden(flaechen, g, texte, mpp)
        const lage = hk ? oeffnungenAnKanten(o, hk.rechteck, mpp) : null
        return {
          fenster: o.filter((x) => x.typ === 'fenster').length, tueren: o.filter((x) => x.typ === 'tuer').length,
          ...(hk && lage ? {
            oeffnungen: lage.an, oeffnungenAbseits: lage.abseits,
            langeAchse: (hk.rechteck.x1 - hk.rechteck.x0 >= hk.rechteck.y1 - hk.rechteck.y0 ? 'x' : 'y') as 'x' | 'y',
          } : {}),
        }
      })() : {}),
    }
  })
  const ueberGelaende = geschosse.filter((g) => g.ebene >= 0)
  if (!ueberGelaende.length) return null // nur Keller gefunden: kein Gerüst-Grundriss
  const haupt = ueberGelaende.reduce((a, b) => (b.flaecheM2 > a.flaecheM2 ? b : a))
  const hauptG = gefunden.find((g) => g.ebene === haupt.ebene)
  const gelaende = hauptG ? gelaendeAusPlan(hauptG, texte, (0.0254 / 72) * massstab) : null
  const dach = dachAusPlan(gefunden, texte, (0.0254 / 72) * massstab)
  const koten = dachKotenAusPlan(texte)
  const neigung = dach?.dachform === 'Pultdach' && koten.firstM !== undefined && koten.traufeM !== undefined
    ? pultdachNeigung(koten.firstM, koten.traufeM, dachTiefeOhneVorbau(dach.tiefeM, haupt)) : null
  return {
    dateiname, massstab, geschosse, hauptEbene: haupt.ebene,
    ...(dach ? { dachform: dach.dachform } : {}),
    ...(koten.firstM !== undefined ? { firstKoteM: koten.firstM } : {}),
    ...(koten.traufeM !== undefined ? { traufKoteM: koten.traufeM } : {}),
    ...(neigung !== null ? { dachneigungGrad: neigung } : {}),
    ...(gelaende ? { gelaende } : {}),
  }
}

/** Die Dachtiefe stammt aus dem umschließenden Rechteck; ragt ein Vorbau heraus, zählt die Seite des Hauptkörpers, die ihr am nächsten liegt. */
function dachTiefeOhneVorbau(tiefeM: number, g: PlanImportGeschoss): number {
  if (!g.vorbauten?.length) return tiefeM
  return Math.abs(g.laengeM - tiefeM) <= Math.abs(g.breiteM - tiefeM) ? g.laengeM : g.breiteM
}

/** Geschosse über dem Gelände, die deutlich (> 1 m) kürzer sind als das Hauptgeschoss: Rücksprünge. */
export function ruecksprunge(p: PlanImport): PlanImportGeschoss[] {
  const haupt = p.geschosse.find((g) => g.ebene === p.hauptEbene)
  if (!haupt) return []
  return p.geschosse.filter((g) => g.ebene >= 0 && g.ebene !== p.hauptEbene && g.laengeM < haupt.laengeM - 1)
}

const kom = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

/** Hinweise aus dem Plan für Schritt 2: was in Länge/Breite/Höhe NICHT steckt und vom Menschen zu prüfen ist. */
export function planHinweiseFuerAufmass(p: PlanImport): string[] {
  const haupt = p.geschosse.find((g) => g.ebene === p.hauptEbene)
  if (!haupt) return []
  const h: string[] = []
  if (haupt.vorbauten?.length) {
    const m2 = Math.round(haupt.vorbauten.reduce((a, v) => a + v.flaecheM2, 0) * 10) / 10
    h.push(`Das ${haupt.titel} hat ${haupt.vorbauten.length === 1 ? 'einen Vorbau' : `${haupt.vorbauten.length} Vorbauten`} (ca. ${kom(m2)} m²), der in Länge und Breite nicht enthalten ist – bei Bedarf als Abschnitt eintragen.`)
  }
  for (const g of ruecksprunge(p)) h.push(`Das ${g.titel} ist kürzer (${kom(g.laengeM)} m statt ${kom(haupt.laengeM)} m) – bei Bedarf als eigenen Abschnitt eintragen.`)
  if (p.gelaende && p.gelaende.unterschiedM >= 1) h.push(`Hanglage: Geländeunterschied ca. ${kom(p.gelaende.unterschiedM)} m – die Gerüsthöhe ist je Seite verschieden (Talseite höher).`)
  return h
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
      const r = planImportAus(datei.name, ms, grundrisseFinden(fl, texte, meterJePunkt(ms)), texte, fl)
      if (r) return r
    }
    return null
  } finally {
    q.freigeben()
  }
}
