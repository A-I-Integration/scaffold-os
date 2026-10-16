import type { ScaffoldBalkon } from '../types/scaffold'

// ============================================================
// SCAFFOLD OS – Balkone im Aufmaß
//
// Reine Rechenfunktionen (ohne UI), damit Material (scaffold-engine)
// und Aufmaßblatt dieselbe Grundlage verwenden.
//
// ANNAHMEN (bitte mit der Praxis abgleichen):
//  1. Ein Balkon-Eintrag ist ein Stapel über die GANZE Abschnittshöhe.
//  2. 'ausgespart': Vor dem Balkon steht kein Gerüstfeld → die Balkonbreite
//     wird von der Gerüstlänge abgezogen (Felder = aufgerundet über die
//     verbleibende Länge, d. h. Teilstücke werden nicht einzeln aufgerundet).
//  3. 'durchlaufend': Das Gerüst läuft vor dem Balkon durch. Konsolen
//     (0,73 m, Art. KO-001) überbrücken die Auskragung:
//     (Felder vor dem Balkon + 1) Stellen × aufgerundet(Auskragung / 0,73)
//     je Lage. Das ist eine NÄHERUNG – maßgeblich ist die Aufbau- und
//     Verwendungsanleitung des gewählten Systems.
//  4. Welche Flächen vertraglich abgezogen werden, regelt der Vertrag (ATV
//     DIN 18451 / Vereinbarung). Deshalb ist der Abzug je Balkon einstellbar;
//     'ausgespart' wird immer abgezogen (dort steht kein Gerüst).
// ============================================================

export const KONSOLE_BREITE_M = 0.73

/**
 * Konsolen je Lage für einen durchlaufenden Balkon (Näherung, siehe Annahme 3):
 * (Felder + 1) Stellen × aufgerundet(Auskragung / 0,73 m).
 * Wird von der Aufmaß-Engine UND vom CAD genutzt, damit beide gleich rechnen.
 */
export function konsolenJeLage(felderVorBalkon: number, auskragungM: number): number {
  if (!(auskragungM > 0) || felderVorBalkon < 1) return 0
  return (felderVorBalkon + 1) * Math.ceil(auskragungM / KONSOLE_BREITE_M - 1e-9)
}

