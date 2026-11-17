// Browser: mehrere Plan-PDFs lesen (je Datei die erste Seite mit Maßstab und Vektoren) und zu einem Bauwerk-Vorschlag zusammenführen.
import { bauwerkAusPlaenen, type BauwerkAusPlaenen, type GelesenerPlan } from './bauwerk-aus-plaenen'

export async function bauwerkAusPdfs(dateien: File[]): Promise<BauwerkAusPlaenen | null> {
  const [{ ladePlanQuelle }, { massstabAusTexten }] = await Promise.all([import('./plan-rendern'), import('./plan-vorlage')])
  const plaene: GelesenerPlan[] = []
  const fehlend: string[] = []
  for (const d of dateien) {
    if (!/\.pdf$/i.test(d.name) && d.type !== 'application/pdf') { fehlend.push(`${d.name}: kein PDF`); continue }
    const q = await ladePlanQuelle(d)
    try {
      let gefunden = false
      for (let nr = 1; nr <= q.seiten && !gefunden; nr++) {
        const texte = await q.texte(nr, 0)
        const ms = massstabAusTexten(texte.map((t) => t.s))
        if (!ms) continue
        const flaechen = await q.vektoren(nr, 0)
        if (!flaechen.length) continue
        plaene.push({ name: d.name, massstab: ms, flaechen, texte })
        gefunden = true
      }
      if (!gefunden) fehlend.push(`${d.name}: kein Vektorplan mit Maßstab (Scan oder Bild)`)
    } finally { q.freigeben() }
  }
  if (!plaene.length) return null
  const r = bauwerkAusPlaenen(plaene)
  r.nichtGelesen.push(...fehlend)
  return r
}
