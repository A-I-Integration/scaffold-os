// ============================================================
// SCAFFOLD OS – Plan-Import: Grundrisse aus einem Vektor-PDF lesen und als Maße für den Aufmaß aufbereiten.
// Das Lesen (Browser, pdf.js) und die Aufbereitung (rein) sind getrennt, damit die Aufbereitung testbar bleibt.
// ============================================================

import type { GefundenerGrundriss, PlanText } from './grundriss-finden'
import type { VektorFlaeche } from './pdf-vektoren'
import { oeffnungenFinden } from './oeffnungen-aus-plan'
import { terrassenFinden, type PlanTerrasse } from './terrassen-aus-plan'
import { lesMassketten, type MasskettenErgebnis } from './masse-lesen'
import type { GelaendeLinieAnsicht } from './gelaende-aus-ansichten'
import { gelaendeAusPlan, gelaendeJeKante, gelaendeEckenAusPlan, type GelaendeAusPlan, type GelaendeJeKante } from './gelaende-aus-plan'
import { hauptkoerperAusKontur, type Vorbau } from './hauptkoerper'
import type { UmrissPunkt } from '@/lib/calculations/cad-umriss'
import { oeffnungenAnKanten, vorbautenAnKanten, type PlanOeffnungAnKante, type PlanVorbauAnKante } from './plan-oeffnungen-modell'
import { kotenJeAnsicht, pultNiedrigeRichtung, gelaendeTiefeJeAnsicht, type Himmelsrichtung, type GelaendeTiefe } from './koten-je-ansicht'
import { dachAusPlan, dachKotenAusPlan, pultdachNeigung, type PlanDachform } from './dachform-aus-plan'
import { geschossHoehenAusPlan, type GeschossHoehenVorschlag } from './geschoss-hoehen-aus-plan'

export interface PlanImportGeschoss { titel: string; ebene: number; /** Rahmen der Kontur in Seiten-Punkten [x0, y0, x1, y1]; dient dem Abgleich mit Maßketten neben dem Geschoss */ bboxPt?: [number, number, number, number]; laengeM: number; breiteM: number; flaecheM2: number; fenster?: number; tueren?: number
  /** Vollständige erkannte Außenkontur des Geschosses in Metern, auf den Gebäude-Mittelpunkt zentriert. */
  umriss?: UmrissPunkt[]
  /** Vorsprünge (z. B. WC-Erker), die nicht in Länge/Breite stecken – diese beschreiben den Hauptkörper */
  vorbauten?: Vorbau[]
  /** Fenster und Türen an den Kanten des Hauptkörpers (für das 3D-Modell); fehlt bei Konturen ohne klaren Hauptkörper */
  oeffnungen?: PlanOeffnungAnKante[]
  /** Öffnungen, die an keiner Kante des Hauptkörpers liegen (z. B. an einem Vorbau) und nicht eingezeichnet werden */
  oeffnungenAbseits?: number
  /** Fenster und Türen mit Lage in Metern in der Basis von `umriss` (Mitte aller Geschosse = 0, z nach unten im Plan) */
  oeffnungenPlan?: { typ: 'tuer' | 'fenster'; x: number; z: number; breiteM: number; bruestungM?: number; sturzM?: number }[]
  /** Vorbauten an den Kanten des Hauptkörpers (für das 3D-Modell) */
  vorbautenAnKante?: PlanVorbauAnKante[]
  /** Längere Seite des Hauptkörpers im Plan: 'x' = waagerecht, 'y' = senkrecht */
  langeAchse?: 'x' | 'y'
}

