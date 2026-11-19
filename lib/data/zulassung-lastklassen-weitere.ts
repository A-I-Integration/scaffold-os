// ============================================================
// SCAFFOLD OS – Lastklassen der Beläge: weitere MJ-Zulassungen
//
// Ergänzung zu zulassung-lastklassen.ts (gleiche Lesart: "Feldweite ≤ bisM → höchstens Lastklasse lk").
// Gelesen aus den PDF-Bescheiden, die der Anwender übergeben hat. Die Tabellenseiten wurden als Bild
// gelesen und gegen den Text des Bescheids abgeglichen; es sind Angaben der Zulassung, KEIN Nachweis
// von SCAFFOLD OS. Maßgeblich ist immer der aktuelle Bescheid.
//
// Diese Zulassungen sind NICHT einer Preisliste (MjListe) zugeordnet, weil unter einer Liste mehrere
// Zulassungen stehen (z. B. UNI-CONNECT 70 DUO, 100 DUO und 70 ALU DUO). Deshalb werden sie je Zulassung
// geführt und nicht in LASTKLASSEN_TABELLEN eingehängt; die Prüfung geht über pruefeTabelle().
//
// `umfang` sagt, wie viel von der Belag-Tabelle im vorliegenden PDF steht:
//  - 'vollstaendig'     die Tabelle steht komplett im PDF
//  - 'nur-aenderungen'  das PDF enthält nur Änderungs-/Ergänzungsbescheide: nur die dort genannten Beläge
//                       sind erfasst; die Grundtabelle des Ursprungsbescheids lag nicht vor ("nicht ausgewertet")
//  - 'keine-tabelle'    der Bescheid enthält keine Belag-Tabelle (z. B. reine Verlängerung)
// ============================================================

import type { MjListe } from '@/lib/mj-katalog'
import type { BelagLastklasse, LastklassenTabelle, LkStufe } from './zulassung-lastklassen'

export interface ZulassungLastklassen extends Omit<LastklassenTabelle, 'liste'> {
  /** Nächstliegende Preisliste, nur zur Orientierung (kein Schlüssel) */
  liste: MjListe | null
  system: string
  /** Gültig bis, laut Bescheid (TT.MM.JJJJ) */
  gueltigBis: string
  umfang: 'vollstaendig' | 'nur-aenderungen' | 'keine-tabelle'
}

const s = (...paare: [number, number][]): LkStufe[] => paare.map(([bisM, lk]) => ({ bisM, lk }))
/** Häufigste Stufung der Zulassungen: ≤ 2,07 → 6, 2,57 → 5, 3,07 → 4 */
const S654 = () => s([2.07, 6], [2.57, 5], [3.07, 4])
/** Stufung der Zulassungen mit nominalen Feldweiten: ≤ 2,0 → 6, 2,5 → 5, 3,0 → 4 */
const N654 = () => s([2.0, 6], [2.5, 5], [3.0, 4])
const b = (belag: string, anlage: string, stufen: LkStufe[], extra: Partial<BelagLastklasse> = {}): BelagLastklasse => ({ belag, anlage, stufen, ...extra })

