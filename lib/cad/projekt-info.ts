import { STATUS_TEXT, type ProjektStatus } from '@/lib/cad/projekt-stammdaten'
// Zeilen für „Projektinformationen“ im Tab Projekt. Es erscheinen nur Angaben, die der CAD-Stand wirklich kennt.
export interface ProjektInfoEingabe {
  name: string | null
  systemName: string | null
  speicherText: string
  versionText: string
  /** Kunde und Anschrift aus dem Kundenstamm, Projektnummer und Status (nur bei Projekten im Konto) */
  kunde?: string | null; kundenAnschrift?: string | null; projektnummer?: string | null; nummerGesperrt?: boolean; projektStatus?: ProjektStatus | null
  /** Adresse der Baustelle (nur nach Übernahme aus dem Aufmaß bekannt) */
  baustelle?: string | null
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
    ...(e.projektnummer ? [{ label: 'Projektnummer', wert: e.nummerGesperrt ? `${e.projektnummer} (gesperrt)` : e.projektnummer }] : []),
    ...(e.projektStatus ? [{ label: 'Projektstatus', wert: STATUS_TEXT[e.projektStatus] }] : []),
    ...(e.kunde ? [{ label: 'Kunde', wert: e.kunde }] : []),
    ...(e.kunde && e.kundenAnschrift ? [{ label: 'Kundenanschrift', wert: e.kundenAnschrift }] : []),
    ...(e.baustelle ? [{ label: 'Baustelle', wert: e.baustelle }] : []),
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
