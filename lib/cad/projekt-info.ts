// Zeilen für „Projektinformationen“ im Tab Projekt. Es erscheinen nur Angaben, die der CAD-Stand wirklich kennt.
export interface ProjektInfoEingabe {
  name: string | null
  systemName: string | null
  speicherText: string
  versionText: string
  /** ISO-Zeitpunkte des Konto-Projekts (falls geöffnet) */
  erstelltAm?: string | null
  geaendertAm?: string | null
  /** letzte Sicherung im Browser */
  gesichertUm?: Date | null
}

const datum = (d: Date) => d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const aus = (iso?: string | null): Date | null => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d }

export function projektZeilen(e: ProjektInfoEingabe): { label: string; wert: string }[] {
  const z: { label: string; wert: string }[] = [
    { label: 'Projekt', wert: e.name || 'Unbenanntes Projekt' },
    { label: 'Gerüstsystem', wert: e.systemName || 'Kein System' },
    { label: 'Speicherstatus', wert: e.speicherText },
    { label: 'Version', wert: e.versionText },
  ]
  const erstellt = aus(e.erstelltAm)
  if (erstellt) z.push({ label: 'Erstellt', wert: datum(erstellt) })
  const geaendert = aus(e.geaendertAm) ?? e.gesichertUm ?? null
  if (geaendert) z.push({ label: 'Letzte Änderung', wert: datum(geaendert) })
  return z
}
