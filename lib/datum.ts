// ============================================================
// SCAFFOLD OS – Datum als "YYYY-MM-DD" in der LOKALEN Zeitzone
//
// Warum nicht `new Date().toISOString().slice(0, 10)`? toISOString() liefert
// das UTC-Datum. In Deutschland ist es zwischen 00:00 und 01:00/02:00 Uhr
// (Winter-/Sommerzeit) in UTC noch der Vortag – Datumsfelder zeigten dann
// "gestern" an. Diese Funktion nimmt das Datum, das der Nutzer auf seiner Uhr sieht.
// ============================================================

export function lokalesDatumIso(d: Date = new Date()): string {
  const j = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${j}-${m}-${t}`;
}