export interface PlanImport {
  dateiname: string
  massstab: number
  geschosse: PlanImportGeschoss[]
  /** Geschoss, dessen Maße als Länge/Breite des Gebäudes gelten: das flächengrößte über dem Gelände (ab Erdgeschoss) */
  hauptEbene: number
  /** Explizit beschriftete OKFF-Koten je Geschoss; immer nur Vorschläge, manuelle Bestätigung erforderlich. */
  geschossHoehenVorschlaege: GeschossHoehenVorschlag[]
  /** Aus First-/Traufe-Beschriftungen gelesen; fehlt, wenn der Plan es nicht eindeutig zeigt */
  dachform?: PlanDachform
  /** Kote der First-/Traufkante laut Beschriftung im Schnitt (Meter, bezogen auf ±0,00 = Erdgeschoss-Fußboden) */
  firstKoteM?: number
  traufKoteM?: number
  /** Nur bei Pultdach mit beiden Koten: atan(Höhenunterschied / Tiefe), ohne Dachüberstand */
  dachneigungGrad?: number
  /** Pultdach: Himmelsrichtung der niedrigen Seite (Traufe), aus den Nord-/Südansichten; fehlt, wenn nicht eindeutig lesbar */
  pultNiedrigeRichtung?: Himmelsrichtung
  /** Terrassen/Balkone, die an ein Geschoss grenzen (Lage in Metern in der Basis von `umriss`) */
  terrassen?: PlanTerrasse[]
  /** Hanglage: tiefste Geländekote je Ansicht (freiliegendes Untergeschoss auf der Talseite), aus den Ansichten; leer ohne nennenswerten Abfall */
  gelaendeTiefe?: GelaendeTiefe[]
  /** Geländekoten rund um das Hauptgeschoss (±0,00 = dessen Fußboden); fehlt bei weniger als 2 Punkten */
  gelaende?: GelaendeAusPlan
  /** Geländekoten je Kante des Hauptkörpers (Plan-Kanten); nur Kanten mit Kote. Dient als Vorlage, der Mensch korrigiert. */
  gelaendeJeKante?: GelaendeJeKante[]
  /** Geländehöhe an den Plan-Ecken des Hauptkörpers (tl/tr/bl/br, Plan-Koordinaten); Vorschlag zum Füllen der Eckhöhen. */
  gelaendeEckenPlan?: { tl?: number; tr?: number; bl?: number; br?: number }
  /** Geländelinie je Ansicht (aus dem Bild gelesen, Höhenbezug über die Koten-Dreiecke); Vorschlag zum Füllen des Geländeprofils je Seite. */
  gelaendeLinien?: GelaendeLinieAnsicht[]
  /** Maßzahlen der Seite gegen die gezeichneten Maßlinien geprüft (siehe masse-lesen.ts); fehlt, wenn keine Maßzahlen gelesen wurden */
  masse?: MasskettenErgebnis
}

const runde = (v: number) => Math.round(v * 100) / 100

