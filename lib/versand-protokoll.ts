import { createHash } from 'node:crypto';

// ============================================================
// SCAFFOLD OS – Versandprotokoll schreiben (Faktura F4, nur Server)
// Best effort: ein Fehler beim Protokollieren darf einen Versand nie rückwirkend verhindern oder als fehlgeschlagen melden.
// ============================================================

export interface VersandProtokollEingabe {
  invoiceNumber: string;
  kind: 'rechnung' | 'mahnung';
  to: string;
  subject?: string;
  status: 'versendet' | 'fehlgeschlagen';
  error?: string | null;
  format?: 'zugferd' | 'pdf' | null;
  pdfBase64?: string | null;
  attachmentName?: string | null;
  resendId?: string | null;
  sentBy?: string | null;
}

/** SHA-256 (hex) der gesendeten PDF – nimmt Base64 mit oder ohne „data:…;base64,“-Anfang. */
export function pdfPruefsumme(pdfBase64: string | null | undefined): string | null {
  if (!pdfBase64 || typeof pdfBase64 !== 'string') return null;
  const roh = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;
  if (!roh) return null;
  try { return createHash('sha256').update(Buffer.from(roh, 'base64')).digest('hex'); } catch { return null; }
}

/** Format nur aus erlaubten Werten; Mahnungen sind immer normale PDF. */
export function bereinigeFormat(format: unknown, kind: 'rechnung' | 'mahnung'): 'zugferd' | 'pdf' | null {
  if (kind === 'mahnung') return 'pdf';
  return format === 'zugferd' || format === 'pdf' ? format : null;
}

/** Zeile für die Datenbank (ohne die per Nachschlagen ergänzten Verknüpfungen). */
export function baueProtokollZeile(e: VersandProtokollEingabe) {
  return {
    invoice_number: String(e.invoiceNumber).slice(0, 60),
    kind: e.kind,
    to_email: String(e.to || '').slice(0, 320),
    subject: String(e.subject || '').slice(0, 300),
    status: e.status,
    error: e.status === 'fehlgeschlagen' ? String(e.error || 'Versand fehlgeschlagen').slice(0, 500) : null,
    format: bereinigeFormat(e.format, e.kind),
    dokument_hash: pdfPruefsumme(e.pdfBase64),
    attachment_name: e.attachmentName ? String(e.attachmentName).slice(0, 200) : null,
    resend_id: e.resendId ? String(e.resendId).slice(0, 100) : null,
    sent_by: e.sentBy || null,
  };
}

/** Schreibt eine Zeile; gibt zurück, ob es geklappt hat (Tabelle fehlt, Netz weg … = false, nie eine Ausnahme). */
export async function protokolliereVersand(e: VersandProtokollEingabe): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return false;
    const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };
    let verknuepfung: { invoice_id?: string; customer_id?: string | null; project_id?: string | null } = {};
    try {
      const r = await fetch(`${url}/rest/v1/invoices?invoice_number=eq.${encodeURIComponent(e.invoiceNumber)}&select=id,customer_id,project_id&limit=1`, { headers });
      if (r.ok) { const z = (await r.json())?.[0]; if (z) verknuepfung = { invoice_id: z.id, customer_id: z.customer_id ?? null, project_id: z.project_id ?? null }; }
    } catch { /* Verknüpfung optional – die Rechnungsnummer steht ohnehin in der Zeile */ }
    const res = await fetch(`${url}/rest/v1/invoice_dispatches`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ ...baueProtokollZeile(e), ...verknuepfung }),
    });
    if (!res.ok) console.error('[Versandprotokoll] nicht gespeichert:', res.status, (await res.text().catch(() => '')).slice(0, 200));
    return res.ok;
  } catch (err) {
    console.error('[Versandprotokoll] Fehler (ignoriert):', err);
    return false;
  }
}
