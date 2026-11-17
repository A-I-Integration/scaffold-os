// Vorschaubilder für die Materialliste: public/artikelbilder/index.json ordnet Artikelnummern Bilddateien zu
// ({ "ARTIKELNR": "datei.png" }, PNG oder JPEG). Fehlt die Datei oder ein Bild, bleibt die Vorschau leer.

import { passendeArtikelFuerKategorie } from '@/lib/cad/katalog-zuordnung'
import type { MaterialItem } from '@/types/scaffold'

export interface BildZuordnung { bildNr: string; /** true = Bild eines Katalogartikels derselben Gruppe, nicht des Artikels selbst */ symbol: boolean }

/** Welches Bild gehört zu welcher Position: erst die eigene Artikelnummer, sonst (nur mit Katalog des Systems) ein Symbolbild der Artikelgruppe. */
export function bildZuordnung(materials: MaterialItem[], systemId: string, index: Record<string, string>): Record<string, BildZuordnung> {
  const out: Record<string, BildZuordnung> = {}
  for (const m of materials) {
    if (index[m.articleNumber]) { out[m.articleNumber] = { bildNr: m.articleNumber, symbol: false }; continue }
    const kand = passendeArtikelFuerKategorie(systemId, m.category).find((a) => index[a.nr])
    if (kand) out[m.articleNumber] = { bildNr: kand.nr, symbol: true }
  }
  return out
}

export async function ladeBildIndex(basis = '/artikelbilder'): Promise<Record<string, string>> {
  try { const r = await fetch(`${basis}/index.json`); return r.ok ? ((await r.json()) as Record<string, string>) : {} } catch { return {} }
}

export async function ladeArtikelBilder(artikelnummern: string[], basis = '/artikelbilder'): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    const r = await fetch(`${basis}/index.json`)
    if (!r.ok) return out
    const index = (await r.json()) as Record<string, string>
    await Promise.all([...new Set(artikelnummern)].map(async (nr) => {
      const datei = index[nr]
      if (!datei || !/\.(png|jpe?g)$/i.test(datei)) return
      try {
        const b = await fetch(`${basis}/${datei}`)
        if (!b.ok) return
        const blob = await b.blob()
        out[nr] = await new Promise<string>((ok, err) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = err; f.readAsDataURL(blob) })
      } catch { /* dieses Bild fehlt: Feld bleibt leer */ }
    }))
  } catch { /* keine Bilder hinterlegt */ }
  return out
}
