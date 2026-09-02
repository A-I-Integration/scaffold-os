import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// SCAFFOLD OS – Cron: Automatische Standzeit-Nachberechnung (Phase 26)
//
// Läuft täglich (vercel.json). Nutzt EXAKT dieselbe Logik wie die
// bestehende, manuelle Mietabrechnungs-Seite (app/mietabrechnung/
// page.tsx) – nur automatisch statt per Knopfdruck:
//
//   Projekt "active" + geplantes Standzeit-Ende (step1.projektende)
//   in der Vergangenheit + Wochenpreis hinterlegt (aus dem Angebot,
//   angebotAnpassungen.miete.preisProWoche)
//     → legt eine Rechnung an (Position "Mietverlängerung X Wo.")
//     → merkt data.mietAbgerechnetBis, damit nichts doppelt
//       abgerechnet wird
//
// WICHTIG: Erstellt nur den Rechnungs-ENTWURF (status "offen"), wie
// der bestehende manuelle Button es auch tut – verschickt NICHTS
// automatisch per E-Mail. Das bleibt bewusst eine manuelle
// Entscheidung, genau wie beim Angebot→Rechnung-Fluss.
//
// Projekte OHNE hinterlegten Wochenpreis werden übersprungen und im
// Ergebnis als "ohne_preis" gemeldet, statt einen Preis zu erfinden.
// ============================================================

export const maxDuration = 60;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = {
  'Content-Type': 'application/json',
  apikey: key,
  Authorization: `Bearer ${key}`,
};

const MS_TAG = 1000 * 60 * 60 * 24;

function heuteIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function plusTageIso(iso: string, tage: number): string {
  const [j, m, t] = iso.split('-').map(Number);
  const d = new Date(j, m - 1, t + tage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoNachDeutsch(iso: string): string {
  const [j, m, t] = iso.split('-').map(Number);
  return `${String(t).padStart(2, '0')}.${String(m).padStart(2, '0')}.${j}`;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 });
    }
  }

  const ergebnis = { erstellt: [] as string[], ohne_preis: [] as string[], fehler: [] as string[] };

  try {
    const res = await fetch(`${url}/rest/v1/projects?status=eq.active&select=id,name,adresse,data`, { headers });
    if (!res.ok) throw new Error(await res.text());
    const projekte = await res.json();
    const heute = heuteIso();

    for (const p of projekte) {
      const s1 = p.data?.step1 || {};
      const ende: string | undefined = s1.projektende;
      if (!ende || !/^\d{4}-\d{2}-\d{2}$/.test(ende)) continue;

      const tageBisEnde = Math.floor((new Date(ende + 'T12:00:00').getTime() - new Date(heute + 'T12:00:00').getTime()) / MS_TAG);
      if (tageBisEnde >= 0) continue; // noch nicht überzogen

      const abgerechnetBis = p.data?.mietAbgerechnetBis && p.data.mietAbgerechnetBis > ende ? p.data.mietAbgerechnetBis : ende;
      const tageUeber = Math.floor((new Date(heute + 'T12:00:00').getTime() - new Date(abgerechnetBis + 'T12:00:00').getTime()) / MS_TAG);
      if (tageUeber < 1) continue; // heute bereits abgerechnet

      const wochen = Math.ceil(tageUeber / 7);
      const preis = Number(p.data?.angebotAnpassungen?.miete?.preisProWoche) || 0;
      const kunde = s1.name || p.name || '–';

      if (preis <= 0) { ergebnis.ohne_preis.push(p.name || p.id); continue; }

      try {
        // WICHTIG: /api/invoices verlangt eine eingeloggte Session (admin/disponent) –
        // ein Cron-Aufruf hat keine. Deshalb hier NICHT die geschützte Route aufrufen
        // (würde mit 403 fehlschlagen), sondern dieselbe Anlegen-Logik direkt mit dem
        // Service-Role-Key nachbilden (Nummer ziehen, Beträge rechnen, Firmen-Snapshot,
        // Insert) – exakt wie in app/api/invoices/route.ts POST.
        const net = wochen * preis;
        const tax = Math.round(net * 19) / 100;
        const gross = Math.round((net + tax) * 100) / 100;

        const numRes = await fetch(`${url}/rest/v1/rpc/next_invoice_number`, { method: 'POST', headers, body: '{}' });
        if (!numRes.ok) throw new Error(await numRes.text());
        const invoiceNumber = await numRes.json();

        let companySnapshot: any = null;
        try {
          const cRes = await fetch(`${url}/rest/v1/company_settings?id=eq.00000000-0000-0000-0000-000000000001&select=*`, { headers });
          if (cRes.ok) companySnapshot = (await cRes.json())?.[0] || null;
        } catch { /* Snapshot optional */ }

        const insRes = await fetch(`${url}/rest/v1/invoices`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=representation' },
          body: JSON.stringify({
            invoice_number: invoiceNumber,
            project_id: p.id,
            customer_name: kunde,
            customer_address: p.adresse || null,
            positions: [{
              bezeichnung: `Mietverlängerung ${p.name} – ${wochen} Wo. über Standzeit (ab ${isoNachDeutsch(abgerechnetBis)})`,
              menge: wochen, einheit: 'Wo.', einzelpreis: preis,
            }],
            net_amount: Math.round(net * 100) / 100,
            tax_rate: 19, tax_amount: tax, gross_amount: gross,
            status: 'offen',
            invoice_date: heute,
            due_date: plusTageIso(heute, 14),
            notes: `Automatische Miet-Nachberechnung: Standzeit „${p.name}" war am ${isoNachDeutsch(abgerechnetBis)} überschritten.`,
            company_snapshot: companySnapshot,
            invoice_type: 'standard',
          }),
        });
        if (!insRes.ok) throw new Error(await insRes.text());

        await fetch(`${url}/rest/v1/projects?id=eq.${p.id}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ data: { ...p.data, mietAbgerechnetBis: heute } }),
        });

        ergebnis.erstellt.push(`${invoiceNumber} (${p.name}, ${wochen} Wo.)`);
      } catch (err: any) {
        ergebnis.fehler.push(`${p.name}: ${err.message}`);
      }
    }

    return NextResponse.json({ success: true, ...ergebnis });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, ...ergebnis }, { status: 500 });
  }
}
