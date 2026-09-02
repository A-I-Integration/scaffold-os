import { NextRequest, NextResponse } from 'next/server';
import { generateMahnungPDF, type Invoice } from '@/lib/invoice-pdf';

// ============================================================
// SCAFFOLD OS – Cron: Automatisches Mahnwesen (Phase 24)
//
// Läuft täglich (vercel.json). Prüft alle offenen Rechnungen:
//   - 14 Tage nach Fälligkeit  → 1. Mahnung
//   - weitere 14 Tage später (28 Tage insgesamt) → 2. Mahnung
//   - danach: keine automatische Eskalation mehr (Inkasso/Anwalt
//     bleibt eine bewusste, manuelle Entscheidung)
//
// Gutschriften werden NIE gemahnt (invoice_type = 'gutschrift').
// Ohne hinterlegte Kunden-E-Mail wird übersprungen und im
// Ergebnis als "ohne_email" gemeldet, statt stillschweigend zu
// scheitern.
//
// Sicherheit: Vercel Cron schickt CRON_SECRET als Bearer-Token.
// Läuft auf JEDER Instanz (anders als die Datenhygiene, die nur
// auf der Master-Instanz läuft) – jede Instanz mahnt ihre eigenen
// Rechnungen.
// ============================================================

export const maxDuration = 120;

const FRIST_STUFE_1_TAGE = 14;
const FRIST_STUFE_2_TAGE = 28;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};

function tageUeberfaellig(dueDate: string): number {
  const heute = new Date(new Date().toDateString());
  const faellig = new Date(dueDate + 'T00:00:00');
  return Math.floor((heute.getTime() - faellig.getTime()) / 86400000);
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
    }
  }

  const ergebnis = { versendet: [] as string[], ohne_email: [] as string[], fehler: [] as string[], uebersprungen: 0 };

  try {
    const res = await fetch(
      `${url}/rest/v1/invoices?status=eq.offen&invoice_type=neq.gutschrift&select=*`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    const invoices: Invoice[] = await res.json();

    for (const inv of invoices) {
      if (!inv.due_date) { ergebnis.uebersprungen++; continue; }
      const tage = tageUeberfaellig(inv.due_date);
      const aktuelleStufe = Number(inv.reminder_level) || 0;

      let stufe: 1 | 2 | null = null;
      if (aktuelleStufe === 0 && tage >= FRIST_STUFE_1_TAGE) stufe = 1;
      else if (aktuelleStufe === 1 && tage >= FRIST_STUFE_2_TAGE) stufe = 2;
      if (!stufe) { ergebnis.uebersprungen++; continue; }

      try {
        // Kunden-E-Mail über den Kundenstamm nachschlagen (Rechnung
        // selbst speichert keine E-Mail, nur den Namen).
        const kRes = await fetch(
          `${url}/rest/v1/customers?name=ilike.${encodeURIComponent(inv.customer_name)}&select=email&limit=1`,
          { headers }
        );
        const kRows = kRes.ok ? await kRes.json() : [];
        const email = kRows?.[0]?.email;
        if (!email) { ergebnis.ohne_email.push(inv.invoice_number); continue; }

        const doc = generateMahnungPDF(inv, stufe);
        const pdfBase64 = doc.output('datauristring');

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://scaffold-os.vercel.app';
        const mailRes = await fetch(`${appUrl}/api/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'mahnung',
            to: email,
            projectId: inv.project_id || undefined,
            projectName: inv.customer_name,
            customerName: inv.customer_name,
            invoiceNumber: inv.invoice_number,
            grossAmount: Number(inv.gross_amount),
            pdfBase64,
          }),
        });
        const mailJson = await mailRes.json();
        if (!mailJson.success) throw new Error(mailJson.error || 'E-Mail-Versand fehlgeschlagen');

        await fetch(`${url}/rest/v1/invoices?id=eq.${inv.id}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ status: 'ueberfaellig', reminder_level: stufe }),
        });

        ergebnis.versendet.push(`${inv.invoice_number} (${stufe}. Mahnung)`);
      } catch (err: any) {
        ergebnis.fehler.push(`${inv.invoice_number}: ${err.message}`);
      }
    }

    return NextResponse.json({ success: true, ...ergebnis });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, ...ergebnis }, { status: 500 });
  }
}
