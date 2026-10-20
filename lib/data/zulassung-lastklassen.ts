// ============================================================
// SCAFFOLD OS – Lastklassen der Beläge laut allgemeiner bauaufsichtlicher Zulassung
//
// Quelle: Tabelle "Zuordnung der Beläge zu den Lastklassen" in den Zulassungen/
// Bauartgenehmigungen des DIBt, die der Anwender als PDF übergeben hat. Die Werte
// wurden VON HAND aus den Tabellenseiten übertragen (Seite als Bild gelesen, nicht
// automatisch geparst) und sind Angaben der Zulassung, KEIN Nachweis von SCAFFOLD OS.
//
// Lesart: Je Belag steht eine Stufenliste "Feldweite ≤ bisM → höchstens Lastklasse lk"
// (wie in der Zulassung: "≤ 2,07 → ≤ 6", "2,57 → ≤ 5" …). Für eine Feldweite gilt die
// erste Stufe, deren bisM nicht unterschritten wird. Liegt die Feldweite über der
// letzten Stufe, ist der Belag in der Tabelle NICHT abgedeckt (null).
//
// Maßgeblich ist immer der aktuelle Bescheid. Wo mehrere Bescheide einer Zulassung
// verschieden angeben, steht der strengere Wert hier und der Unterschied im Hinweis.
// Nicht enthalten: Einschränkungen im Text der Zulassung außerhalb der Tabelle
// (z. B. Verwendung im Fang-/Dachfanggerüst, Breite des Belags, Belagsicherung).
// ============================================================

import type { MjListe } from '@/lib/mj-katalog'

export interface LkStufe { bisM: number; lk: number }
export interface BelagLastklasse {
  /** Bezeichnung wie in der Zulassung */
  belag: string
  /** "Anlage B, Seite" bzw. "Anlage A, Seite" wie in der Tabelle */
  anlage: string
  stufen: LkStufe[]
  /** Nur wenn die Zulassung den Belag erst ab einer Feldweite nennt (z. B. "2,57 und 3,07"): kleinere Feldweiten sind nicht abgedeckt */
  abM?: number
  hinweis?: string
}
export interface LastklassenTabelle {
  liste: MjListe
  zulassung: string
  /** Tabelle in der Zulassung */
  tabelle: string
  /** Stand des Bescheids, aus dem gelesen wurde */
  stand: string
  belaege: BelagLastklasse[]
  hinweis?: string
}

const s = (...paare: [number, number][]): LkStufe[] => paare.map(([bisM, lk]) => ({ bisM, lk }))

