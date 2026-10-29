// ============================================================
// SCAFFOLD OS – IFC-Import über den Hetzner-Worker (Phase 89): gemeinsame Regeln für Route und Oberfläche
//
// Ablauf: Browser lädt die .ifc direkt in den Storage (Vercel erlaubt nur ca. 4,5 MB je Anfrage), meldet sie der Route
// /api/cad/ifc-import an, die Route prüft Pfad, Größe und Magic Bytes und legt den Job (ki_jobs, Typ 'cad-import') an.
// Der Worker liefert glTF (Draco) und Properties-JSON; die Ableitung (Umriss, Teile, Höhen) macht der Browser aus dem
// Properties-JSON mit derselben Funktion wie beim Browser-Import (leiteIfcAb).
// ============================================================
import * as rahmenJs from '../../workers/ki/ifc-rahmen.js'

export const IFC_IMPORT_MAX_BYTES = 150 * 1024 * 1024
export const IFC_IMPORT_BUCKET = 'project-media'
/** Wie viele Bytes vom Anfang bzw. Ende der Datei die Route prüft (STEP-Kopf, DATA-Marke, Dateiende) */
export const KOPF_BYTES = 65536
export const ENDE_BYTES = 1024

/** Erlaubte Ablageorte: temp/<Sitzung>/ifc/… oder projects/<Projekt-ID>/ifc/…, Endung .ifc, keine Pfadtricks. */
const PFAD = /^(?:temp\/[A-Za-z0-9_-]{1,80}|projects\/[0-9a-fA-F-]{36})\/ifc\/[A-Za-z0-9._-]{1,120}\.ifc$/

export function speicherPfadGueltig(pfad: unknown): pfad is string {
  return typeof pfad === 'string' && pfad.length <= 300 && !pfad.includes('..') && PFAD.test(pfad)
}

export type KopfEndePruefung = { ok: true } | { ok: false; meldung: string }

/**
 * Prüft Anfang und Ende einer Datei auf „echte IFC“ (Magic Bytes „ISO-10303-21“, DATA-Teil, END-ISO-10303-21), ohne die
 * ganze Datei zu lesen. Es zählt der Inhalt, nicht die Endung. Die Syntaxprüfung über die ganze Datei macht der Worker.
 */
export function pruefeKopfUndEnde(kopf: Uint8Array, ende: Uint8Array, gesamtBytes: number): KopfEndePruefung {
  if (gesamtBytes <= 0) return { ok: false, meldung: 'Die Datei ist leer.' }
  if (gesamtBytes > IFC_IMPORT_MAX_BYTES) return { ok: false, meldung: 'Die Datei ist größer als 150 MB. Bitte als kleinere IFC exportieren (z. B. nur das Gebäude ohne Haustechnik).' }
  const zusammen = new Uint8Array(kopf.length + ende.length)
  zusammen.set(kopf, 0)
  zusammen.set(ende, kopf.length)
  const f = rahmenJs.pruefeIfcRahmen(zusammen)
  return f ? { ok: false, meldung: f.meldung } : { ok: true }
}

/** Zustand eines Importauftrags, wie ihn die Route zurückgibt */
export interface IfcJobStatus {
  success: boolean
  status: 'queued' | 'processing' | 'done' | 'error'
  fortschritt?: { anteil: number; text: string } | null
  glbPfad?: string
  eigenschaftenPfad?: string
  bucket?: string
  teilweise?: boolean
  fehlerAnzahl?: number
  statistik?: { elemente: number; waende: number; decken: number; daecher: number; dreiecke: number; glbBytes: number }
  error?: string
  grund?: string
}
