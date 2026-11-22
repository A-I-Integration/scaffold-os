import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import {
  embedFacturX, validateInput, Profile, Flavor,
} from '@stackforge-eu/factur-x';
import { generateInvoicePdfCompliant } from '@/lib/invoice-pdf-server';
import { requireAuth, unauthorizedResponse, serverErrorResponse, pruefeRolle } from '@/lib/auth';
import { ROLLEN } from '@/lib/rollen';
import { pruefePflichtangaben } from '@/lib/rechnung-steuer';
import { baueERechnungEingabe } from '@/lib/rechnung-erechnung';
import { archiviereXml } from '@/lib/rechnung-archiv';
import { erwarteteProjektnummer, SperreFehler } from '@/lib/cad/projektnummer-sperre';

// ============================================================
// SCAFFOLD OS – E-Rechnung / ZUGFeRD (Phase 39)
//
// Nimmt die bereits im Browser (jsPDF) erzeugte Rechnungs-PDF und
// bettet zusätzlich die gesetzlich vorgeschriebene, maschinenlesbare
// EN-16931-Rechnung (CII-XML) hinein – ZUGFeRD-Format. Der Kunde sieht
// weiterhin dieselbe PDF wie bisher, Buchhaltungssoftware kann
// zusätzlich die strukturierten Daten automatisch auslesen.
//
// WICHTIG, ehrlich dokumentiert (siehe README der Lieferung):
// Die eingebetteten Rechnungsdaten werden hier ECHT gegen das
// offizielle EN-16931-Schema und die Geschäftsregeln geprüft (nicht
// nur behauptet) – schlägt das fehl, wird NICHTS eingebettet, sondern
// ein klarer Fehler zurückgegeben. Die sichtbare PDF wird jetzt mit
// einer server-seitig eingebetteten Schriftart erzeugt (siehe
// lib/invoice-pdf-server.ts) – schließt die zuvor offene PDF/A-3-
// Schriftart-Lücke.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

export async function POST(req: NextRequest) {
  const rollenPruefung = await pruefeRolle(ROLLEN.ADMIN_DISPO);
  if (!rollenPruefung.ok) return rollenPruefung.response;
  try {
    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return NextResponse.json({ success: false, error: 'invoice_id erforderlich' }, { status: 400 });
    }

    const invRes = await fetch(`${url}/rest/v1/invoices?id=eq.${invoice_id}&select=*`, { headers });
    if (!invRes.ok) throw new Error(await invRes.text());
    const inv = (await invRes.json())?.[0];
    if (!inv) return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });

    // Projektnummer des verknüpften CAD-Projekts: steht auf dem PDF und wird dem Versand als "im Dokument enthalten" gemeldet
    try { inv.projektnummer = await erwarteteProjektnummer(inv.project_id); }
    catch (e) { if (e instanceof SperreFehler) return NextResponse.json({ success: false, error: e.message }, { status: e.status }); throw e; }

    const cs = inv.company_snapshot || {};

    // Vorab auf offensichtliche Lücken prüfen, mit klarer, deutscher Meldung
    // statt einer kryptischen Bibliotheks-Fehlermeldung.
    const luecken = pruefePflichtangaben(inv);
    if (luecken.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Für die E-Rechnung fehlen Pflichtangaben (§ 14 Abs. 4 UStG).',
        details: luecken.map((l) => ({ field: l.code, message: l.text })),
      }, { status: 400 });
    }

    const input = baueERechnungEingabe(inv);

    // Echte Validierung gegen die EN-16931-Geschäftsregeln – bei Fehlern
    // wird NICHTS eingebettet, sondern eine klare Fehlerliste zurückgegeben.
    const check = validateInput(input, Profile.EN16931);
    if (!check.valid) {
      return NextResponse.json({ success: false, error: 'Rechnungsdaten sind nicht vollständig für eine E-Rechnung.', details: check.errors }, { status: 400 });
    }

    const iccProfile = await readFile(path.join(process.cwd(), 'lib/assets/srgb.icc'));
    // NEU (Nachtrag Phase 39): eigene, server-seitige PDF mit eingebetteter
    // Schriftart statt der vom Browser (jsPDF, Schrift nicht eingebettet)
    // geschickten – schließt die PDF/A-3-Lücke von eben vollständig.
    const pdfBuffer = Buffer.from(await generateInvoicePdfCompliant(inv));

    const result = await embedFacturX({
      pdf: pdfBuffer, input, profile: Profile.EN16931, flavor: Flavor.ZUGFERD, rgbIccProfile: iccProfile,
    });

    // Strukturierte Daten im Originalformat unveränderbar archivieren (GoBD, 8 Jahre Aufbewahrung)
    const archiviert = await archiviereXml({ url, headers }, inv, 'zugferd', result.xml, rollenPruefung.userId);

    return NextResponse.json({
      success: true, pdfBase64: Buffer.from(result.pdf).toString('base64'), archiviert, projektnummer: inv.projektnummer ?? null,
      ...(archiviert ? {} : { warnung: 'Die E-Rechnung wurde erstellt, konnte aber nicht archiviert werden (Datenbank-Migration ausgeführt?).' }),
    });
  } catch (err: any) {
    return serverErrorResponse(err);
  }
}