function zahl(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function runde2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Liest die Balkone aus Schritt 2 (Texteingaben) für einen Abschnitt.
 * abschnittIndex: 0 = Abschnitt 1 (Hauptfassade), 1.. = weitere Abschnitte
 * in der Reihenfolge von step2.abschnitte. Ungültige Einträge werden ignoriert.
 */
export function balkoneFuerAbschnitt(rohe: unknown, abschnittIndex: number): ScaffoldBalkon[] {
  if (!Array.isArray(rohe)) return []
  const out: ScaffoldBalkon[] = []
  for (const b of rohe as Record<string, unknown>[]) {
    if (!b || Math.round(zahl(b.abschnitt)) !== abschnittIndex) continue
    const breiteM = zahl(b.breite)
    if (breiteM <= 0) continue
    out.push({
      bezeichnung: String(b.bezeichnung || '').trim() || undefined,
      breiteM,
      anzahl: Math.max(1, Math.round(zahl(b.anzahl)) || 1),
      auskragungM: Math.max(0, zahl(b.auskragung)),
      modus: b.modus === 'ausgespart' ? 'ausgespart' : 'durchlaufend',
      abzug: b.abzug === true,
    })
  }
  return out
}

export interface BalkonWirkung {
  /** Summe der ausgesparten Breiten (auf die Abschnittslänge begrenzt) */
  ausgespartM: number
  /** Länge, für die tatsächlich Gerüst steht */
  laengeGeruestM: number
  /** Konsolen je Lage für durchlaufende Balkone (Näherung, siehe oben) */
  konsolenProLage: number
  anzahlAusgespart: number
  anzahlDurchlaufend: number
}

export function balkonWirkung(laengeM: number, feldlaengeM: number, balkone: ScaffoldBalkon[] | undefined): BalkonWirkung {
  let ausgespart = 0
  let konsolen = 0
  let nAus = 0
  let nDurch = 0
  const fl = feldlaengeM > 0 ? feldlaengeM : 2.07
  for (const b of balkone ?? []) {
    if (!(b.breiteM > 0)) continue
    const n = Math.max(1, b.anzahl || 1)
    if (b.modus === 'ausgespart') {
      ausgespart += b.breiteM * n
      nAus += n
    } else {
      nDurch += n
      if (b.auskragungM > 0) {
        const felder = Math.ceil(b.breiteM / fl - 1e-9)
        konsolen += n * konsolenJeLage(felder, b.auskragungM)
      }
    }
  }
  const ausgespartM = Math.min(Math.max(0, laengeM), runde2(ausgespart))
  return {
    ausgespartM,
    laengeGeruestM: runde2(Math.max(0, laengeM - ausgespartM)),
    konsolenProLage: konsolen,
    anzahlAusgespart: nAus,
    anzahlDurchlaufend: nDurch,
  }
}

export interface BalkonAbzug {
  flaecheM2: number
  text: string
}

/**
 * Abzugsfläche für das Aufmaßblatt: ausgesparte Balkone immer, durchlaufende
 * nur mit abzug = true. Fläche = Breite × Abschnittshöhe (Stapel-Annahme).
 */
export function balkonAbzug(balkone: ScaffoldBalkon[] | undefined, laengeM: number, hoeheM: number): BalkonAbzug | null {
  let breite = 0
  let stueck = 0
  for (const b of balkone ?? []) {
    if (!(b.breiteM > 0)) continue
    if (b.modus === 'ausgespart' || b.abzug) {
      const n = Math.max(1, b.anzahl || 1)
      breite += b.breiteM * n
      stueck += n
    }
  }
  if (breite <= 0 || hoeheM <= 0) return null
  breite = Math.min(breite, Math.max(0, laengeM))
  const flaecheM2 = runde2(breite * hoeheM)
  if (flaecheM2 <= 0) return null
  const b2 = runde2(breite).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return { flaecheM2, text: `abzgl. Balkone (${stueck} Stk., zusammen ${b2} m breit)` }
}

// ------------------------------------------------------------
// CAD: einzelne Balkone mit Position
// ------------------------------------------------------------

/**
 * Ein Balkon im CAD mit fester Position an einer Fassadenseite.
 * Weicht bewusst vom Aufmaß-Eintrag (ohne Position) ab.
 *  - offsetAlongM: Mitte des Balkons, gemessen von der Fassadenmitte
 *  - alleLagen: true = wie im Aufmaß als Stapel über die ganze Höhe
 *    (Balkon an jedem Obergeschoss, Konsolen in allen Lagen);
 *    false = nur das Geschoss floorIndex
 *  - ausgespart: ganze Feldspalte entfällt (alle Lagen), wie im Aufmaß
 */
export interface CadBalkon {
  id: string
  side: 'front' | 'back' | 'left' | 'right'
  offsetAlongM: number
  widthM: number
  depthM: number
  floorIndex: number
  alleLagen: boolean
  modus: 'durchlaufend' | 'ausgespart'
}

/**
 * Übernimmt die Balkone der Hauptfassade (Abschnitt 1) aus Schritt 2 des Aufmaßes
 * ins CAD. Das Aufmaß kennt keine Positionen: Die Balkone werden gleichmäßig an der
 * Vorderseite verteilt (bitte im CAD nachjustieren). Balkone weiterer Abschnitte
 * werden NICHT übernommen (das CAD hat dafür keine Zuordnung) – die Anzahl wird gemeldet.
 */
export function balkoneAusAufmassFuersCad(
  rohe: unknown,
  fassadenLaengeM: number,
  geschosse: number,
): { balkone: CadBalkon[]; uebersprungen: number } {
  const haupt = balkoneFuerAbschnitt(rohe, 0)
  let uebersprungen = 0
  if (Array.isArray(rohe)) {
    for (const b of rohe as Record<string, unknown>[]) {
      if (b && Math.round(zahl(b.abschnitt)) !== 0 && zahl(b.breite) > 0) uebersprungen += Math.max(1, Math.round(zahl(b.anzahl)) || 1)
    }
  }
  const einzeln: ScaffoldBalkon[] = []
  for (const b of haupt) for (let i = 0; i < b.anzahl; i++) einzeln.push(b)
  const n = einzeln.length
  const balkone: CadBalkon[] = einzeln.map((b, i) => ({
    id: `aufmass-${i + 1}`,
    side: 'front',
    offsetAlongM: runde2(-fassadenLaengeM / 2 + (fassadenLaengeM * (i + 1)) / (n + 1)),
    widthM: b.breiteM,
    depthM: b.auskragungM,
    floorIndex: geschosse > 1 ? 1 : 0,
    alleLagen: true,
    modus: b.modus,
  }))
  return { balkone, uebersprungen }
}
