// ============================================================
// SCAFFOLD OS – Versandstatus einer Rechnung aus dem Versandprotokoll (Faktura F4)
// Reine Funktionen (ohne DB, ohne Server-Importe), auch im Browser nutzbar.
// Der Zahlungsstatus (invoices.status) bleibt davon getrennt.
// ============================================================

export interface VersandEintrag {
  id: string; created_at: string; invoice_id: string | null; invoice_number: string; kind: 'rechnung' | 'mahnung';
  to_email: string; subject: string; status: 'versendet' | 'fehlgeschlagen'; error?: string | null;
  format?: 'zugferd' | 'pdf' | 'xrechnung' | null; dokument_hash?: string | null; attachment_name?: string | null;
}

/** keiner = nichts protokolliert (Rechnungen vor dem Protokoll oder außerhalb von SCAFFOLD OS verschickt – das wissen wir nicht) */
export type VersandStand = 'keiner' | 'versendet' | 'fehlgeschlagen';

export interface VersandZusammenfassung { stand: VersandStand; zuletzt: string | null; an: string | null; format: 'zugferd' | 'pdf' | 'xrechnung' | null; versuche: number }

/** Entscheidend ist der jüngste Rechnungsversand: erst fehlgeschlagen, dann erfolgreich = versendet; erst erfolgreich, dann Fehlversuch = weiter versendet. */
export function versandZusammenfassung(eintraege: VersandEintrag[]): VersandZusammenfassung {
  const rechnung = eintraege.filter((e) => e.kind === 'rechnung').sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (rechnung.length === 0) return { stand: 'keiner', zuletzt: null, an: null, format: null, versuche: 0 };
  const erfolg = rechnung.find((e) => e.status === 'versendet');
  if (erfolg) return { stand: 'versendet', zuletzt: erfolg.created_at, an: erfolg.to_email, format: erfolg.format ?? null, versuche: rechnung.length };
  return { stand: 'fehlgeschlagen', zuletzt: rechnung[0].created_at, an: rechnung[0].to_email, format: rechnung[0].format ?? null, versuche: rechnung.length };
}

/** Karte je Rechnung: Schlüssel = invoice_id, bei fehlender id die Rechnungsnummer. */
export function versandJeRechnung(eintraege: VersandEintrag[]): Map<string, VersandZusammenfassung> {
  const gruppen = new Map<string, VersandEintrag[]>();
  for (const e of eintraege) {
    const k = e.invoice_id || e.invoice_number;
    gruppen.set(k, [...(gruppen.get(k) || []), e]);
  }
  const out = new Map<string, VersandZusammenfassung>();
  for (const [k, l] of gruppen) out.set(k, versandZusammenfassung(l));
  return out;
}

export function versandStandFuer(karte: Map<string, VersandZusammenfassung>, rechnung: { id: string; invoice_number: string }): VersandZusammenfassung {
  return karte.get(rechnung.id) || karte.get(rechnung.invoice_number) || { stand: 'keiner', zuletzt: null, an: null, format: null, versuche: 0 };
}

export const VERSAND_STAND_LABEL: Record<VersandStand, string> = { keiner: 'Kein Versand protokolliert', versendet: 'Versendet', fehlgeschlagen: 'Versand fehlgeschlagen' };
