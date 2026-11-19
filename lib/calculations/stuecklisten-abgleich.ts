// ============================================================
// SCAFFOLD OS – Vergleich zweier Stücklisten (nur lesend)
//
// Legt die Stückliste des Aufmaß-Wegs (scaffold-engine.ts) neben die des CAD-Wegs (cad-engine.ts) und zeigt je Artikelnummer die
// Mengenabweichung. Es verändert KEINE Menge und KEINEN Preis; welche Zählung maßgeblich ist, ist eine fachliche Entscheidung.
// Der Eurobetrag der Abweichung ist Menge × Stückpreis des Aufmaß-Wegs (bei Artikeln, die nur das CAD kennt: Stückpreis des CAD).
// ============================================================
import type { MaterialItem } from '@/types/scaffold'

export interface AbgleichZeile {
  articleNumber: string
  name: string
  aufmass: number
  cad: number
  /** CAD minus Aufmaß */
  differenz: number
  /** Differenz × Stückpreis in € (gerundet auf Cent) */
  differenzEuro: number
}

export interface Abgleich {
  zeilen: AbgleichZeile[]
  /** Nur Zeilen mit Differenz ≠ 0 */
  abweichend: AbgleichZeile[]
  summeAufmassEuro: number
  summeCadEuro: number
}

const cent = (x: number) => Math.round(x * 100) / 100

export function vergleicheStuecklisten(aufmass: MaterialItem[], cad: MaterialItem[]): Abgleich {
  const sumMenge = (l: MaterialItem[]) => { const m = new Map<string, { menge: number; name: string; preis: number }>(); for (const i of l) { const e = m.get(i.articleNumber); if (e) e.menge += i.quantity; else m.set(i.articleNumber, { menge: i.quantity, name: i.name, preis: i.unitPrice }) } return m }
  const a = sumMenge(aufmass), c = sumMenge(cad)
  const nummern = [...new Set([...a.keys(), ...c.keys()])].sort((x, y) => x.localeCompare(y))
  const zeilen = nummern.map((n): AbgleichZeile => {
    const x = a.get(n), y = c.get(n)
    const d = (y?.menge ?? 0) - (x?.menge ?? 0)
    return { articleNumber: n, name: x?.name ?? y!.name, aufmass: x?.menge ?? 0, cad: y?.menge ?? 0, differenz: d, differenzEuro: cent(d * (x?.preis ?? y!.preis)) }
  })
  const summe = (l: MaterialItem[]) => cent(l.reduce((s, i) => s + i.totalPrice, 0))
  return { zeilen, abweichend: zeilen.filter((z) => z.differenz !== 0), summeAufmassEuro: summe(aufmass), summeCadEuro: summe(cad) }
}
