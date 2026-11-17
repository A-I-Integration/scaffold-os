// ============================================================
// SCAFFOLD OS – Mehrere Plan-PDFs (Grundriss + Ansichten) zu EINEM Bauwerk-Vorschlag zusammenführen.
// Reine Logik ohne Browser: Eingang sind schon gelesene Seiten. Ergebnis ist ein Vorschlag mit Befunden, nie eine Entscheidung.
// ============================================================

import type { VektorFlaeche } from './pdf-vektoren'
import type { PlanText } from './grundriss-finden'
import { lesMassketten } from './masse-lesen'
import { koerperAusSchnittflaechen, type KoerperVorschlag } from './schnittflaechen'
import { ansichtLesen } from './ansicht-lesen'
import { gleicheAnsichtenAb, type BauwerkVorschlag, type AnsichtBefund } from './ansichten-abgleich'

export interface GelesenerPlan { name: string; massstab: number; flaechen: VektorFlaeche[]; texte: PlanText[] }

export interface BauwerkAusPlaenen {
  /** Vorschlagswerte (Meter); fehlen, wo der Plan nichts Belastbares zeigt */
  laengeM?: number
  breiteM?: number
  hoeheM?: number
  grundriss?: KoerperVorschlag & { quelle: string }
  ansichten?: BauwerkVorschlag
  befunde: AnsichtBefund[]
  nichtGelesen: string[]
}

const IST_ANSICHT = /ANSICHT\s+(NORD|OST|S[ÜU]D|WEST)/i
const IST_GRUNDRISS = /GRUNDRISS/i
const nahe = (a: number, b: number, anteil = 0.03) => Math.abs(a - b) <= anteil * Math.max(a, b)
const de = (x: number) => x.toLocaleString('de-DE')

export function bauwerkAusPlaenen(plaene: GelesenerPlan[]): BauwerkAusPlaenen {
  const befunde: AnsichtBefund[] = []
  const nichtGelesen: string[] = []
  let grundriss: BauwerkAusPlaenen['grundriss']
  const ansichtEingang: { name: string; ergebnis: NonNullable<ReturnType<typeof ansichtLesen>> }[] = []

  for (const p of plaene) {
    const alle = p.texte.map((t) => t.s).join(' ')
    const an = IST_ANSICHT.exec(alle)
    if (an) {
      const e = ansichtLesen(p.flaechen, p.texte, p.massstab)
      if (e) ansichtEingang.push({ name: `Ansicht ${an[1][0].toUpperCase()}${an[1].slice(1).toLowerCase()}`, ergebnis: e })
      else nichtGelesen.push(`${p.name}: Ansicht ohne lesbaren Körper`)
    } else if (IST_GRUNDRISS.test(alle) && !grundriss) {
      const k = koerperAusSchnittflaechen(p.flaechen, p.massstab, lesMassketten(p.flaechen, p.texte, p.massstab).angaben)
      if (k) grundriss = { ...k, quelle: p.name }
      else nichtGelesen.push(`${p.name}: Grundriss ohne erkennbare Schnittflächen`)
    } else {
      nichtGelesen.push(`${p.name}: weder Grundriss noch Ansicht erkannt`)
    }
  }

  const ansichten = ansichtEingang.length ? gleicheAnsichtenAb(ansichtEingang) : undefined
  if (ansichten) befunde.push(...ansichten.befunde)
  if (!grundriss) befunde.push({ code: 'KEIN_GRUNDRISS', ampel: 'gelb', text: 'Kein Grundriss mit Schnittflächen gelesen: Länge und Tiefe des Turms fehlen.' })
  if (!ansichten) befunde.push({ code: 'KEINE_ANSICHT', ampel: 'gelb', text: 'Keine Ansicht gelesen: Die Höhe fehlt.' })

  const v: BauwerkAusPlaenen = { grundriss, ansichten, befunde, nichtGelesen }
  if (grundriss) {
    v.laengeM = grundriss.breiteM
    v.breiteM = grundriss.tiefeM
    befunde.push(grundriss.passendeMasse.length
      ? { code: 'GRUNDRISS_MASSKETTE', ampel: 'gruen', text: `Grundriss ${de(grundriss.breiteM)} × ${de(grundriss.tiefeM)} m, durch eine gezeichnete Maßkette bestätigt.` }
      : { code: 'GRUNDRISS_UNBESTAETIGT', ampel: 'gelb', text: `Grundriss ${de(grundriss.breiteM)} × ${de(grundriss.tiefeM)} m ist aus den Schnittflächen gemessen, keine Maßkette bestätigt es.` })
  }
  if (ansichten?.hoeheM) v.hoeheM = ansichten.hoeheM
  // Querprüfung: Ansichtsbreite gegen die Grundriss-Seiten
  if (grundriss && ansichten?.breiteM) {
    const b = ansichten.breiteM
    if (nahe(b, grundriss.breiteM) || nahe(b, grundriss.tiefeM)) befunde.push({ code: 'ANSICHT_GRUNDRISS_GLEICH', ampel: 'gruen', text: `Ansichtsbreite ${de(b)} m passt zu einer Seite des Grundrisses.` })
    else befunde.push({ code: 'ANSICHT_GRUNDRISS_ABWEICHEND', ampel: 'gelb', text: `Ansichtsbreite ${de(b)} m passt zu keiner Seite des Grundrisses (${de(grundriss.breiteM)} × ${de(grundriss.tiefeM)} m): Maße im Plan prüfen, evtl. ist der Grundriss-Körper größer als der Turmschaft.` })
  }
  return v
}
