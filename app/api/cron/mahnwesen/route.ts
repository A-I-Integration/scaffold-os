import { NextRequest, NextResponse } from 'next/server';
import { pruefeCronAufruf } from '@/lib/cron-auth';
import type { Invoice } from '@/lib/invoice-pdf';
import { naechsteAutoAktion, tageUeberfaellig, AKTION_LABEL } from '@/lib/mahnung-steuerung';
import { sendeMahnschritt, ladeMahnEinstellungen } from '@/lib/mahnung-versand';

// ============================================================
// SCAFFOLD OS – Cron: Automatisches Mahnwesen (Phase 24)
//
// Läuft täglich (vercel.json). Prüft alle offenen Rechnungen:
//   - optional (Einstellung): Zahlungserinnerung ohne Gebühren
//   - 14 Tage nach Fälligkeit  → 1. Mahnung
//   - weitere 14 Tage später (28 Tage insgesamt) → 2. Mahnung
//   - danach: keine automatische Eskalation mehr (Inkasso/Anwalt
//     bleibt eine bewusste, manuelle Entscheidung)
//
// Pausierte Rechnungen (mahnung_pausiert) werden übersprungen.
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};

export async function GET(req: NextRequest) {
  const cronFehler = pruefeCronAufruf(req);
  if (cronFehler) return cronFehler;

  const ergebnis = { versendet: [] as string[], ohne_email: [] as string[], fehler: [] as string[], uebersprungen: 0 };

  // Verzugszinssatz, Mahnpauschale und (optional) Tage bis zur Zahlungserinnerung aus den Firmeneinstellungen
  const cfg = await ladeMahnEinstellungen();

  try {
    // Offen UND bereits als überfällig markiert: nach der 1. Mahnung steht die Rechnung auf "ueberfaellig",
    // die 2. Mahnung muss sie trotzdem noch erreichen.
    const res = await fetch(
      `${url}/rest/v1/invoices?status=in.(offen,ueberfaellig)&invoice_type=neq.gutschrift&select=*`,
      { headers }
    );
    if (!res.ok) throw new Error(await res.text());
    const invoices: Invoice[] = await res.json();

    for (const inv of invoices) {
      if (!inv.due_date) { ergebnis.uebersprungen++; continue; }
      const aktion = naechsteAutoAktion({
        tageUeberfaellig: tageUeberfaellig(inv.due_date),
        stufe: Number(inv.reminder_level) || 0,
        erinnerungAm: (inv as any).erinnerung_am,
        pausiert: (inv as any).mahnung_pausiert,
        // Ohne die Datenbank-Spalte kann der Versand nicht vermerkt werden, daher dann keine Erinnerung
        erinnerungTage: 'erinnerung_am' in (inv as object) ? cfg.erinnerungTage : null,
      });
      if (!aktion) { ergebnis.uebersprungen++; continue; }

      const e = await sendeMahnschritt(inv, aktion, cfg);
      const name = `${inv.invoice_number} (${AKTION_LABEL[String(aktion)]})`;
      if (e.ok) ergebnis.versendet.push(name);
      else if (e.ohneEmail) ergebnis.ohne_email.push(inv.invoice_number);
      else ergebnis.fehler.push(`${inv.invoice_number}: ${e.error}`);
    }

    return NextResponse.json({ success: true, ...ergebnis });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, ...ergebnis }, { status: 500 });
  }
}
