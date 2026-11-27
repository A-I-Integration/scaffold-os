/** Liegt der Angebotspreis unter den Selbstkosten? Dann Betrag der Unterdeckung, sonst null (netto, beide ohne USt). */
export function unterdeckung(angebotspreis: number | null | undefined, selbstkosten: number | null | undefined): number | null {
  if (typeof angebotspreis !== 'number' || typeof selbstkosten !== 'number' || !Number.isFinite(angebotspreis) || !Number.isFinite(selbstkosten) || angebotspreis <= 0 || selbstkosten <= 0) return null
  const diff = Math.round((selbstkosten - angebotspreis) * 100) / 100
  return diff > 0.005 ? diff : null
}
