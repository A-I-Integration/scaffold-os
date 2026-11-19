import { DocumentTypeCode, VatCategoryCode } from '@stackforge-eu/factur-x';
import { steuerFall, einheitZuUnitCode, zerlegeAdresse, leistungsdatumFuer, aufbewahrungsHinweis } from './rechnung-steuer';

/** Baut aus einer gespeicherten Rechnung die strukturierten Daten der E-Rechnung (EN 16931). Reine Logik, ohne Datenbank. */
export function baueERechnungEingabe(inv: any) {
  const cs = inv.company_snapshot || {};
    const netAmount = Number(inv.net_amount);
    const taxAmount = Number(inv.tax_amount);
    const grossAmount = Number(inv.gross_amount);
    // Steuerfall: 0 % (z. B. § 13b) bleibt 0 % – früher wurde daraus 19 %
    const fall = steuerFall(inv);
    const taxRate = fall.satz;
    const kategorie = fall.kategorie === 'AE' ? VatCategoryCode.REVERSE_CHARGE : fall.kategorie === 'E' ? VatCategoryCode.EXEMPT : VatCategoryCode.STANDARD_RATE;
    const kaeufer = zerlegeAdresse(inv.customer_address, inv.customer_name);

    const input = {
      document: {
        id: inv.invoice_number,
        issueDate: String(inv.invoice_date),
        typeCode: inv.invoice_type === 'gutschrift' ? DocumentTypeCode.CREDIT_NOTE : DocumentTypeCode.COMMERCIAL_INVOICE,
        // Leitweg-ID (Behörden, XRechnung Pflicht); sonst nicht gesetzt
        ...(inv.leitweg_id ? { buyerReference: String(inv.leitweg_id) } : {}),
        ...(aufbewahrungsHinweis(inv) ? { notes: [{ content: aufbewahrungsHinweis(inv)!, subjectCode: 'REG' }] } : {}),
      },
      // Leistungsdatum: das gespeicherte Feld, sonst das Rechnungsdatum
      delivery: { date: String(leistungsdatumFuer(inv).datum) },
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
        address: { line1: kaeufer.line1, city: kaeufer.city, postalCode: kaeufer.postalCode, country: 'DE' },
        ...(inv.customer_ust_id ? { taxRegistrations: [{ id: String(inv.customer_ust_id), schemeId: 'VA' as const }] } : {}),
      },
      lines: (inv.positions || []).map((p: any, i: number) => ({
        id: String(i + 1),
        name: p.geruestId ? `${p.bezeichnung} [Gerüst: ${p.geruestId}]` : p.bezeichnung,
        quantity: Math.abs(Number(p.menge)) || 1,
        unitCode: einheitZuUnitCode(p.einheit),
        unitPrice: Math.abs(Number(p.einzelpreis)) || 0,
        vatCategoryCode: kategorie,
        vatRatePercent: taxRate,
      })),
      totals: {
        lineTotal: Math.abs(netAmount), taxBasisTotal: Math.abs(netAmount),
        taxTotal: Math.abs(taxAmount), grandTotal: Math.abs(grossAmount), duePayableAmount: Math.abs(grossAmount),
        currency: 'EUR' as const,
      },
      vatBreakdown: [{ categoryCode: kategorie, ratePercent: taxRate, taxableAmount: Math.abs(netAmount), taxAmount: Math.abs(taxAmount), ...(fall.grund ? { exemptionReason: fall.grund } : {}) }],
      payment: cs.iban ? { meansCode: '58', iban: cs.iban, dueDate: inv.due_date ? String(inv.due_date) : undefined } : undefined,
    };
  return input;
}
