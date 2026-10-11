// ============================================================
// SCAFFOLD OS – Regeln beim Anlegen von Rechnungen (reine Logik)
//
// Abschlagsrechnungen gehören immer zu einem Auftrag: Nur mit project_id
// greift die Pflicht-Freigabe (Prüfung/Freigabe → Rechnung) und nur so
// kann die Schlussrechnung sie sauber per ID abziehen (§ 14 Abs. 5 UStG).
// Ausnahme: Ersatz einer bestehenden Rechnung (replace_invoice_id, z. B.
// „Ändern") – die alte Rechnung existiert bereits, ihr Typ bleibt erhalten.
// ============================================================

export const ABSCHLAG_OHNE_AUFTRAG_FEHLER =
  'Abschlagsrechnungen bitte aus dem Auftrag heraus anlegen (Kundenseite → Nachträge / Schluss → Rechnungsart „Abschlagsrechnung"). Ohne Auftrag greift die Pflicht-Freigabe nicht und die Schlussrechnung kann den Abschlag nicht sicher zuordnen.';

export function abschlagOhneAuftrag(invoiceType: unknown, projectId: unknown, replaceInvoiceId: unknown): boolean {
  return invoiceType === 'abschlag' && !projectId && !replaceInvoiceId;
}
