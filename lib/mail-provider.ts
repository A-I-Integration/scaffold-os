// ============================================================
// SCAFFOLD OS – Voreinstellungen für E-Mail-Anbieter
//
// WICHTIG: Die Server-Adressen sind Standardwerte nach bestem Wissen
// und NICHT live gegen die Anbieter geprüft. Der echte Verbindungstest
// in /api/email-accounts (vor dem Speichern) entscheidet. Stimmt etwas
// nicht, kann der Nutzer Server/Port von Hand ändern.
//
// secure = true  → verschlüsselt von Anfang an (typisch Port 465/993)
// secure = false → STARTTLS (typisch Port 587)
// ============================================================

export type AnbieterId = 'gmx' | 'webde' | 'gmail' | 'icloud' | 'ionos' | 'microsoft' | 'andere'

export interface Anbieter {
  id: AnbieterId
  name: string
  imap_host: string
  imap_port: number
  imap_secure: boolean
  smtp_host: string
  smtp_port: number
  smtp_secure: boolean
  /** true = noch nicht über Passwort anbindbar (z. B. Microsoft 365: nur OAuth) */
  nurOAuth?: boolean
  hinweis: string
}

export const ANBIETER: Anbieter[] = [
  {
    id: 'gmx', name: 'GMX',
    imap_host: 'imap.gmx.net', imap_port: 993, imap_secure: true,
    smtp_host: 'mail.gmx.net', smtp_port: 465, smtp_secure: true,
    hinweis: 'In den GMX-Einstellungen muss der Abruf per IMAP/POP3 freigeschaltet sein. Je nach Konto ist ein eigenes Anwendungspasswort nötig.',
  },
  {
    id: 'webde', name: 'WEB.DE',
    imap_host: 'imap.web.de', imap_port: 993, imap_secure: true,
    smtp_host: 'smtp.web.de', smtp_port: 587, smtp_secure: false,
    hinweis: 'In den WEB.DE-Einstellungen muss der Abruf per IMAP/POP3 freigeschaltet sein. Je nach Konto ist ein eigenes Anwendungspasswort nötig.',
  },
  {
    id: 'gmail', name: 'Gmail',
    imap_host: 'imap.gmail.com', imap_port: 993, imap_secure: true,
    smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_secure: true,
    hinweis: 'Gmail braucht ein App-Passwort (Google-Konto mit Bestätigung in zwei Schritten). Das normale Passwort funktioniert nicht.',
  },
  {
    id: 'icloud', name: 'Apple iCloud',
    imap_host: 'imap.mail.me.com', imap_port: 993, imap_secure: true,
    smtp_host: 'smtp.mail.me.com', smtp_port: 587, smtp_secure: false,
    hinweis: 'iCloud braucht ein app-spezifisches Passwort (Apple-ID-Verwaltung). Das normale Passwort funktioniert nicht.',
  },
  {
    id: 'ionos', name: 'IONOS',
    imap_host: 'imap.ionos.de', imap_port: 993, imap_secure: true,
    smtp_host: 'smtp.ionos.de', smtp_port: 587, smtp_secure: false,
    hinweis: 'Zugangsdaten des IONOS-Postfachs verwenden.',
  },
  {
    id: 'microsoft', name: 'Microsoft 365 / Outlook',
    imap_host: '', imap_port: 993, imap_secure: true,
    smtp_host: '', smtp_port: 587, smtp_secure: false,
    nurOAuth: true,
    hinweis: 'Microsoft hat die Anmeldung per Passwort für IMAP abgeschaltet. Die Anbindung per Microsoft-Anmeldung ist noch in Arbeit.',
  },
  {
    id: 'andere', name: 'Anderer Anbieter (manuell)',
    imap_host: '', imap_port: 993, imap_secure: true,
    smtp_host: '', smtp_port: 587, smtp_secure: false,
    hinweis: 'Server und Ports stehen in der Hilfe deines Mail-Anbieters. Ein App-Passwort ist oft nötig.',
  },
]

export function anbieterById(id: AnbieterId): Anbieter {
  return ANBIETER.find((a) => a.id === id) || ANBIETER[ANBIETER.length - 1]
}

/** Rät den Anbieter aus der Domain der Adresse. Unbekannt → null (nichts raten). */
export function anbieterAusAdresse(adresse: string): AnbieterId | null {
  const m = adresse.trim().toLowerCase().match(/@([^@\s]+)$/)
  if (!m) return null
  const d = m[1]
  if (d === 'gmx.de' || d === 'gmx.net' || d === 'gmx.at' || d === 'gmx.ch' || d === 'gmx.com') return 'gmx'
  if (d === 'web.de') return 'webde'
  if (d === 'gmail.com' || d === 'googlemail.com') return 'gmail'
  if (d === 'icloud.com' || d === 'me.com' || d === 'mac.com') return 'icloud'
  if (d === 'outlook.com' || d === 'outlook.de' || d === 'hotmail.com' || d === 'hotmail.de' || d === 'live.com' || d === 'live.de') return 'microsoft'
  return null
}