/** Aus den gefundenen Grundrissen die Maße je Geschoss bilden (Länge = längere Seite) und das Hauptgeschoss wählen. */
export function planImportAus(dateiname: string, massstab: number, gefunden: GefundenerGrundriss[], texte: PlanText[] = [], flaechen: VektorFlaeche[] = []): PlanImport | null {
  if (!gefunden.length) return null
  const mpp = (0.0254 / 72) * massstab
  // Gemeinsamer Ursprung für alle Geschosse: relative Versätze bleiben erhalten.
  const alleX = gefunden.flatMap((g) => g.kontur.map((p) => p.x))
  const alleY = gefunden.flatMap((g) => g.kontur.map((p) => p.y))
  const mitteX = alleX.length ? (Math.min(...alleX) + Math.max(...alleX)) / 2 : 0
  const mitteY = alleY.length ? (Math.min(...alleY) + Math.max(...alleY)) / 2 : 0
  const geschosse: PlanImportGeschoss[] = gefunden.map((g) => {
    // Hauptkörper statt umschließendem Rechteck, wenn nur kleine Vorbauten abstehen
    const hk = hauptkoerperAusKontur(g.kontur, mpp)
    const laenge = hk ? hk.laengeM : Math.max(g.breiteM, g.tiefeM)
    const breite = hk ? hk.breiteM : Math.min(g.breiteM, g.tiefeM)
    const kx = g.kontur.map((p) => p.x), ky = g.kontur.map((p) => p.y)
    return {
      titel: g.titel,
      ebene: g.ebene,
      ...(g.kontur.length ? { bboxPt: [Math.min(...kx), Math.min(...ky), Math.max(...kx), Math.max(...ky)] as [number, number, number, number] } : {}),
      laengeM: runde(laenge),
      breiteM: runde(breite),
      flaecheM2: Math.round(g.flaecheM2 * 10) / 10,
      // Die vollständige Kontur bleibt zusätzlich zum vereinfachten Hauptkörper erhalten.
      // Alle Geschosse verwenden dieselbe Seiten-Koordinatenbasis (Meter, z nach unten im Plan).
      ...(g.kontur.length >= 3 ? {
        umriss: g.kontur.map((p) => ({ x: runde((p.x - mitteX) * mpp), z: runde((p.y - mitteY) * mpp) })),
      } : {}),
      ...(hk && hk.vorbauten.length ? { vorbauten: hk.vorbauten.map((v) => ({ laengeM: v.laengeM, tiefeM: v.tiefeM, flaecheM2: v.flaecheM2 })), vorbautenAnKante: vorbautenAnKanten(hk.vorbauten, hk.rechteck, mpp) } : {}),
      ...(flaechen.length ? (() => {
        const o = oeffnungenFinden(flaechen, g, texte, mpp)
        const lage = hk ? oeffnungenAnKanten(o, hk.rechteck, mpp) : null
        return {
          fenster: o.filter((x) => x.typ === 'fenster').length, tueren: o.filter((x) => x.typ === 'tuer').length,
          ...(o.length ? { oeffnungenPlan: o.map((q) => ({ typ: q.typ, x: runde((q.x - mitteX) * mpp), z: runde((q.y - mitteY) * mpp), breiteM: q.breiteM, ...(q.bruestungM !== undefined ? { bruestungM: q.bruestungM } : {}), ...(q.sturzM !== undefined ? { sturzM: q.sturzM } : {}) })) } : {}),
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
  // Die Geschosse liegen auf dem Blatt nebeneinander. Für die 3D-Fassade werden sie übereinandergelegt: Mitte des Rahmens jedes
  // Geschosses auf die Mitte des Hauptgeschosses (Annahme: gleiche Mitte; ohne weitere Angabe im Plan nicht genauer bestimmbar).
  const mitteVon = (u?: { x: number; z: number }[]) => u && u.length ? { x: (Math.min(...u.map((p) => p.x)) + Math.max(...u.map((p) => p.x))) / 2, z: (Math.min(...u.map((p) => p.z)) + Math.max(...u.map((p) => p.z))) / 2 } : null
  const mHaupt = mitteVon(haupt.umriss)
  const versatzJeEbene = new Map<number, { dx: number; dz: number }>()
  if (mHaupt) for (const g of geschosse) {
    const m = mitteVon(g.umriss)
    if (m) versatzJeEbene.set(g.ebene, { dx: runde(mHaupt.x - m.x), dz: runde(mHaupt.z - m.z) })
  }
  for (const g of geschosse) {
    const v = versatzJeEbene.get(g.ebene)
    if (!v || (v.dx === 0 && v.dz === 0)) continue
    if (g.umriss) g.umriss = g.umriss.map((p) => ({ x: runde(p.x + v.dx), z: runde(p.z + v.dz) }))
    if (g.oeffnungenPlan) g.oeffnungenPlan = g.oeffnungenPlan.map((q) => ({ ...q, x: runde(q.x + v.dx), z: runde(q.z + v.dz) }))
  }
  const gelaende = hauptG ? gelaendeAusPlan(hauptG, texte, (0.0254 / 72) * massstab) : null
  const hkHaupt = hauptG ? hauptkoerperAusKontur(hauptG.kontur, mpp) : null
  const jeKante = hkHaupt ? gelaendeJeKante(hkHaupt.rechteck, texte, mpp) : []
  const eckenPlan = hkHaupt ? gelaendeEckenAusPlan(hkHaupt.rechteck, texte, mpp) : {}
  const dach = dachAusPlan(gefunden, texte, (0.0254 / 72) * massstab)
  const koten = dachKotenAusPlan(texte)
  const neigung = dach?.dachform === 'Pultdach' && koten.firstM !== undefined && koten.traufeM !== undefined
    ? pultdachNeigung(koten.firstM, koten.traufeM, dachTiefeOhneVorbau(dach.tiefeM, haupt)) : null
  const ansichten = kotenJeAnsicht(texte)
  const pultRichtung = dach?.dachform === 'Pultdach' && koten.firstM !== undefined && koten.traufeM !== undefined
    ? pultNiedrigeRichtung(ansichten, koten.traufeM, koten.firstM) : null
  const gelTiefe = gelaendeTiefeJeAnsicht(ansichten)
  const masse = flaechen.length && texte.length ? lesMassketten(flaechen, texte, massstab) : null
  const terrassen = flaechen.length ? terrassenFinden(flaechen, texte, gefunden.filter((g) => g.ebene >= 0 && g.kontur.length).map((g) => ({
    ebene: g.ebene, bbox: [Math.min(...g.kontur.map((p) => p.x)), Math.min(...g.kontur.map((p) => p.y)), Math.max(...g.kontur.map((p) => p.x)), Math.max(...g.kontur.map((p) => p.y))] as [number, number, number, number],
  })), mpp, { x: mitteX, y: mitteY }).map((t) => { const v = versatzJeEbene.get(t.ebene); return v ? { ...t, x: runde(t.x + v.dx), z: runde(t.z + v.dz) } : t }) : []
  return {
    dateiname, massstab, geschosse, hauptEbene: haupt.ebene, geschossHoehenVorschlaege: geschossHoehenAusPlan(texte),
    ...(dach ? { dachform: dach.dachform } : {}),
    ...(koten.firstM !== undefined ? { firstKoteM: koten.firstM } : {}),
    ...(koten.traufeM !== undefined ? { traufKoteM: koten.traufeM } : {}),
    ...(neigung !== null ? { dachneigungGrad: neigung } : {}),
    ...(pultRichtung ? { pultNiedrigeRichtung: pultRichtung } : {}),
    ...(gelTiefe.length ? { gelaendeTiefe: gelTiefe } : {}),
    ...(gelaende ? { gelaende } : {}),
    ...(jeKante.length ? { gelaendeJeKante: jeKante } : {}),
    ...(Object.keys(eckenPlan).length ? { gelaendeEckenPlan: eckenPlan } : {}),
    ...(masse && masse.angaben.length ? { masse } : {}),
    ...(terrassen.length ? { terrassen } : {}),
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
  if (p.pultNiedrigeRichtung) {
    const r = { nord: 'Norden', ost: 'Osten', sued: 'Süden', west: 'Westen' }[p.pultNiedrigeRichtung]
    h.push(`Pultdach: Laut den Ansichten fällt das Dach nach ${r} (niedrige Traufe${p.traufKoteM !== undefined ? ` +${kom(p.traufKoteM)} m` : ''}). Im Tab Gebäude die Seite mit der niedrigen Traufe wählen, die nach ${r} zeigt – das Gerüst endet dort an der Traufe und steigt mit dem Dach.`)
  }
  if (p.gelaendeTiefe?.length) {
    const name: Record<string, string> = { nord: 'Nordseite', ost: 'Ostseite', sued: 'Südseite', west: 'Westseite' }
    const tal = p.gelaendeTiefe[0]
    h.push(`Hanglage mit freiliegendem Untergeschoss: Auf der ${name[tal.art] ?? tal.titel} reicht das Gebäude laut Ansicht bis ${kom(tal.tiefsteM)} m (Talseite). Dort ist das Gerüst rund ${kom((p.firstKoteM ?? p.traufKoteM ?? 0) - tal.tiefsteM)} m hoch – als Hang auf der Talseite eintragen (Grundriss zeigt nur das Gelände am Erdgeschoss).`)
  }
  if (p.gelaende && p.gelaende.unterschiedM >= 1) h.push(`Hanglage: Geländeunterschied ca. ${kom(p.gelaende.unterschiedM)} m – die Gerüsthöhe ist je Seite verschieden (Talseite höher).`)
  if (p.gelaendeJeKante && p.gelaende && p.gelaende.unterschiedM >= 1) {
    const name: Record<string, string> = { unten: 'unten im Plan', oben: 'oben im Plan', links: 'links im Plan', rechts: 'rechts im Plan' }
    h.push(`Geländekoten je Seite (±0,00 = Fußboden ${haupt.titel}): ` + p.gelaendeJeKante.map((k) => `${name[k.kante]} ${k.minM === k.maxM ? kom(k.minM) : `${kom(k.minM)} bis ${kom(k.maxM)}`} m`).join(', ') + ' – bitte prüfen.')
  }
  return h
}

/** Browser: Plan-PDF lesen: Seite für Seite, bis Grundrisse gefunden werden (keine Seitengrenze). null bei Bildern, Scans und Plänen ohne Geschoss-Überschrift. */
export async function planLesen(datei: File): Promise<PlanImport | null> {
  if (!/\.pdf$/i.test(datei.name) && datei.type !== 'application/pdf') return null
  const [{ ladePlanQuelle }, { grundrisseFinden }, { massstabAusTexten, meterJePunkt }] = await Promise.all([
    import('./plan-rendern'), import('./grundriss-finden'), import('./plan-vorlage'),
  ])
  const q = await ladePlanQuelle(datei)
  try {
    for (let nr = 1; nr <= q.seiten; nr++) {
      const texte = await q.texte(nr, 0)
      const ms = massstabAusTexten(texte.map((t) => t.s))
      if (!ms) continue
      const fl = await q.vektoren(nr, 0)
      if (!fl.length) continue
      const r = planImportAus(datei.name, ms, grundrisseFinden(fl, texte, meterJePunkt(ms)), texte, fl)
      if (r) {
        try {
          const { gelaendeLinienAusAnsichten } = await import('./gelaende-aus-ansichten')
          const linien = await gelaendeLinienAusAnsichten(q, nr, texte, fl, ms, (() => { const hg = r.geschosse.find((g) => g.ebene === r.hauptEbene) ?? r.geschosse[0]; return [hg.laengeM, hg.breiteM] })())
          if (linien.length) r.gelaendeLinien = linien
        } catch { /* Geländelinie ist ein Vorschlag: ohne sie bleibt der Import wie bisher */ }
        return r
      }
    }
    return null
  } finally {
    q.freigeben()
  }
}