export const LASTKLASSEN_TABELLEN: Partial<Record<MjListe, LastklassenTabelle>> = {
  optima: {
    liste: 'optima', zulassung: 'Z-8.22-986', tabelle: 'Tabelle 8', stand: 'Bescheid 06.07.2026 (mit Änderungen 2022 und 2026)',
    hinweis: 'Gelesen aus Tabelle 8 der Zulassung vom 17.03.2021 sowie den Änderungen vom 13.06.2022 und 06.07.2026. Die Seiten mit "-a"/"-b" in der Spalte Anlage B sind die geänderten Seiten.',
    belaege: [
      { belag: 'Stahlboden U-Auflage, Breite 0,32 m', anlage: '40, 40-a, 40-b', stufen: s([2.07, 6], [2.57, 5], [3.07, 4], [4.14, 3]) },
      { belag: 'Stahlboden U-Auflage, Breite 0,19 m / Stahlboden Rohrauflage, Breite 0,19 m', anlage: '41, 42, 46, 47', stufen: s([2.07, 6], [2.57, 5], [3.07, 4]) },
      { belag: 'Rahmentafel, U-Auflage Sperrholzbelag', anlage: '43', stufen: s([3.07, 3]) },
      { belag: 'Aluminiumboden mit Stahlkappe, vernietet', anlage: '44', stufen: s([2.07, 6], [2.57, 5], [3.07, 4]) },
      { belag: 'Stahlboden Rohrauflage, Breite 0,32 m', anlage: '45, 45-a', stufen: s([2.07, 6], [2.57, 5], [3.07, 4]) },
      { belag: 'Aluminiumboden mit Stahlkappe, Breite 0,48 m', anlage: '69', stufen: s([2.07, 6], [2.57, 5], [3.07, 3]) },
      { belag: 'Aluminiumboden mit Stahlkappe, Breite 0,19 m', anlage: '70', stufen: s([2.07, 6], [3.07, 5]) },
      { belag: 'Aluminiumboden mit Stahlkappe, Breite 0,32 m', anlage: '78', stufen: s([2.07, 6], [2.57, 5], [3.07, 3]) },
      { belag: 'Durchstiegstafel - U-Auflage mit Alu-Belag', anlage: '48, 49', stufen: s([2.57, 4], [3.07, 3]) },
      { belag: 'Durchstiegstafel - U-Auflage mit Holzbelag', anlage: '48', stufen: s([3.07, 3]) },
      { belag: 'Durchstiegstafel - Rohrauflage Holzbelag', anlage: '50, 50-a', stufen: s([3.07, 3]) },
      {
        belag: 'Durchstiegstafel - Rohrauflage mit Alu-Belag', anlage: '50, 51, 50-a, 51-a', stufen: s([3.07, 3]),
        hinweis: 'Zulassung 2021: ≤ 3,07 → ≤ 3. Änderung 13.06.2022 nennt für die Aluminiumklappe zusätzlich ≤ 2,57 → ≤ 4. Hier der strengere Wert.',
      },
    ],
  },
  'optima-top': {
    liste: 'optima-top', zulassung: 'Z-8.22-987', tabelle: 'Tabelle 9', stand: 'Bescheid 20.03.2024',
    belaege: [
      { belag: 'Belagbohle, Ausführung Holz', anlage: '09.01.00', stufen: s([1.5, 6], [2.0, 5], [2.5, 4], [3.0, 3]) },
      { belag: 'Stahlboden punktgeschweißt / Stahlboden maschinengeschweißt, Breite 0,15 m / Belagbohle, Ausführung Aluminium / Aluminiumboden mit Stahlkappen / Stahlboden punktgeschweißt Typ 6', anlage: '09.02.00, 09.03.00, 09.04.00, 09.05.00, 09.07.00', stufen: s([2.0, 6], [2.5, 5], [3.0, 4]) },
      { belag: 'Durchstiegstafel Aluminiumbelag', anlage: '09.06.00', stufen: s([2.5, 4], [3.0, 3]) },
    ],
  },
  'optima-metric': {
    liste: 'optima-metric', zulassung: 'Z-8.22-985', tabelle: 'Tabelle 8', stand: 'Bescheid 04.12.2025',
    belaege: [
      { belag: 'Holzboden (Vollholz-Belagtafel)', anlage: '09.01.00', stufen: s([2.0, 5], [2.5, 4], [3.0, 3]) },
      { belag: 'Aluminiumboden Breite 0,32 m / Aluminiumboden mit Stahlkappe Breite 0,64 m - Rohrauflage', anlage: '09.02.00, 09.07.00', stufen: s([2.0, 6], [2.5, 5], [3.0, 4]) },
      { belag: 'Stahlboden - Zapfenauflage / Rohrauflage / Maschinengeschweißt 0,15 m', anlage: '09.03.00, 09.04.00, 09.05.00', stufen: s([2.0, 6], [2.5, 5], [3.0, 4]) },
      { belag: 'Durchstiegstafel, Zapfenauflage, Sperrholz', anlage: '09.08.00', stufen: s([3.0, 3]) },
      { belag: 'Durchstiegstafel, Zapfenauflage, Aluminium / Rohrauflage, Aluminium', anlage: '09.09.00, 09.10.00', stufen: s([2.5, 4], [3.0, 3]) },
    ],
  },
  combi: {
    liste: 'combi', zulassung: 'Z-8.22-921', tabelle: 'Tabelle 15', stand: 'Bescheid 06.07.2026',
    belaege: [
      { belag: 'Stahlboden Rohrauflage, Breite 0,32 m', anlage: '08.01.00', stufen: s([2.07, 6], [2.57, 5], [3.07, 4]) },
      { belag: 'Stahlboden U-Auflage, Breite 0,32 m', anlage: '08.04.00', stufen: s([2.07, 6], [2.57, 5], [3.07, 4], [4.14, 3]) },
      { belag: 'Stahlboden Rohrauflage, Breite 0,19 m / Stahlboden U-Auflage, Breite 0,19 m', anlage: '08.02.00, 08.03.00, 08.05.00, 08.06.00', stufen: s([2.07, 6], [3.07, 4]) },
      { belag: 'Rahmentafel, U-Auflage Aluminiumbelag / Holzbelag', anlage: '09.01.00, 09.02.00', stufen: s([3.07, 3]) },
      { belag: 'Aluminiumboden mit Stahlkappe, Breite 0,61 m / 0,32 m', anlage: '10.01.00, 10.03.00', stufen: s([2.07, 6], [2.57, 5], [3.07, 4]) },
      { belag: 'Aluminiumboden mit Stahlkappe, Breite 0,48 m', anlage: '10.02.00', stufen: s([2.07, 6], [2.57, 5], [3.07, 3]) },
      { belag: 'Aluminiumboden mit Stahlkappe, Breite 0,19 m', anlage: '10.04.00', stufen: s([2.07, 6], [3.07, 5]) },
      { belag: 'Durchstiegstafel - Rohrauflage, Aluminiumbelag - Aluminiumklappe', anlage: '11.01.00, 11.03.00', stufen: s([2.57, 4], [3.07, 3]) },
      { belag: 'Durchstiegstafel - Rohrauflage Holzbelag / U-Auflage mit Holzbelag', anlage: '11.02.00, 11.05.00', stufen: s([3.07, 3]) },
      { belag: 'Durchstiegstafel - U-Auflage mit Alu-Belag', anlage: '11.04.00, 11.06.00', stufen: s([2.57, 4], [3.07, 3]) },
    ],
  },
  'uni-top': {
    liste: 'uni-top', zulassung: 'Z-8.1-902', tabelle: 'Tabelle 8', stand: 'Bescheid 11.08.2026',
    hinweis: 'Feldweiten bis 4,0 m; Anlage A. Die Spalte "Verwendung im Fang- und Dachfanggerüst" der Zulassung ist nicht übernommen.',
    belaege: [
      { belag: 'Belagbohle, Ausführung Holz', anlage: '06.01.00', stufen: s([1.5, 6], [2.0, 5], [2.5, 4], [3.0, 3]) },
      { belag: 'Durchstiegstafel Alu-Belag', anlage: '06.02.00', stufen: s([3.0, 3]) },
      { belag: 'Aluminiumboden mit Stahlkappen / Belagbohle, Ausführung Aluminium', anlage: '06.03.00, 06.04.00', stufen: s([2.0, 6], [2.5, 5], [3.0, 4]) },
      { belag: 'Stahlboden punktgeschweißt / Stahlboden 0,15 m', anlage: '06.05.00, 06.06.00, 06.07.00', stufen: s([2.0, 6], [2.5, 5], [3.0, 4]) },
      { belag: 'Belagbohle aus Holz / Holz MS 10', anlage: '50.10.00, 50.84.00', stufen: s([2.0, 5], [2.5, 4], [3.0, 3]) },
      { belag: 'Profilbohle aus Holz / Aluminium-Belagtafel mit Abschlusskappe', anlage: '50.12.00, 50.15.00', stufen: s([2.5, 5], [3.0, 4]) },
      { belag: 'Aluminiumbelag', anlage: '50.14.00', stufen: s([2.5, 6], [3.0, 5]) },
      { belag: 'Belagbohle aus Stahl', anlage: '50.16.00', stufen: s([2.0, 6], [2.5, 5], [3.0, 4]) },
      { belag: 'Alu-Leitergangsrahmen mit Alu-Profilbelag', anlage: '50.31.00', stufen: s([2.5, 4], [3.0, 3]) },
      { belag: 'Alu-Leitergangsrahmen mit Sperrholzbelag', anlage: '50.34.00', stufen: s([3.0, 3]) },
      { belag: 'Belagbohle aus Aluminium mit Abschlusskappe und Bohlenverbinder', anlage: '50.62.00', stufen: s([2.5, 6], [3.0, 5], [4.0, 3]) },
      { belag: 'Alu-Leitergangsrahmen mit integrierter Leiter und Bau-Furnierholz BFU 100 G', anlage: '50.69.00', stufen: s([2.5, 3], [3.0, 3]) },
      { belag: 'Alu-Leitergangsrahmen mit integrierter Leiter, Aluminium', anlage: '50.70.00', stufen: s([2.5, 4], [3.0, 3]) },
      { belag: 'Belagbohle aus Massivholz, d = 45 mm', anlage: '50.73.00', stufen: s([2.0, 4], [2.5, 3]) },
      { belag: 'Belagbohle aus Massivholz, d = 48 mm', anlage: '50.74.00', stufen: s([2.0, 5], [2.5, 4], [3.0, 3]), hinweis: 'Bei 3,0 m laut Zulassung nicht im Fang-/Dachfanggerüst zulässig.' },
      { belag: 'Alu-Belagbohle d = 45 mm', anlage: '50.75.00', stufen: s([2.0, 6], [2.5, 4], [3.0, 3]) },
    ],
  },
  'sx-ringscaff': {
    liste: 'sx-ringscaff', zulassung: 'Z-8.22-869 / Z-8.22-901', tabelle: 'Tabelle 9 (Z-8.22-869) bzw. Tabelle 8 (Z-8.22-901)',
    stand: 'Bescheide 09.04.2021 (Z-8.22-869) und 12.01.2021 (Z-8.22-901)',
    hinweis: 'Gelesen aus den Bescheiden von 2021 (Grundbescheide). Die Verlängerungsbescheide von 2026 lagen nicht vor und sind nicht ausgewertet. Maßgeblich ist der aktuelle Bescheid. RINGSCAFF-VD (Z-8.22-971) ist nicht erfasst.',
    belaege: [
      { belag: 'RINGSCAFF: O-Stahlboden 0,32 m (auch Clinch, TS, P51)', anlage: 'Anlage B, 28, 35, 37, 40', stufen: s([2.07, 6], [2.57, 5], [3.07, 4]) },
      { belag: 'RINGSCAFF: U-Stahlboden 0,32 m (auch Clinch, TS)', anlage: 'Anlage B, 34, 36, 38', stufen: s([2.07, 6], [2.57, 5], [3.07, 4]) },
      { belag: 'RINGSCAFF: O-Stahlboden 0,19 m / U-Stahlboden 0,19 m', anlage: 'Anlage B, 29, 39', stufen: s([2.07, 6], [2.57, 5], [3.07, 4]) },
      { belag: 'RINGSCAFF: O-Durchstieg mit Leiter', anlage: 'Anlage B, 30', stufen: s([3.07, 3]) },
      { belag: 'RINGSCAFF: U-Durchstieg mit Leiter', anlage: 'Anlage B, 41', stufen: s([3.07, 3]) },
      { belag: 'RINGSCAFF-V: O-Stahlboden 0,32 m (auch Clinch, TS)', anlage: 'Anlage B, 27, 33, 35', stufen: s([2.07, 6], [2.57, 5], [3.07, 4]) },
      { belag: 'RINGSCAFF-V: U-Stahlboden 0,32 m (auch Clinch, TS) / U-Stahlboden 0,19 m', anlage: 'Anlage B, 32, 88, 89, 90, 91, 34, 36, 37', stufen: s([2.07, 6], [2.57, 5], [3.07, 4]) },
      { belag: 'RINGSCAFF-V: O-Durchstieg mit Leiter', anlage: 'Anlage B, 28', stufen: s([3.07, 3]), abM: 2.57, hinweis: 'Die Zulassung nennt nur die Feldweiten 2,57 m und 3,07 m.' },
      { belag: 'RINGSCAFF-V: U-Durchstieg mit Leiter', anlage: 'Anlage B, 38', stufen: s([3.07, 3]), abM: 2.57, hinweis: 'Die Zulassung nennt nur die Feldweiten 2,57 m und 3,07 m.' },
      { belag: 'RINGSCAFF-V: U-Robust-Durchstieg 0,61 m', anlage: 'Anlage B, 92', stufen: s([3.07, 3]) },
      { belag: 'RINGSCAFF-V: U-Robustböden 0,61 m', anlage: 'Anlage B, 97, 98', stufen: s([3.07, 3]) },
      { belag: 'RINGSCAFF-V: U-Robustboden 0,32 m', anlage: 'Anlage B, 99', stufen: s([1.57, 6], [2.07, 5], [2.57, 4], [3.07, 3]) },
      { belag: 'RINGSCAFF-V: U-Stahl-Durchstiegsboden 0,64 m', anlage: 'Anlage B, 100', stufen: s([2.57, 4]), abM: 2.57, hinweis: 'Die Zulassung nennt nur die Feldweite 2,57 m.' },
    ],
  },
}

