// ============================================================
// SCAFFOLD OS – 3D-Ansicht im Angebot
//
// Das CAD legt beim Zuordnen zum Kunden ein Bild der 3D-Ansicht
// ("CAD-Ansicht-….png", mit dem Gebäudemodell, falls geladen) als
// Projekt-Datei ab. Das Angebots-PDF bindet das neueste solche Bild
// auf einer eigenen Seite ein.
// ============================================================

export interface MedienZeile { file_name: string; file_type?: string | null; storage_path: string; created_at?: string | null }

/** Neuestes CAD-Ansicht-Bild des Projekts (nur Bilddateien). */
export function waehleCadAnsicht<T extends MedienZeile>(medien: T[]): T | null {
  const treffer = medien.filter((m) => /^CAD-Ansicht/i.test(m.file_name || '') && (!m.file_type || m.file_type.startsWith('image/')))
  if (treffer.length === 0) return null
  return treffer.reduce((a, b) => ((b.created_at || '') > (a.created_at || '') ? b : a))
}

/** Größe, in die ein Bild ins Seitenfeld passt (Seitenverhältnis bleibt, nie vergrößert über das Feld hinaus). */
export function passeBildEin(breite: number, hoehe: number, maxBreite: number, maxHoehe: number): { w: number; h: number } {
  if (!(breite > 0) || !(hoehe > 0)) return { w: 0, h: 0 }
  const f = Math.min(maxBreite / breite, maxHoehe / hoehe)
  return { w: Math.round(breite * f * 10) / 10, h: Math.round(hoehe * f * 10) / 10 }
}

export interface GeladenesBild { dataUrl: string; breite: number; hoehe: number }

/** Lädt ein Bild und liefert es als Data-URL samt Pixelmaßen (nur im Browser). */
export async function ladeBild(url: string): Promise<GeladenesBild | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl: string = await new Promise((ok, fehler) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => fehler(r.error); r.readAsDataURL(blob) })
    const maße: { w: number; h: number } = await new Promise((ok, fehler) => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => fehler(new Error('Bild')); i.src = dataUrl })
    return { dataUrl, breite: maße.w, hoehe: maße.h }
  } catch { return null }
}
