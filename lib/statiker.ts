// ============================================================
// SCAFFOLD OS – Statiker-Rolle (externe Ingenieurbüros)
//
// Ein Statiker bekommt einen eigenen Login, sieht aber AUSSCHLIESSLICH
// die ihm freigegebenen CAD-Projekte (3D-Ansicht, Maße, Stückliste ohne
// Preise). Alles andere ist für ihn gesperrt – und zwar nach dem Prinzip
// „Standard = gesperrt“: nur die hier aufgelisteten Pfade sind erlaubt.
// Neue Seiten oder API-Routen sind für Statiker damit automatisch zu.
//
// Erkannt wird ein Statiker am Flag `app_metadata.statiker = true` im
// Supabase-Login. app_metadata kann nur mit dem Service-Schlüssel gesetzt
// werden, der Statiker selbst kann es nicht ändern.
// ============================================================

export const STATIKER_ROLLE = 'statiker'
export const STATIKER_STARTSEITE = '/statiker'

/** Pfade (inkl. Unterpfade), die ein Statiker aufrufen darf. */
export const STATIKER_ERLAUBTE_PFADE = [
  '/statiker',
  '/api/statiker',
  '/login',
  '/passwort-reset',
  '/passwort-vergessen',
] as const

type UserMitMetadaten = { app_metadata?: Record<string, unknown> | null } | null | undefined

/** Ist dieser Login ein Statiker? (Flag im app_metadata, nicht änderbar durch den Nutzer) */
export function istStatiker(user: UserMitMetadaten): boolean {
  return user?.app_metadata?.statiker === true
}

/** Genauer Pfad-Vergleich: „/statiker“ und „/statiker/x“ passen, „/statikerx“ nicht. */
export function statikerDarfPfad(pfad: string): boolean {
  if (typeof pfad !== 'string' || !pfad.startsWith('/')) return false
  // Doppelte Schrägstriche / Rückwärtspfade nie durchlassen
  if (pfad.includes('//') || pfad.includes('..') || pfad.includes('\\')) return false
  return STATIKER_ERLAUBTE_PFADE.some((erlaubt) => pfad === erlaubt || pfad.startsWith(erlaubt + '/'))
}

export type StatikerEntscheidung = 'erlaubt' | 'api-sperre' | 'umleiten'

/** Was tut der Proxy mit einem Statiker-Request auf diesem Pfad? */
export function statikerEntscheidung(pfad: string): StatikerEntscheidung {
  if (statikerDarfPfad(pfad)) return 'erlaubt'
  return pfad === '/api' || pfad.startsWith('/api/') ? 'api-sperre' : 'umleiten'
}

/** Anzeigename eines Statiker-Logins (für Auswahllisten). */
export function statikerAnzeigename(p: { full_name?: string | null; email?: string | null }): string {
  const name = (p.full_name || '').trim()
  if (name && p.email) return `${name} (${p.email})`
  return name || p.email || 'Unbekannt'
}