const TOL = 0.005

/** Höchste Lastklasse eines Belags für eine Feldweite (m); null = Feldweite über der Tabelle (nicht abgedeckt) */
export function maxLastklasse(b: BelagLastklasse, feldweiteM: number): number | null {
  if (b.abM !== undefined && feldweiteM < b.abM - TOL) return null
  const st = [...b.stufen].sort((x, y) => x.bisM - y.bisM).find((x) => feldweiteM <= x.bisM + TOL)
  return st ? st.lk : null
}

export type LkErgebnis = 'ok' | 'zu-hoch' | 'nicht-abgedeckt'

export interface LkZeile {
  belag: string
  anlage: string
  /** je Feldweite: höchstens zulässige Lastklasse (null = nicht abgedeckt) */
  proFeldweite: { feldweiteM: number; maxLk: number | null }[]
  /** Gegen die geplante Lastklasse gehalten (nur wenn eine angegeben ist) */
  ergebnis: LkErgebnis | null
  hinweis?: string
}

export interface LkPruefung {
  tabelle: LastklassenTabelle
  feldweitenM: number[]
  geplanteLk: number | null
  zeilen: LkZeile[]
}

/**
 * Hält die Beläge der Zulassung gegen die im Modell vorkommenden Feldweiten und die geplante Lastklasse.
 * Das ist ein Abgleich mit der Zulassungstabelle, kein Nachweis. null, wenn für die Liste keine Tabelle erfasst ist.
 */
