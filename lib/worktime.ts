// ============================================================
// SCAFFOLD OS – Arbeitszeit-/Pausen-Logik (Zeiterfassung Nr. 6)
//
// Zentrale, einzige Stelle für die Pausen-Regel –
// wird von /api/time-entries (Stempeln) und
// /api/zeiterfassung (Korrektur/Nachtragen) genutzt.
//
// Regel (gesetzliches Standardmodell, ArbZG § 4):
//   ab 6 h brutto → 30 min Pause
//   ab 9 h brutto → 45 min Pause
// ============================================================

export const BREAK_RULE_TEXT = '30 min ab 6 h, 45 min ab 9 h';

export function autoBreakMinutes(grossMs: number): number {
  const grossHours = grossMs / 3600000;
  if (grossHours >= 9) return 45;
  if (grossHours >= 6) return 30;
  return 0;
}

/**
 * Rechnet Start/Ende in Netto-Stunden + automatische Pause um.
 * Liefert null, wenn die Zeiten unbrauchbar sind (Ende vor Start).
 */
export function computeNetHours(
  startISO: string,
  endISO: string
): { hours: number; breakMinutes: number } | null {
  const diffMs = new Date(endISO).getTime() - new Date(startISO).getTime();
  if (!(diffMs > 0)) return null;
  const breakMinutes = autoBreakMinutes(diffMs);
  const netMs = Math.max(0, diffMs - breakMinutes * 60000);
  return {
    hours: Math.round((netMs / 3600000) * 100) / 100,
    breakMinutes,
  };
}

/**
 * Arbeitstage (Mo–Fr) in einem Monat zählen – für den Soll-Vergleich.
 * month = 'YYYY-MM'. Beim laufenden Monat wird nur bis heute gezählt.
 * Hinweis: Feiertage werden bewusst nicht abgezogen (Hinweis in der UI).
 */
export function workdaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return 0;
  const now = new Date();
  const isCurrentMonth =
    now.getFullYear() === y && now.getMonth() + 1 === m;
  const daysInMonth = new Date(y, m, 0).getDate();
  const lastDay = isCurrentMonth ? now.getDate() : daysInMonth;

  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(y, m - 1, d).getDay(); // 0=So, 6=Sa
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}
