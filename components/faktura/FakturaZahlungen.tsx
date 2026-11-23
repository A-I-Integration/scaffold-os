'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { WIN } from '@/components/win/Win';
import { fmtDate } from '@/lib/invoice-pdf';
import { berechneKennzahlen, offenePosten, offenerBetrag, anzeigeStatus } from '@/lib/faktura-kennzahlen';
import { type FakturaDaten, eur } from './daten';
import { Kachel, Karte, STATUS_STIL, kopfZeile, knopf } from './ui';

// Zahlungseingänge: offene Posten und der Monat auf einen Blick. Erfasst wird eine Zahlung im Rechnungsdetail (Reiter „Zahlungen“),
// mehrere auf einmal über den Zahlungsabgleich mit dem Kontoauszug.
export default function FakturaZahlungen({ daten }: { daten: FakturaDaten }) {
  const { heute, rechnungen, zahlungenMonat } = daten;
  const kz = useMemo(() => berechneKennzahlen(rechnungen, zahlungenMonat, heute), [rechnungen, zahlungenMonat, heute]);
  const posten = useMemo(() => offenePosten(rechnungen), [rechnungen]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kachel ton="#16a34a" icon={<CheckCircle2 className="h-5 w-5" />} titel="Zahlungseingänge (Monat)" wert={eur(kz.bezahltMonatBetrag)} unten={`${kz.bezahltMonatAnzahl} Rechnung${kz.bezahltMonatAnzahl === 1 ? '' : 'en'}`} />
        <Kachel ton="#2563eb" icon={<FileSpreadsheet className="h-5 w-5" />} titel="Offener Forderungsbetrag" wert={eur(kz.offenBetrag)} unten={`${kz.offenAnzahl} Rechnung${kz.offenAnzahl === 1 ? '' : 'en'}`} />
        <Kachel ton="#d97706" icon={<AlertTriangle className="h-5 w-5" />} titel="davon überfällig" wert={eur(kz.ueberfaelligBetrag)} unten={`${kz.ueberfaelligAnzahl} Rechnung${kz.ueberfaelligAnzahl === 1 ? '' : 'en'}`} />
      </div>

      <div className="rounded-xl border bg-white" style={{ borderColor: WIN.rand }}>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <p className="font-semibold" style={{ color: WIN.text }}>Offene Posten</p>
          <Link href="/zahlungsabgleich" className={`${knopf} ml-auto`} style={{ borderColor: WIN.rand }}>Zahlungsabgleich mit Kontoauszug</Link>
        </div>
        {posten.length === 0 ? (
          <p className="px-4 pb-6 text-sm" style={{ color: WIN.textGedaempft }} data-testid="posten-leer">Keine offenen Posten.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]" data-testid="posten-liste">
              <thead>
                <tr className={kopfZeile} style={{ color: WIN.textGedaempft, borderColor: WIN.randHell, background: '#fafafa' }}>
                  <th className="px-3 py-2">Nr.</th><th className="px-3 py-2">Kunde</th><th className="px-3 py-2 text-right">Brutto</th><th className="px-3 py-2 text-right">Bezahlt</th>
                  <th className="px-3 py-2 text-right">Offen</th><th className="px-3 py-2">Fällig</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {posten.map((r) => {
                  const st = STATUS_STIL[anzeigeStatus(r, heute)];
                  return (
                    <tr key={r.id} className="border-b" style={{ borderColor: WIN.randHell }}>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.invoice_number}</td>
                      <td className="px-3 py-2.5">{r.customer_name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{eur(Number(r.gross_amount))}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{Number(r.paid_amount) > 0 ? eur(Number(r.paid_amount)) : '–'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-medium">{eur(offenerBetrag(r))}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.due_date ? fmtDate(r.due_date) : '–'}</td>
                      <td className="px-3 py-2.5"><span className="rounded-md px-2 py-0.5 text-[12px] font-semibold" style={{ background: st.bg, color: st.fg }}>{st.label}</span></td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap"><Link href={`/rechnungen/${r.id}`} className={knopf} style={{ borderColor: WIN.rand }}>Zahlung erfassen</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Karte titel="So werden Zahlungen erfasst">
        <ul className="text-[13px] space-y-1" style={{ color: WIN.text }}>
          <li>• Einzeln: Rechnung öffnen → Zahlung eintragen (Teilzahlungen möglich).</li>
          <li>• Viele auf einmal: Zahlungsabgleich mit dem CSV-Kontoauszug.</li>
        </ul>
      </Karte>
    </div>
  );
}
