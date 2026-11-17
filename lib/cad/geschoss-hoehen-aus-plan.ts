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

/**
 * Vorschlag für Zweigeschosser, wenn der Plan keine beschriftete OKFF-Kote nennt: Eine unbeschriftete positive Kote, die in den Ansichten und
 * Schnitten mindestens dreimal vorkommt, zwischen 2,3 und 3,6 m liegt und zusammen mit der Traufe passt (zwei Geschosse ≈ Traufkote), gilt als
 * Fußboden des Obergeschosses. Es bleibt ein Vorschlag mit Hinweis; bestätigt wird weiterhin von Hand.
 */
export function geschossHoehenAusKotenVorschlag(texte: PlanText[], traufeM: number | undefined, ebenen: number[]): GeschossHoehenVorschlag[] {
  const ueber = ebenen.filter((e) => e >= 0 && e < 99).sort((a, b) => a - b)
  if (ueber.length !== 2 || ueber[0] !== 0 || ueber[1] !== 1 || !(traufeM && traufeM > 0)) return []
  const anzahl = new Map<number, number>()
  for (const t of texte) {
    const m = /^\+\s*(\d{1,2}[,.]\d{2})$/.exec(t.s.trim())
    if (!m) continue
    const w = Math.round(Number(m[1].replace(',', '.')) * 100) / 100
    if (w >= 2.3 && w <= 3.6) anzahl.set(w, (anzahl.get(w) ?? 0) + 1)
  }
  const kand = [...anzahl.entries()].filter(([w, n]) => n >= 3 && Math.abs(2 * w - traufeM) <= 0.3)
  if (kand.length !== 1) return []
  const [w, n] = kand[0]
  const k = String(w).replace('.', ',')
  return [
    { ebene: 0, titel: 'Erdgeschoss', obenM: 0, text: `Bezugshöhe ±0,00; Oberkante Außenwand = Fußboden 1. OG (Vorschlag +${k}, ${n}× im Plan, passt zur Traufe) – bitte prüfen`, bestaetigungErforderlich: true },
    { ebene: 1, titel: '1. Obergeschoss', obenM: w, text: `Fußboden 1. OG: +${k} kommt ${n}× unbeschriftet im Plan vor und passt zur Traufe (zwei Geschosse) – bitte prüfen`, bestaetigungErforderlich: true },
  ]
}
