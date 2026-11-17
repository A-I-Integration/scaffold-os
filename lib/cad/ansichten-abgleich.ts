// ============================================================
// SCAFFOLD OS – Mehrere Ansichten desselben Bauwerks abgleichen (Breite, Höhe) und einen Vorschlag bilden.
//
// Jede Ansicht hat ihren eigenen „Boden“ (tiefste Unterkante der großen Flächen). Eine Ansicht, in der das Kirchenschiff den
// Turmfuß verdeckt, beginnt höher als eine, in der der Eingang sichtbar ist. Deshalb wird eine Höhe nur aus Ansichten
// übernommen, in denen Türen knapp über dem Boden erkannt wurden (Boden belegt). Alle anderen Höhen stehen als „nicht vergleichbar“
// im Bericht – sie werden weder gemittelt noch als Widerspruch gewertet. Vorschläge, keine Entscheidungen.
// ============================================================

import type { AnsichtErgebnis } from './ansicht-lesen'

export interface AnsichtEingang { name: string; ergebnis: AnsichtErgebnis }

export interface AnsichtZeile {
  name: string
  hauptBreiteM: number
  hauptHoeheM: number
  /** true: in dieser Ansicht wurden Türen knapp über dem Boden erkannt – der Boden der Zeichnung ist das Gelände (Annahme) */
  bodenBelegt: boolean
}

export interface AnsichtBefund { code: string; ampel: 'gruen' | 'gelb' | 'rot'; text: string }

export interface BauwerkVorschlag {
  breiteM?: number
  hoeheM?: number
  /** Ansicht, aus der die Höhe stammt */
  hoeheAus?: string
  je: AnsichtZeile[]
  befunde: AnsichtBefund[]
}

const nahe = (a: number, b: number, anteil = 0.03) => Math.abs(a - b) <= anteil * Math.max(a, b)
const r2 = (x: number) => Math.round(x * 100) / 100

export function gleicheAnsichtenAb(ansichten: AnsichtEingang[]): BauwerkVorschlag {
  const je: AnsichtZeile[] = []
  for (const a of ansichten) {
    const haupt = a.ergebnis.koerper[0]
    if (!haupt) continue
    je.push({ name: a.name, hauptBreiteM: haupt.breiteM, hauptHoeheM: haupt.hoeheM, bodenBelegt: a.ergebnis.tueren.length > 0 })
  }
  const befunde: AnsichtBefund[] = []
  const v: BauwerkVorschlag = { je, befunde }
  if (je.length === 0) { befunde.push({ code: 'KEINE_ANSICHT', ampel: 'rot', text: 'In keiner Ansicht wurde ein Körper erkannt.' }); return v }

  // Breite: alle Ansichten sollen dieselbe Breite des Hauptkörpers zeigen
  const breiten = je.map((z) => z.hauptBreiteM)
  if (je.length >= 2) {
    if (breiten.every((b) => nahe(b, breiten[0]))) {
      v.breiteM = r2(breiten.reduce((s, b) => s + b, 0) / breiten.length)
      befunde.push({ code: 'BREITE_GLEICH', ampel: 'gruen', text: `Breite des Hauptkörpers in ${je.length} Ansichten gleich (${v.breiteM.toLocaleString('de-DE')} m).` })
    } else {
      befunde.push({ code: 'BREITE_ABWEICHEND', ampel: 'gelb', text: `Breite des Hauptkörpers unterscheidet sich zwischen den Ansichten (${je.map((z) => `${z.name}: ${z.hauptBreiteM.toLocaleString('de-DE')} m`).join(', ')}). Es wird keine Breite vorgeschlagen.` })
    }
  } else {
    v.breiteM = breiten[0]
    befunde.push({ code: 'EINE_ANSICHT', ampel: 'gelb', text: 'Nur eine Ansicht: Breite und Höhe sind nicht gegen eine zweite Ansicht geprüft.' })
  }

  // Höhe: nur aus Ansichten mit belegtem Boden
  const belegt = je.filter((z) => z.bodenBelegt)
  if (belegt.length === 0) {
    befunde.push({ code: 'HOEHE_BODEN_UNBELEGT', ampel: 'gelb', text: 'In keiner Ansicht ist der Boden durch Türen belegt: Die Höhe über Gelände ist nicht bestimmbar.' })
  } else if (belegt.every((z) => nahe(z.hauptHoeheM, belegt[0].hauptHoeheM))) {
    const z = belegt.reduce((a, b) => (b.hauptHoeheM > a.hauptHoeheM ? b : a))
    v.hoeheM = z.hauptHoeheM
    v.hoeheAus = z.name
    befunde.push({ code: 'HOEHE_BELEGT', ampel: belegt.length > 1 ? 'gruen' : 'gelb', text: `Höhe ${z.hauptHoeheM.toLocaleString('de-DE')} m aus ${belegt.length > 1 ? `${belegt.length} Ansichten mit belegtem Boden` : `der Ansicht ${z.name} (Boden durch Türen belegt, keine zweite Bestätigung)`}.` })
  } else {
    befunde.push({ code: 'HOEHE_WIDERSPRUCH', ampel: 'rot', text: `Ansichten mit belegtem Boden zeigen verschiedene Höhen (${belegt.map((z) => `${z.name}: ${z.hauptHoeheM.toLocaleString('de-DE')} m`).join(', ')}). Es wird keine Höhe vorgeschlagen.` })
  }
  for (const z of je.filter((q) => !q.bodenBelegt)) {
    befunde.push({ code: 'HOEHE_NICHT_VERGLEICHBAR', ampel: 'gruen', text: `${z.name}: ${z.hauptHoeheM.toLocaleString('de-DE')} m gemessen ab dem tiefsten Punkt der Zeichnung, nicht belegt als Gelände (z. B. Turmfuß verdeckt). Nicht mit anderen Höhen verglichen.` })
  }
  return v
}
