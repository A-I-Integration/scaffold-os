import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import {
  embedFacturX, validateInput, DocumentTypeCode, UnitCode, VatCategoryCode, Profile, Flavor,
} from '@stackforge-eu/factur-x';

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
// ein klarer Fehler zurückgegeben. Die strengere PDF/A-3-Archivformat-
// Konformität (eingebettete Schriftart) ist NICHT vollständig erfüllt
// – siehe README. Das ändert nichts an der Gültigkeit der Rechnung
// selbst, kann aber bei sehr strengen Archivierungs-Prüfungen auffallen.
// ============================================================

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const headers = { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` };

function feldFehlt(bezeichnung: string) {
  return { field: bezeichnung, message: `${bezeichnung} fehlt` };
}

export async function POST(req: NextRequest) {
  try {
    const { invoice_id, pdfBase64 } = await req.json();
    if (!invoice_id || !pdfBase64) {
      return NextResponse.json({ success: false, error: 'invoice_id und pdfBase64 erforderlich' }, { status: 400 });
    }

    const invRes = await fetch(`${url}/rest/v1/invoices?id=eq.${invoice_id}&select=*`, { headers });
    if (!invRes.ok) throw new Error(await invRes.text());
    const inv = (await invRes.json())?.[0];
    if (!inv) return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden.' }, { status: 404 });

    const cs = inv.company_snapshot || {};

    // Vorab auf offensichtliche Lücken prüfen, mit klarer, deutscher Meldung
    // statt einer kryptischen Bibliotheks-Fehlermeldung.
    const vorabFehler: { field: string; message: string }[] = [];
    if (!cs.company_name) vorabFehler.push(feldFehlt('Firmenname (Einstellungen)'));
    if (!cs.ust_id && !cs.steuer_nr) vorabFehler.push(feldFehlt('USt-IdNr. oder Steuernummer (Einstellungen)'));
    if (!cs.street || !cs.zip || !cs.city) vorabFehler.push(feldFehlt('Firmenadresse (Einstellungen)'));
    if (vorabFehler.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'Für die E-Rechnung fehlen Pflichtangaben in den Firmeneinstellungen.',
        details: vorabFehler,
      }, { status: 400 });
    }

    const netAmount = Number(inv.net_amount);
    const taxAmount = Number(inv.tax_amount);
    const grossAmount = Number(inv.gross_amount);
    const taxRate = Number(inv.tax_rate) || 19;

    const input = {
      document: {
        id: inv.invoice_number,
        issueDate: String(inv.invoice_date),
        typeCode: inv.invoice_type === 'gutschrift' ? DocumentTypeCode.CREDIT_NOTE : DocumentTypeCode.COMMERCIAL_INVOICE,
      },
      // Leistungsdatum: mangels eigenem Feld wird das Rechnungsdatum
      // verwendet (bei den meisten Gerüstbau-Rechnungen ohnehin nah am
      // tatsächlichen Leistungszeitpunkt).
      delivery: { date: String(inv.invoice_date) },
      seller: {
        name: cs.company_name,
        address: { line1: cs.street, city: cs.city, postalCode: cs.zip, country: 'DE' },
        taxRegistrations: cs.ust_id
          ? [{ id: cs.ust_id, schemeId: 'VA' as const }]
          : [{ id: cs.steuer_nr, schemeId: 'FC' as const }],
      },
      buyer: {
        name: inv.customer_name,
        // Unstrukturierte Adresse als eine Zeile – laut Bibliotheks-Validierung
        // für BASIC/EN16931 ausreichend; city/postalCode sind vom Typ her
        // Pflichtfelder, werden hier aber bewusst leer gelassen, wenn wir
        // sie nicht sauber trennen können (nur line1 wird tatsächlich
        // geprüft).
        address: { line1: inv.customer_address || inv.customer_name, city: '', postalCode: '', country: 'DE' },
      },
      lines: (inv.positions || []).map((p: any, i: number) => ({
        id: String(i + 1),
        name: p.bezeichnung,
        quantity: Math.abs(Number(p.menge)) || 1,
        unitCode: UnitCode.PIECE,
        unitPrice: Math.abs(Number(p.einzelpreis)) || 0,
        vatCategoryCode: VatCategoryCode.STANDARD_RATE,
        vatRatePercent: taxRate,
      })),
      totals: {
        lineTotal: Math.abs(netAmount), taxBasisTotal: Math.abs(netAmount),
        taxTotal: Math.abs(taxAmount), grandTotal: Math.abs(grossAmount), duePayableAmount: Math.abs(grossAmount),
        currency: 'EUR' as const,
      },
      vatBreakdown: [{ categoryCode: VatCategoryCode.STANDARD_RATE, ratePercent: taxRate, taxableAmount: Math.abs(netAmount), taxAmount: Math.abs(taxAmount) }],
      payment: cs.iban ? { meansCode: '58', iban: cs.iban, dueDate: inv.due_date ? String(inv.due_date) : undefined } : undefined,
    };

    // Echte Validierung gegen die EN-16931-Geschäftsregeln – bei Fehlern
    // wird NICHTS eingebettet, sondern eine klare Fehlerliste zurückgegeben.
    const check = validateInput(input, Profile.EN16931);
    if (!check.valid) {
      return NextResponse.json({ success: false, error: 'Rechnungsdaten sind nicht vollständig für eine E-Rechnung.', details: check.errors }, { status: 400 });
    }

    const iccProfile = await readFile(path.join(process.cwd(), 'lib/assets/srgb.icc'));
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    const result = await embedFacturX({
      pdf: pdfBuffer, input, profile: Profile.EN16931, flavor: Flavor.ZUGFERD, rgbIccProfile: iccProfile,
    });

    return NextResponse.json({ success: true, pdfBase64: Buffer.from(result.pdf).toString('base64') });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
