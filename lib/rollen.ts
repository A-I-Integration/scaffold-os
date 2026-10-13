// ============================================================
// SCAFFOLD OS – Rollen-Gruppen für API-Routen
//
// Eine Quelle für "wer darf diese Route aufrufen". Die Gruppen folgen
// den Seitensperren in proxy.ts (ROLE_ACCESS) und dem Menü; Entscheidungen
// von Michelle (13.10.): E-Mail-Versand nur Admin + Disposition.
// ============================================================

export const ROLLEN = {
  /** Büro: Kunden, Rechnungen, Mails, Dashboard, Touren anlegen */
  ADMIN_DISPO: ['admin', 'disponent'],
  /** Aufmaß-Bereich (Schritt 6: Stückliste, KI-Material) */
  ADMIN_BAULEITER: ['admin', 'bauleiter'],
  /** Lager-Bereich */
  LAGER: ['admin', 'disponent', 'bauleiter', 'lager'],
} as const satisfies Record<string, readonly string[]>;

/**
 * Darf diese Rolle? Fehlt die Rolle (kein Profil), gilt wie im proxy.ts die
 * restriktivste Rolle "mitarbeiter".
 */
export function rolleErlaubt(rolle: string | null | undefined, erlaubt: readonly string[]): boolean {
  return erlaubt.includes(rolle || 'mitarbeiter');
}
