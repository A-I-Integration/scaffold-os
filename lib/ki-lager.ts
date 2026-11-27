// KI-Lagererfassung (Paket 1): Wareneingang aus einem Lieferschein-Foto.
// Reine Logik ohne Netz. Grundsatz: Die KI liest nur Zeilen aus dem Bild. Sie bucht nie. Jede Zeile wird lokal geprüft,
// mit dem Artikelstamm abgeglichen und erst nach Bestätigung durch den Nutzer gebucht (über /api/lager/buchen).

export interface GelesenePosition { bezeichnung: string; menge: number | null; einheit: string | null; artikelnummer: string | null }
export interface GeleseneLieferung { belegnummer: string | null; positionen: GelesenePosition[] }
export interface ArtikelKurz { id: string; sku: string | null; name: string; unit: string | null; barcode: string | null }
export type Sicherheit = 'sicher' | 'vorschlag' | 'keiner'
export interface ArtikelTreffer { artikel: ArtikelKurz | null; sicherheit: Sicherheit; alternativen: ArtikelKurz[] }

const MAX_POSITIONEN = 100
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null)

/** Rohantwort der KI bereinigen: nur Zeilen mit Bezeichnung, Menge nur als ganze Zahl von 1 bis 100000 (die Lagerbuchung kennt nur ganze Stück). */
export function pruefeLagerAntwort(roh: unknown): GeleseneLieferung {
  const r = (roh && typeof roh === 'object' ? roh : {}) as Record<string, unknown>
  const liste = Array.isArray(r.positionen) ? r.positionen : []
  const positionen: GelesenePosition[] = []
  for (const p of liste.slice(0, MAX_POSITIONEN)) {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
    const bezeichnung = text(o.bezeichnung, 160)
    if (!bezeichnung) continue
    const m = typeof o.menge === 'number' ? o.menge : typeof o.menge === 'string' ? parseFloat(o.menge.replace(',', '.')) : NaN
    const menge = Number.isInteger(m) && m >= 1 && m <= 100000 ? m : null
    positionen.push({ bezeichnung, menge, einheit: text(o.einheit, 12), artikelnummer: text(o.artikelnummer, 40) })
  }
  return { belegnummer: text(r.belegnummer, 40), positionen }
}

const norm = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim()
const woerter = (s: string) => norm(s).split(' ').filter((w) => w.length > 1)

/** Gleicht eine gelesene Zeile mit dem Artikelstamm ab. „sicher“ nur bei gleicher Artikelnummer/Barcode oder gleichem Namen; sonst Vorschlag mit Wortüberdeckung. */
export function findeArtikel(p: GelesenePosition, artikel: ArtikelKurz[]): ArtikelTreffer {
  if (p.artikelnummer) {
    const n = norm(p.artikelnummer)
    const t = artikel.find((a) => (a.sku && norm(a.sku) === n) || (a.barcode && norm(a.barcode) === n))
    if (t) return { artikel: t, sicherheit: 'sicher', alternativen: [] }
  }
  const nb = norm(p.bezeichnung)
  const gleich = artikel.filter((a) => norm(a.name) === nb)
  if (gleich.length === 1) return { artikel: gleich[0], sicherheit: 'sicher', alternativen: [] }
  const w = woerter(p.bezeichnung)
  if (w.length === 0) return { artikel: null, sicherheit: 'keiner', alternativen: [] }
  const bewertet = artikel
    .map((a) => { const aw = new Set(woerter(a.name)); const treffer = w.filter((x) => aw.has(x)).length; return { a, wert: treffer / Math.max(w.length, aw.size) } })
    .filter((x) => x.wert >= 0.5)
    .sort((x, y) => y.wert - x.wert)
  if (bewertet.length === 0) return { artikel: null, sicherheit: 'keiner', alternativen: [] }
  return { artikel: bewertet[0].a, sicherheit: 'vorschlag', alternativen: bewertet.slice(1, 4).map((x) => x.a) }
}

export interface BuchungsZeile { inventory_id: string | null; menge: number | null; einbuchen: boolean }
/** Bucht nur bestätigte Zeilen mit Artikel und ganzer Menge. Fehlt bei einer angehakten Zeile etwas, wird gar nichts gebucht. */
export function baueWareneingang(zeilen: BuchungsZeile[], lagerort: string | null): { ok: true; positionen: { inventory_id: string; menge: number; nach_lagerort: string; nach_zustand: 'frei' }[] } | { ok: false; fehler: string } {
  if (!lagerort) return { ok: false, fehler: 'Bitte einen Lagerort wählen.' }
  const aktiv = zeilen.filter((z) => z.einbuchen)
  if (aktiv.length === 0) return { ok: false, fehler: 'Keine Position zum Einbuchen ausgewählt.' }
  const positionen: { inventory_id: string; menge: number; nach_lagerort: string; nach_zustand: 'frei' }[] = []
  for (const [i, z] of aktiv.entries()) {
    if (!z.inventory_id) return { ok: false, fehler: `Position ${i + 1}: Artikel zuordnen oder abwählen.` }
    if (!z.menge || !Number.isInteger(z.menge) || z.menge <= 0) return { ok: false, fehler: `Position ${i + 1}: Menge muss eine ganze Zahl über 0 sein.` }
    positionen.push({ inventory_id: z.inventory_id, menge: z.menge, nach_lagerort: lagerort, nach_zustand: 'frei' })
  }
  return { ok: true, positionen }
}
