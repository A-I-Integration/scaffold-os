// ============================================================
// SCAFFOLD OS – Eindeutige Geschoss-Höhenkoten aus Plantexten.
// Es werden ausschließlich explizit beschriftete OKFF/OK FFB-Koten akzeptiert.
// First-, Trauf-, Gelände- und unbeschriftete Höhenkoten sind KEINE Geschossoberkanten.
// ============================================================

import type { PlanText } from './grundriss-finden'

export interface GeschossHoehenVorschlag {
  ebene: number
  titel: string
  obenM: number
  text: string
  bestaetigungErforderlich: true
}

function zahlMeter(s: string): number | null {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Liest nur Koten, die im selben PDF-Textobjekt sowohl als OKFF/OK FFB
 * als auch einem Geschoss zugeordnet sind, z. B. "OKFF 1. OG +3,20".
 * Separate Textobjekte werden absichtlich nicht räumlich geraten/zusammengeführt.
 */
export function geschossHoehenAusPlan(texte: PlanText[]): GeschossHoehenVorschlag[] {
  const out: GeschossHoehenVorschlag[] = []
  const widerspruechlich = new Set<number>()
  const re = /\b(?:OK\s*FFB|OKFF|OBERKANTE\s+FERTIGFUSSBODEN)\s*(?:DES\s+)?(ERDGESCHOSS|EG|(?:(\d+)\s*\.?\s*OG)|(\d+)\s*\.?\s*OBERGESCHOSS|DACHGESCHOSS|DG|KELLERGESCHOSS|KG)\s*[:=]?\s*([+\-−]?\s*\d{1,2}(?:[,.]\d{1,2})?)\s*(?:M(?:ETER)?)?\b/i
  for (const t of texte) {
    const m = re.exec(t.s.replace(/\s+/g, ' ').trim())
    if (!m) continue
    const stock = m[1].toUpperCase()
    let ebene: number
    if (stock === 'ERDGESCHOSS' || stock === 'EG') ebene = 0
    else if (stock === 'DACHGESCHOSS' || stock === 'DG') ebene = 99
    else if (stock === 'KELLERGESCHOSS' || stock === 'KG') ebene = -1
    else ebene = Number(m[2] ?? m[3])
    const wert = zahlMeter(m[4].replace(/\s/g, '').replace('−', '-'))
    if (wert === null || wert < -10 || wert > 100) continue
    if (widerspruechlich.has(ebene)) continue
    const vorhanden = out.find((v) => v.ebene === ebene)
    if (vorhanden) {
      // Mehrere widersprüchliche OKFF-Koten für dasselbe Geschoss: keine automatische Auswahl.
      if (Math.abs(vorhanden.obenM - wert) > 0.02) {
        out.splice(out.indexOf(vorhanden), 1)
        widerspruechlich.add(ebene)
      }
      continue
    }
    out.push({ ebene, titel: t.s.trim(), obenM: Math.round(wert * 100) / 100, text: t.s.trim(), bestaetigungErforderlich: true })
  }
  return out.sort((a, b) => a.ebene - b.ebene)
}
