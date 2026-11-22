// Zentrale Registry der CAD-Tastenkürzel. Die Seite fragt nur `findeKuerzel` und führt die zugehörige Aktion aus;
// in Eingabefeldern löst nichts aus. Esc und Entf sind hier beschrieben, ihre Wirkung hängt vom Zustand ab
// (Werkzeug aktiv, Auswahl vorhanden) und liegt deshalb bei den jeweiligen Handlern der Seite.
export type KuerzelId =
  | 'abbrechen' | 'rueckgaengig' | 'wiederholen' | 'speichern' | 'loeschen' | 'alles-auswaehlen'
  | 'ansicht-3d' | 'ansicht-grundriss' | 'ansicht-vorne'

export interface Kuerzel {
  id: KuerzelId
  /** event.key in Kleinbuchstaben (bei Buchstaben) bzw. 'escape' / 'delete' */
  taste: string
  /** Strg (Windows) bzw. Cmd (Mac) erforderlich */
  strg: boolean
  umschalt: boolean
  anzeige: string
  beschreibung: string
}

export const KUERZEL: Kuerzel[] = [
  { id: 'abbrechen', taste: 'escape', strg: false, umschalt: false, anzeige: 'Esc', beschreibung: 'Werkzeug beenden, Auswahl aufheben' },
  { id: 'rueckgaengig', taste: 'z', strg: true, umschalt: false, anzeige: 'Strg/Cmd+Z', beschreibung: 'Rückgängig' },
  { id: 'wiederholen', taste: 'z', strg: true, umschalt: true, anzeige: 'Strg/Cmd+Umschalt+Z', beschreibung: 'Wiederholen' },
  { id: 'wiederholen', taste: 'y', strg: true, umschalt: false, anzeige: 'Strg/Cmd+Y', beschreibung: 'Wiederholen' },
  { id: 'speichern', taste: 's', strg: true, umschalt: false, anzeige: 'Strg/Cmd+S', beschreibung: 'Projekt als Datei speichern' },
  { id: 'loeschen', taste: 'delete', strg: false, umschalt: false, anzeige: 'Entf', beschreibung: 'Auswahl entfernen' },
  { id: 'alles-auswaehlen', taste: 'a', strg: true, umschalt: false, anzeige: 'Strg/Cmd+A', beschreibung: 'Alle sichtbaren Bauteile auswählen' },
  { id: 'ansicht-3d', taste: '1', strg: false, umschalt: false, anzeige: '1', beschreibung: '3D-Modell' },
  { id: 'ansicht-grundriss', taste: '2', strg: false, umschalt: false, anzeige: '2', beschreibung: 'Grundriss' },
  { id: 'ansicht-vorne', taste: '3', strg: false, umschalt: false, anzeige: '3', beschreibung: 'Ansicht vorne' },
]

export interface TastenEreignis {
  key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean
  target?: { tagName?: string; isContentEditable?: boolean } | null
}

export function istEingabeFeld(t: TastenEreignis['target']): boolean {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable === true)
}

/** Findet das passende Kürzel oder null. In Eingabefeldern und bei Alt immer null. */
export function findeKuerzel(e: TastenEreignis): KuerzelId | null {
  if (e.altKey || istEingabeFeld(e.target)) return null
  const strg = e.ctrlKey || e.metaKey
  const taste = e.key.toLowerCase()
  const k = KUERZEL.find((x) => x.taste === taste && x.strg === strg && (x.umschalt === e.shiftKey || (!x.strg && !x.umschalt)))
  return k ? k.id : null
}

/** Anzeigetext eines Kürzels für Tooltips, z. B. "Strg/Cmd+S". */
export function kuerzelText(id: KuerzelId): string {
  return KUERZEL.find((x) => x.id === id)?.anzeige ?? ''
}
