// ============================================================
// SCAFFOLD OS – Zeigt, wenn das Gerüst nicht mehr zu den Eingaben passt
//
// Das Gerüst wird nur beim Klick auf „Gerüst neu berechnen“ (oder beim ersten Aufbau) erzeugt. Wer danach Gebäudedaten
// (z. B. eine Tür) oder das System ändert, sah bisher weiter das alte Gerüst, ohne Hinweis. Der Stand der Eingaben wird beim
// Erzeugen gemerkt und mit dem aktuellen verglichen. Absichtlich KEIN automatisches Neuberechnen: Es würde von Hand entfernte
// Bauteile und Ansichtseinstellungen zurücksetzen.
// ============================================================
import { stabilJson } from '@/lib/aufmass-autosave-regeln'

/** Stand aller Eingaben, aus denen das Gerüst erzeugt wird (Gebäude samt Türen/Optionen und Gerüstsystem). */
export const eingabeStandGeruest = (gebaeude: unknown, systemId: string): string => stabilJson({ gebaeude, systemId })

/** true, wenn ein Gerüst gezeigt wird, das aus anderen Eingaben erzeugt wurde als den aktuellen. Ohne gemerkten Stand: false. */
export const istGeruestVeraltet = (hatModell: boolean, standBeimErzeugen: string | null, aktuell: string): boolean =>
  hatModell && standBeimErzeugen !== null && standBeimErzeugen !== aktuell
