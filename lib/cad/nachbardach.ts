// ============================================================
// SCAFFOLD OS – Dach eines angrenzenden Gebäudeteils (Rückfall für Überbrückung und Dachschutz)
//
// Wird im Modell kein Anbaudach gemessen (siehe portal-erkennung), gilt als Näherung:
//   Länge der Überbrückung = Länge der Turmwand, an der ein nicht eingerüsteter Nachbarteil anschließt
//   Schutzfläche           = Wandlänge × 1,5 m ÷ cos(Dachneigung)
// Die Dachneigung folgt aus Dachform und Dachhöhe des Nachbarteils (Satteldach, Walm-, Pult- und Mansarddach: Dachhöhe über der halben Tiefe;
// Flachdach und „kein Dach“: 0°). Das ist eine Planungsnäherung, KEINE Messung: Der Wert steht mit der Formel im LV-Text und ist von Hand änderbar.
// ============================================================
import type { BuildingParams } from '@/lib/calculations/cad-engine'

/** Breite des geschützten Streifens auf dem Nachbardach (m): Gerüstbreite plus Reserve, Vorgabe aus dem Auftraggeber-LV („1,50 m Breite“). */
export const NACHBARDACH_BREITE_M = 1.5

export interface NachbarDach {
  /** Länge der Wand, an der das Nachbardach anschließt (m), je Nachbarteil summiert */
  laengeM: number
  /** Schutzfläche (m²) = Länge × Breite ÷ cos(Neigung) */
  flaecheM2: number
  /** Anzahl angrenzender Dachflächen (Nachbarteile) */
  anzahl: number
  /** größte Dachneigung der Nachbarteile in Grad (0 = flach) */
  neigungGrad: number
}

const r2 = (x: number): number => Math.round(x * 100) / 100

/** Nachbarteile ohne Gerüst, die an einen eingerüsteten Teil anschließen (Abschnitte liegen hintereinander). */
export function nachbarDach(b: BuildingParams): NachbarDach | null {
  const s = b.sections
  if (!s || s.length < 2) return null
  let laenge = 0, flaeche = 0, anzahl = 0, maxNeig = 0
  s.forEach((n, i) => {
    if (n.geruest !== false) return
    const nachbarn = [s[i - 1], s[i + 1]].filter((x) => x && x.geruest !== false)
    for (const t of nachbarn) {
      const wand = Math.min(t.tiefeM ?? b.widthM ?? 0, n.tiefeM ?? b.widthM ?? 0)
      if (!(wand > 0)) continue
      const tiefe = n.tiefeM ?? b.widthM ?? 0
      const geneigt = n.roofForm !== undefined && n.roofForm !== 'flachdach' && n.roofForm !== 'kein' && (n.roofHoeheM ?? 0) > 0 && tiefe > 0
      const neig = geneigt ? Math.atan((n.roofHoeheM as number) / (tiefe / 2)) : 0
      laenge += wand
      flaeche += (wand * NACHBARDACH_BREITE_M) / Math.cos(neig)
      anzahl++
      maxNeig = Math.max(maxNeig, (neig * 180) / Math.PI)
    }
  })
  if (anzahl === 0) return null
  return { laengeM: r2(laenge), flaecheM2: r2(flaeche), anzahl, neigungGrad: Math.round(maxNeig * 10) / 10 }
}

/** Text mit Formel für das LV. */
export function nachbarDachHinweis(d: NachbarDach): string {
  const de = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 })
  return `Näherung (nicht gemessen): volle Wandlänge ${de(d.laengeM)} m über ${d.anzahl} angrenzende${d.anzahl > 1 ? '' : 's'} Dach, Streifen ${de(NACHBARDACH_BREITE_M)} m breit: Fläche = Länge × ${de(NACHBARDACH_BREITE_M)} m ÷ cos(Dachneigung ${de(d.neigungGrad)}°) = ${de(d.flaecheM2)} m². Bitte prüfen.`
}
