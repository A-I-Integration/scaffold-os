// Vorschaubilder für die Materialliste: public/artikelbilder/index.json ordnet Artikelnummern Bilddateien zu
// ({ "ARTIKELNR": "datei.png" }, PNG oder JPEG). Fehlt die Datei oder ein Bild, bleibt die Vorschau leer.

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