export const LASTKLASSEN_WEITERE: ZulassungLastklassen[] = [
  // ---------------------------------------------------------------- COMBI DUO
  {
    liste: 'combi', system: 'MJ COMBI DUO', zulassung: 'Z-8.22-926', tabelle: 'Tabelle 8', gueltigBis: '17.10.2030',
    stand: 'Grundbescheid 11.11.2020 (Tabelle 8) mit Änderungsbescheid 10.10.2025', umfang: 'vollstaendig',
    hinweis: 'Tabelle 8 des Bescheids vom 11.11.2020, geändert/ergänzt durch den Bescheid vom 10.10.2025 (Seiten mit "-a", zwei neue Böden). Wo beide Bescheide verschieden angeben, gilt hier der spätere Wert (Durchstiegstafel Rohrauflage Alubelag). Rohr-/U-Auflage 0,19 m teilen sich in der Tabelle die Feldweiten-Zeilen und sind hier gemeinsam geführt.',
    belaege: [
      b('Stahlboden Rohrauflage, Breite 0,32 m', '08.01.00', S654()),
      b('Stahlboden U-Auflage, Breite 0,32 m', '08.04.00, 08.04.00-a', s([2.07, 6], [2.57, 5], [3.07, 4], [4.14, 3])),
      b('Stahlboden Rohrauflage / U-Auflage, Breite 0,19 m', '08.02.00, 08.03.00, 08.05.00, 08.06.00', S654(), { hinweis: 'Zuordnung der Anlagenseiten zu den Feldweiten-Zeilen ist in der Tabelle zusammengefasst; am Bescheid prüfen.' }),
      b('Durchstiegstafel – Rohrauflage Alubelag - Aluminiumklappe', '11.01.00, 11.03.00 (geändert: 11.01.00-a, 11.03.00-a)', s([2.57, 4], [3.07, 3]), { hinweis: 'Grundbescheid 2020: ≤ 3,07 → 3; Änderung 2025: 2,57 → 4, 3,07 → 3.' }),
      b('Durchstiegstafel – Rohrauflage Holzbelag - Holzklappe', '11.02.00, 11.02.00-a', s([3.07, 3])),
      b('Durchstiegstafel – U-Auflage mit Holzbelag', '11.05.00', s([3.07, 3])),
      b('Durchstiegstafel – U-Auflage mit Alu-Belag', '11.04.00, 11.06.00', s([2.57, 4], [3.07, 3])),
      b('U-Teleskopierbarer Spaltboden', '50.02.51', S654()),
      b('U-Alu-Durchstieg 1,00 m x 0,61 m', '50.02.53', s([1.0, 3]), { abM: 1.0, hinweis: 'Die Zulassung nennt nur die Feldweite 1,00 m.' }),
      b('U-Stahlboden T4 0,32 m / U-Stahlboden 0,32 m', '50.04.14, 50.04.15, 50.04.16, 50.04.17', S654()),
      b('U-Robustboden 0,61 m', '50.04.18, 50.04.19', s([3.07, 3])),
      b('U-Robustboden 0,32 m', '50.04.20', s([1.57, 6], [2.07, 5], [2.57, 4], [3.07, 3])),
      b('U-Stahlboden-Durchstieg 0,64 m', '50.04.21', s([2.57, 4]), { abM: 2.57, hinweis: 'Die Zulassung nennt nur die Feldweite 2,57 m.' }),
      b('U-Robust-Durchstieg 0,61 m', '50.04.23, 50.04.26, 50.04.27', s([3.07, 3])),
      b('U-Alu-Durchstieg 0,61 m', '50.04.24, 50.04.25', s([3.07, 3])),
      b('U-Stahlboden 0,19 m', '50.04.28, 50.04.29', S654()),
      b('U-Stalu-Boden 50, 0,73 - 3,07 m / O-Stalu-Boden T21, 0,73 - 3,07 m x 0,61 m', '50.02.63, 50.02.64', S654(), { hinweis: 'Neu durch den Änderungsbescheid 10.10.2025.' }),
    ],
  },
  // ------------------------------------------------------------ COMBI metric
  {
    liste: 'combi-metric-top', system: 'MJ COMBI metric', zulassung: 'Z-8.22-923', tabelle: 'Tabelle 8', gueltigBis: '03.01.2030',
    stand: 'Änderungs-/Ergänzungsbescheide bis 02.01.2025 (Grundbescheid 10.12.2019 lag nicht vor)', umfang: 'nur-aenderungen',
    hinweis: 'Das PDF enthält nur die Änderungs- und Ergänzungsbescheide. Erfasst sind ausschließlich die Beläge, die dort in Tabelle 8 genannt sind. Die Grundtabelle des Bescheids vom 10.12.2019 ist nicht ausgewertet; ein Belag, der hier fehlt, ist damit NICHT als unzulässig, sondern als nicht erfasst zu lesen.',
    belaege: [
      b('Durchstieg – Rohrauflage Aluminiumbelag', '65', s([2.5, 4], [3.0, 3]), { abM: 2.5, hinweis: 'Die Zulassung nennt nur die Feldweiten 2,5 m und 3,0 m.' }),
      b('Stahlböden 0,32 m, punktgeschweißt – Zapfenauflage / Rohrauflage', '66, 66-a, 67, 67-a, 68, 69, 56, 59', N654()),
      b('Alu-Durchstiegstafel mit Sperrholzbelag (Zapfenauflage)', '47', s([3.0, 3]), { abM: 2.5, hinweis: 'Die Zulassung nennt die Feldweiten 2,5 m und 3,0 m.' }),
      b('Alu-Durchstiegstafel mit Alu-Belag (Zapfenauflage)', '48', s([2.5, 4], [3.0, 3]), { abM: 2.5, hinweis: 'Die Zulassung nennt nur die Feldweiten 2,5 m und 3,0 m.' }),
      b('Aluboden mit Stahlkappe 0,64 m, Rohrauflage', '54', N654()),
    ],
  },
  // -------------------------------------------------------- COMBI metric DUO
  {
    liste: 'combi-metric-top', system: 'MJ COMBI metric DUO', zulassung: 'Z-8.22-960', tabelle: 'Tabelle 11', gueltigBis: '10.10.2028',
    stand: 'Bescheid 10.10.2023', umfang: 'vollstaendig',
    hinweis: 'Zwischenbelagriegel (Anlage B, Seiten 071, 072, 075, 076): abweichend von Tabelle 11 gilt L ≤ 67 cm → Lastklasse ≤ 3, L > 67 cm → Lastklasse ≤ 2, nur einseitig montiert und nur an 32 cm breiten Tragbelägen. Das ist hier nicht in den Stufen abgebildet. Der Bescheid nennt zusätzlich die Verwendung im Fang- und Dachfanggerüst (Absturzhöhen bis 2 m); nicht übernommen.',
    belaege: [
      b('Stahlboden Zapfenauflage / Stahlboden Rohrauflage / Aluminiumboden Zapfenauflage', '29 bis 31, 32 bis 35, 39', N654()),
      b('Holzboden Zapfenauflage', '38', s([2.5, 4], [3.0, 3])),
      b('Durchstiegstafel Rohrauflage', '25 bis 28', s([3.0, 3]), { abM: 2.5, hinweis: 'Die Zulassung nennt die Feldweiten 2,5 m und 3,0 m.' }),
      b('Durchstiegstafel Holzbelag mit Zapfen-Auflage', '44', s([3.0, 3]), { abM: 2.5, hinweis: 'Die Zulassung nennt die Feldweiten 2,5 m und 3,0 m.' }),
      b('Durchstiegstafel Alubelag mit Zapfen-Auflage', '45', s([2.5, 4], [3.0, 3]), { abM: 2.5, hinweis: 'Die Zulassung nennt nur die Feldweiten 2,5 m und 3,0 m.' }),
      b('Stahlboden 32 SL-Auflage / Stahl-Abschlussboden 15 SL-Auflage / Stahlboden 32, 24, 14 Rohr-Auflage', '82, 84, 85, 86, 87', N654()),
      b('Stahl-Abschlussboden 32, SL-Auflage', '83', s([1.5, 6], [2.0, 5], [2.5, 4], [3.0, 3])),
      b('Systemfreier Stahlboden B30, B19', '105', s([1.5, 6], [2.0, 4], [2.3, 3])),
      b('Alu-Durchstieg mit Sperrholz-Belag, SL-Auflage', '106', s([3.0, 3]), { abM: 3.0, hinweis: 'Die Zulassung nennt nur die Feldweite 3,0 m.' }),
      b('Alu-Durchstieg mit Alu-Belag, SL-Auflage / Rohr-Auflage', '107, 108, 109, 113', s([2.5, 4], [3.0, 3]), { abM: 2.5, hinweis: 'Die Zulassung nennt nur die Feldweiten 2,5 m und 3,0 m.' }),
    ],
  },
  // ------------------------------------------------------------------ UNI 70
  {
    liste: 'uni', system: 'MJ UNI 70', zulassung: 'Z-8.1-184', tabelle: 'Tabelle 5 (Zuordnung zu den Gerüstgruppen)', gueltigBis: '13.07.2027',
    stand: 'Änderungs-/Ergänzungsbescheide bis 20.06.2024 und Verlängerung 06.07.2026 (Grundbescheid 21.06.2019 lag nicht vor)', umfang: 'nur-aenderungen',
    hinweis: 'Der Bescheid ordnet die Beläge "Gerüstgruppen" zu, nicht "Lastklassen". Die Zahl ist hier unverändert als Lastklasse geführt; dass beide gleichzusetzen sind, ist eine Annahme und am Bescheid zu prüfen. Erfasst sind nur die Beläge aus den Änderungs-/Ergänzungsbescheiden; die Grundtabelle von 2019 ist nicht ausgewertet.',
    belaege: [
      b('Stahlboden – Punktgeschweißt – Typ 2, Breite 0,32 m', '85', N654()),
      b('Stahlboden – Punktgeschweißt – Typ 6, Breite 0,32 m', '86', N654()),
      b('Stahlboden – Maschinengeschweißt, Breite 0,15 m', '87', N654()),
    ],
  },
  // --------------------------------------------------------------- UNI 70 DUO
  {
    liste: 'uni', system: 'MJ UNI 70 DUO', zulassung: 'Z-8.1-303', tabelle: '–', gueltigBis: '02.03.2027',
    stand: 'Verlängerungsbescheid 16.02.2026', umfang: 'keine-tabelle',
    hinweis: 'Der Bescheid verlängert nur die Geltungsdauer und enthält keine Belag-Tabelle. Die Tabelle steht im Grundbescheid vom 24.02.2020 (geändert 2022 und 2025); der lag nicht vor: nicht ausgewertet.',
    belaege: [],
  },
  // ------------------------------------------------------------------ UNI 100
  {
    liste: 'uni', system: 'MJ UNI 100', zulassung: 'Z-8.1-871', tabelle: 'Tabelle 5', gueltigBis: '08.05.2031',
    stand: 'Grundbescheid 06.05.2020 mit Änderungen 19.04.2021 und 07.05.2026', umfang: 'vollstaendig',
    hinweis: 'Tabelle 5 des Bescheids vom 06.05.2020, ergänzt am 19.04.2021 (Seite 69) und am 07.05.2026 (Seiten 70 bis 72). Der Bescheid nennt die Feldweiten nominal (2,0 / 2,5 / 3,0 m).',
    belaege: [
      b('Vollholz-Belagtafel', '6, 7', s([2.0, 5], [2.5, 4])),
      b('Stahl-Belagtafel', '8', s([2.0, 6], [2.5, 4])),
      b('Stahlboden handgeschweißt / maschinengeschweißt / Stahlboden 1,25 mm / Aluminiumboden mit Stahlkappen / Aluminiumbelagtafel', '9, 10, 11, 12, 13', N654(), { hinweis: 'Diese Beläge stehen in der Tabelle in einem gemeinsamen Feld; die Zeilen sind hier gemeinsam geführt.' }),
      b('Alu-Durchstiegsbelagtafel mit Alu-Belag', '14', s([2.5, 4]), { abM: 2.5, hinweis: 'Die Zulassung nennt nur die Feldweite 2,5 m.' }),
      b('Stahlboden punktgeschweißt 0,74; 1,10; 1,25; 1,50; 2,00; 2,50; 3,00 m', '69', N654(), { hinweis: 'Ergänzung 19.04.2021.' }),
      b('Stahlboden punktgeschweißt Typ 2, Breite 0,32 m', '70', s([3.0, 4]), { abM: 3.0, hinweis: 'Ergänzung 07.05.2026; die Zulassung nennt nur die Feldweite 3,0 m.' }),
      b('Stahlboden punktgeschweißt Typ 6, Breite 0,32 m', '71', s([2.5, 5]), { abM: 2.5, hinweis: 'Ergänzung 07.05.2026; die Zulassung nennt nur die Feldweite 2,5 m.' }),
      b('Stahlboden maschinengeschweißt, Breite 0,15 m', '72', s([2.0, 6]), { abM: 2.0, hinweis: 'Ergänzung 07.05.2026; die Zulassung nennt nur die Feldweite 2,0 m.' }),
    ],
  },
  // ------------------------------------------------------ UNI-CONNECT 70 DUO
  {
    liste: 'uni-connect', system: 'MJ UNI-CONNECT 70 DUO', zulassung: 'Z-8.1-872', tabelle: 'Tabelle 6', gueltigBis: '09.03.2027',
    stand: 'Bescheid 16.03.2022', umfang: 'vollstaendig',
    hinweis: 'Im vorliegenden PDF stehen keine Änderungsbescheide zu Tabelle 6. Verwendung im Fang- und Dachfanggerüst (Klasse D) nicht übernommen.',
    belaege: [
      b('Stahlboden U-Auflage, Breite 0,32 m', '06.01.00', s([2.07, 6], [2.57, 5], [3.07, 4], [4.14, 3])),
      b('Stahlboden U-Auflage, Breite 0,19 m', '06.03.00, 06.04.00', S654()),
      b('Vollholz-Belagtafel 0,32 m', '06.05.00', s([1.57, 6], [2.07, 5], [2.57, 4], [3.07, 3])),
      b('Alu-Boden mit Stahlkappe 0,61 m', '06.08.00', S654()),
      b('Alu-Boden mit Stahlkappe 0,61 m', '06.26.00', s([4.14, 3]), { abM: 4.14, hinweis: 'Die Zulassung nennt nur die Feldweite 4,14 m.' }),
      b('Rahmentafel Aluminiumbelag 0,61 m', '06.13.00', s([2.57, 4], [3.07, 3])),
      b('Rahmentafel Holzbelag 0,61 m', '06.14.00', s([3.07, 3])),
      b('Durchstiegstafel - Aluminiumbelag', '06.15.00, 06.16.00, 06.17.00', s([2.57, 4], [3.07, 3])),
      b('Durchstiegstafel – Holzbelag', '06.18.00', s([3.07, 3])),
      b('U-Stahlboden 0,32 m / U-Stahlboden 0,19 m', '50.06.01 bis 50.06.04, 50.06.06 bis 50.06.09', S654()),
      b('U-Stahlboden 0,32 m', '50.06.05, 50.06.57, 50.06.66', s([4.14, 3]), { abM: 4.14, hinweis: 'Die Zulassung nennt nur die Feldweite 4,14 m.' }),
      b('U-Stahlboden-Durchstieg 0,64 m', '50.06.11, 50.06.58', s([2.07, 4]), { abM: 2.07, hinweis: 'Die Zulassung nennt nur die Feldweite 2,07 m.' }),
      b('U-Stahlboden-Durchstieg 0,64 m', '50.06.10, 50.06.11', s([2.57, 4]), { abM: 2.57, hinweis: 'Die Zulassung nennt nur die Feldweite 2,57 m.' }),
      b('U-Stalu-Boden T9 0,61 m / 0,32 m / 0,19 m / T21 0,61 m', '50.06.12, 50.06.15, 50.06.18, 50.06.67', S654()),
      b('U-Stalu-Boden 0,61 m (alte Ausf.)', '50.06.14', s([1.57, 6], [2.57, 5], [3.07, 4])),
      b('U-Stalu-Boden 0,32 m', '50.06.16', s([4.14, 3]), { abM: 4.14, hinweis: 'Die Zulassung nennt nur die Feldweite 4,14 m.' }),
      b('U-Alu-Boden 0,32 m / U-Robustboden 0,32 m / U-XTRA-N-Boden 0,32 m', '50.06.19, 50.06.23, 50.06.30', s([1.57, 6], [2.07, 5], [2.57, 4], [3.07, 3])),
      b('U-Alu-Boden 0,19 m', '50.06.20', s([1.57, 6], [2.07, 5], [2.57, 4])),
      b('U-Robustboden 0,61 m / U-Robust-Durchstieg 0,61 m / U-XTRA-N-Boden 0,61 m / U-XTRA-N-Durchstieg 0,61 m / U-Alu-Durchstieg 0,61 m / XTRA-N-Platte 0,61 m für Böden / Alu-Platte für Böden',
        '50.06.21, 50.06.22, 50.06.59, 50.06.60, 50.06.24 bis 50.06.27, 50.06.28, 50.06.29, 50.06.31 bis 50.06.34, 50.06.35 bis 50.06.38, 50.06.39 bis 50.06.41, 50.06.42, 50.06.43', s([3.07, 3])),
      b('U-Vollholz-Boden 0,32 m', '50.06.44', s([1.57, 5], [2.07, 4], [3.07, 3]), { hinweis: 'Die Zulassung nennt für 2,57 m und 3,07 m gemeinsam Lastklasse 3.' }),
      b('U-Vollholz-Boden 0,32 m, verstärkt', '50.06.45', s([2.07, 5], [2.57, 4]), { abM: 2.07, hinweis: 'Die Zulassung nennt nur die Feldweiten 2,07 m und 2,57 m.' }),
      b('U-teleskopierbarer Spaltboden', '50.06.51', S654()),
      b('U-Stapel-Kombiboden 0,61 m', '50.06.61, 50.06.62', s([3.07, 3])),
      b('U-Stapel-Kombiboden 0,32 m', '50.06.63', s([1.57, 6], [2.07, 5], [2.57, 4], [3.07, 3])),
      b('U-DST-Stapel-Kombiboden 0,61 m', '50.06.64, 50.06.65', s([3.07, 3])),
    ],
  },
  // ----------------------------------------------------- UNI-CONNECT 100 DUO
  {
    liste: 'uni-connect', system: 'MJ UNI-CONNECT 100 DUO', zulassung: 'Z-8.1-922', tabelle: 'Tabelle 5 (Zuordnung zu den Gerüstgruppen)', gueltigBis: '25.02.2027',
    stand: 'Änderungsbescheid 04.02.2025, Verlängerung 27.01.2026 (Grundbescheid 19.02.2020 lag nicht vor)', umfang: 'nur-aenderungen',
    hinweis: 'Der Bescheid ordnet die Beläge "Gerüstgruppen" zu, nicht "Lastklassen"; die Zahl ist hier unverändert als Lastklasse geführt (Gleichsetzung ist eine Annahme, am Bescheid prüfen). Erfasst ist nur der Belag aus dem Änderungsbescheid; die Grundtabelle ist nicht ausgewertet. Der Belag ist laut Bescheid auch im Fang- und Dachfanggerüst zulässig.',
    belaege: [
      b('U-Stahlboden 0,32 m', '74 bis 77, 97-a', S654()),
    ],
  },
  // --------------------------------------------------- UNI-CONNECT 70 ALU DUO
  {
    liste: 'uni-connect', system: 'MJ UNI-CONNECT 70 ALU DUO', zulassung: 'Z-8.1-935', tabelle: 'Tabelle 4', gueltigBis: '09.01.2028',
    stand: 'Bescheid 19.01.2023', umfang: 'vollstaendig',
    hinweis: 'Im vorliegenden PDF stehen keine Änderungsbescheide zu Tabelle 4.',
    belaege: [
      b('Rahmentafel Aluminiumbelag 0,61 m', '06.01.00', s([2.57, 4], [3.07, 3])),
      b('Rahmentafel Holzbelag 0,61 m', '06.02.00', s([3.07, 3])),
      b('Durchstiegstafel - Aluminiumbelag', '06.03.00, 06.04.00, 06.05.00', s([2.57, 4], [3.07, 3])),
      b('Durchstiegstafel – Holzbelag', '06.06.00', s([3.07, 3])),
      b('Stahlboden U-Auflage, Breite 0,19 m', '06.07.00', S654()),
      b('Aluminiumboden mit Stahlkappe 0,61 m', '06.08.00', S654()),
      b('U-Stalu-Boden T9 0,61 m / 0,32 m / 0,19 m / T21 0,61 m', '50.06.01, 50.06.03, 50.06.04, 50.06.46', S654()),
      b('U-Stalu-Boden 0,61 m (alte Ausf.)', '50.06.02', s([1.57, 6], [2.57, 5], [3.07, 4])),
      b('U-Alu-Boden 0,32 m / U-Robustboden 0,32 m / U-XTRA-N-Boden 0,32 m', '50.06.05, 50.06.09, 50.06.16', s([1.57, 6], [2.07, 5], [2.57, 4], [3.07, 3])),
      b('U-Alu-Boden 0,19 m', '50.06.06', s([1.57, 6], [2.07, 5], [2.57, 4])),
      b('U-Robustboden 0,61 m / U-Robust-Durchstieg 0,61 m / U-XTRA-N-Boden 0,61 m / U-XTRA-N-Durchstieg 0,61 m / U-Alu-Durchstieg 0,61 m / XTRA-N-Platte 0,61 m für Böden / Alu-Platte für Böden',
        '50.06.07, 50.06.08, 50.06.39, 50.06.40, 50.06.10 bis 50.06.13, 50.06.14, 50.06.15, 50.06.17 bis 50.06.20, 50.06.21 bis 50.06.24, 50.06.25 bis 50.06.27, 50.06.28, 50.06.29', s([3.07, 3])),
      b('U-teleskopierbarer Spaltboden', '50.06.34', S654()),
      b('U-Stapel-Kombiboden 0,61 m', '50.06.41, 50.06.42', s([3.07, 3])),
      b('U-Stapel-Kombiboden 0,32 m', '50.06.43', s([1.57, 6], [2.07, 5], [2.57, 4], [3.07, 3])),
      b('U-DST-Stapel-Kombiboden 0,61 m', '50.06.44, 50.06.45', s([3.07, 3])),
    ],
  },
]

export function lastklassenZulassung(nummer: string): ZulassungLastklassen | undefined {
  return LASTKLASSEN_WEITERE.find((z) => z.zulassung === nummer)
}
