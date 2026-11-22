// Speicherstatus der CAD-Kopfzeile. Reine Ableitung aus dem tatsächlichen Zustand – nichts wird geschätzt.
export type SpeicherStatus = 'gespeichert' | 'aenderungen' | 'laeuft' | 'fehler' | 'offline'

export interface SpeicherEingabe {
  online: boolean
  /** Speichern ins Konto (Server) läuft gerade */
  kontoLaeuft: boolean
  /** Letzter Speicherversuch (Konto oder Browser) ist fehlgeschlagen */
  fehler: boolean
  /** Zeitpunkt der letzten Änderung am CAD-Stand im Browser-Speicher */
  gesichertUm: Date | null
  /** Zeitpunkt der letzten Speicherung des geöffneten Konto-Projekts; null = kein Konto-Projekt geöffnet */
  kontoGespeichertUm: Date | null
}

export function speicherStatus(e: SpeicherEingabe): SpeicherStatus {
  if (e.kontoLaeuft) return 'laeuft'
  if (e.fehler) return 'fehler'
  if (!e.online) return 'offline'
  if (e.kontoGespeichertUm && e.gesichertUm && e.gesichertUm.getTime() > e.kontoGespeichertUm.getTime()) return 'aenderungen'
  return 'gespeichert'
}

export const SPEICHER_TEXT: Record<SpeicherStatus, string> = {
  gespeichert: 'Gespeichert',
  aenderungen: 'Änderungen vorhanden',
  laeuft: 'Speichern läuft',
  fehler: 'Speicherfehler',
  offline: 'Offline',
}

export const SPEICHER_HINWEIS: Record<SpeicherStatus, string> = {
  gespeichert: 'Der Stand ist gesichert.',
  aenderungen: 'Seit dem letzten Speichern im Konto wurde etwas geändert.',
  laeuft: 'Das Projekt wird gerade gespeichert.',
  fehler: 'Das Speichern ist fehlgeschlagen. Bitte erneut speichern oder das Projekt als Datei sichern.',
  offline: 'Keine Verbindung. Der Stand bleibt im Browser, Speichern im Konto ist erst online möglich.',
}