export function pruefeLastklassen(liste: MjListe | null, feldweitenM: number[], geplanteLk: number | null | undefined): LkPruefung | null {
  const tabelle = liste ? LASTKLASSEN_TABELLEN[liste] : undefined
  if (!tabelle) return null
  const weiten = [...new Set(feldweitenM.map((f) => Math.round(f * 100) / 100))].sort((a, b) => a - b)
  const lk = geplanteLk ?? null
  const zeilen: LkZeile[] = tabelle.belaege.map((b) => {
    const pro = weiten.map((f) => ({ feldweiteM: f, maxLk: maxLastklasse(b, f) }))
    let ergebnis: LkErgebnis | null = null
    if (lk !== null && pro.length > 0) {
      // Lastklasse in der Zulassung: "höchstens LK x" → geplante LK muss ≤ x sein (LK1 ist die kleinste Last, LK6 die größte)
      if (pro.some((p) => p.maxLk === null)) ergebnis = 'nicht-abgedeckt'
      else if (pro.some((p) => lk > (p.maxLk as number))) ergebnis = 'zu-hoch'
      else ergebnis = 'ok'
    }
    return { belag: b.belag, anlage: b.anlage, proFeldweite: pro, ergebnis, hinweis: b.hinweis }
  })
  return { tabelle, feldweitenM: weiten, geplanteLk: lk, zeilen }
}
