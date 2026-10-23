// ============================================================
// SCAFFOLD OS – Lastansatz nach DIN EN 12811-1 (Verkehrslasten auf Gerüstlagen)
//
// Quellen: DIN EN 12811-1, Tabelle 3 „Verkehrslasten auf Gerüstlagen“ (von Hand übertragen), Abschnitt 6.2.9.2
// Fassadengerüste (Lage 1 zu 100 %, unmittelbar darüber oder darunter 50 % der Last) und DGUV Information 201-011.
// Bei längenorientiertem Gerüst: eine Lage zu 100 % (z. B. LK 4: 300 kg/m²), eine zweite Lage zu 50 % belastet.
// Das ist ein Ansatz zur Dokumentation und Prüfung, KEIN Standsicherheitsnachweis.
// ============================================================

export interface Verkehrslast {
  klasse: number
  /** gleichmäßig verteilte Last in kN/m² */
  q1: number
  /** konzentrierte Last auf 500 mm × 500 mm in kN */
  f1: number
  /** konzentrierte Last auf 200 mm × 200 mm in kN */
  f2: number
  /** Teilflächenlast in kN/m² (erst ab LK 4) */
  q2: number | null
  /** Teilflächenfaktor a_p (erst ab LK 4) */
  ap: number | null
}

/** DIN EN 12811-1, Tabelle 3. */
export const VERKEHRSLASTEN: Verkehrslast[] = [
  { klasse: 1, q1: 0.75, f1: 1.5, f2: 1.0, q2: null, ap: null },
  { klasse: 2, q1: 1.5, f1: 1.5, f2: 1.0, q2: null, ap: null },
  { klasse: 3, q1: 2.0, f1: 1.5, f2: 1.0, q2: null, ap: null },
  { klasse: 4, q1: 3.0, f1: 3.0, f2: 1.0, q2: 5.0, ap: 0.4 },
  { klasse: 5, q1: 4.5, f1: 3.0, f2: 1.0, q2: 7.5, ap: 0.4 },
  { klasse: 6, q1: 6.0, f1: 3.0, f2: 1.0, q2: 10.0, ap: 0.5 },
]

export function verkehrslast(klasse: number | undefined): Verkehrslast | null {
  return VERKEHRSLASTEN.find((v) => v.klasse === klasse) ?? null
}

/** Anteil der Last auf der zweiten belasteten Lage (DIN EN 12811-1, 6.2.9.2: 50 %). */
export const ZWEITE_LAGE_ANTEIL = 0.5
/** Zuschlag bei Kraneinsatz für abzusetzende Lasten (20 %, Faktor 1,2). */
export const KRAN_FAKTOR = 1.2
/** Jedes Belagteil muss mindestens 1,5 kN aufnehmen (DIN EN 12811-1). */
export const BELAGTEIL_MIN_KN = 1.5
/** Treppen und Zugänge höchstens 1,0 kN/m² (DIN EN 12811-1). */
export const TREPPE_MAX_KN_M2 = 1.0
/** Schutzgerüste mindestens Lastklasse 2 (DIN EN 12811-1). */
export const SCHUTZGERUEST_MIN_LK = 2

export interface Lagenansatz {
  klasse: number
  /** Lage 1: 100 % von q1 */
  lage1KnM2: number
  /** Lage 2: 50 % von q1 */
  lage2KnM2: number
  /** beide Lagen zusammen (= 1,5 × q1, „Belastung immer auf 1,5 Lagen“) */
  summeKnM2: number
  /** zugehörige Last in kg/m² (1 kN = 100 kg) */
  lage1KgM2: number
  q2KnM2: number | null
  ap: number | null
}

/** Längenorientiertes Gerüst: eine Lage zu 100 %, die zweite zu 50 %. */
export function lagenansatz(klasse: number | undefined): Lagenansatz | null {
  const v = verkehrslast(klasse)
  if (!v) return null
  const lage2 = v.q1 * ZWEITE_LAGE_ANTEIL
  return { klasse: v.klasse, lage1KnM2: v.q1, lage2KnM2: lage2, summeKnM2: v.q1 + lage2, lage1KgM2: v.q1 * 100, q2KnM2: v.q2, ap: v.ap }
}

const de = (n: number): string => n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

/** Text für LV-Annahmen und Lastannahmen-Blatt. */
export function lagenansatzText(klasse: number | undefined): string | null {
  const a = lagenansatz(klasse)
  if (!a) return null
  const teil = a.q2KnM2 !== null ? ` Ab Lastklasse 4 zusätzlich Teilflächenlast q2 = ${de(a.q2KnM2)} kN/m² (Teilflächenfaktor ${de(a.ap ?? 0)}).` : ''
  return `Lastansatz Lastklasse ${a.klasse} (DIN EN 12811-1, Tabelle 3 und 6.2.9.2): eine Lage zu 100 % mit q1 = ${de(a.lage1KnM2)} kN/m² (${de(a.lage1KgM2)} kg/m²), die zweite Lage zu 50 % mit ${de(a.lage2KnM2)} kN/m² (Belastung auf 1,5 Lagen = ${de(a.summeKnM2)} kN/m²).${teil} Der Standsicherheitsnachweis erfolgt in der Statik.`
}
