'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { FileText, AlertTriangle, CheckCircle2, BarChart3, FilePlus2, ClipboardList, Layers, ReceiptText, Undo2, Mail, BellRing } from 'lucide-react';
import { WIN } from '@/components/win/Win';
import { fmtDate } from '@/lib/invoice-pdf';
import { berechneKennzahlen, ueberfaelligeRechnungen, baldFaellig, offenerBetrag } from '@/lib/faktura-kennzahlen';
import { versandStandFuer } from '@/lib/versand-status';
import { type FakturaDaten, eur } from './daten';
import { Kachel, Karte, BereichLink, type BereichSprung } from './ui';

export default function FakturaUebersicht({ daten, onBereich, imKundenordner = false, onSchnell }: { daten: FakturaDaten; onBereich?: BereichSprung; imKundenordner?: boolean; onSchnell?: (art: 'rechnung' | 'abschlag' | 'schluss' | 'gutschrift') => void }) {
  const { heute, rechnungen, zahlungenMonat, entwuerfe, versandKarte, versandHinweis } = daten;
  const kz = useMemo(() => berechneKennzahlen(rechnungen, zahlungenMonat, heute), [rechnungen, zahlungenMonat, heute]);
  const ueberfaellig = useMemo(() => ueberfaelligeRechnungen(rechnungen, heute), [rechnungen, heute]);
  const bald = useMemo(() => baldFaellig(rechnungen, heute, 7), [rechnungen, heute]);

  // Versandstand aus dem Versandprotokoll (nur Rechnungen, die noch gelten)
  const versand = useMemo(() => {
    const gueltig = rechnungen.filter((r) => r.status !== 'storniert');
    const stand = gueltig.map((r) => ({ r, v: versandStandFuer(versandKarte, r) }));
    return {
      versendet: stand.filter((x) => x.v.stand === 'versendet').length,
      fehlgeschlagen: stand.filter((x) => x.v.stand === 'fehlgeschlagen').map((x) => x.r),
      keiner: stand.filter((x) => x.v.stand === 'keiner').length,
      zugferd: stand.filter((x) => x.v.stand === 'versendet' && x.v.format === 'zugferd').length,
      xrechnung: stand.filter((x) => x.v.stand === 'versendet' && x.v.format === 'xrechnung').length,
      nurPdf: stand.filter((x) => x.v.stand === 'versendet' && x.v.format === 'pdf').length,
    };
  }, [rechnungen, versandKarte]);

  const zeile = (r: (typeof rechnungen)[number]) => (
    <li key={r.id}>
      <Link href={`/rechnungen/${r.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-black/5">
        <span className="font-medium whitespace-nowrap">{r.invoice_number}</span>
        <span className="truncate" style={{ color: WIN.textGedaempft }}>{r.customer_name}</span>
        <span className="ml-auto tabular-nums whitespace-nowrap">{eur(offenerBetrag(r))}</span>
        <span className="w-20 text-right whitespace-nowrap" style={{ color: WIN.textGedaempft }}>{r.due_date ? fmtDate(r.due_date) : '–'}</span>
      </Link>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" data-testid="faktura-kennzahlen">
        <Kachel ton="#2563eb" icon={<FileText className="h-5 w-5" />} titel="Offene Rechnungen" wert={String(kz.offenAnzahl)} unten={eur(kz.offenBetrag) + ' offen'} />
        <Kachel ton="#d97706" icon={<AlertTriangle className="h-5 w-5" />} titel="Überfällig" wert={String(kz.ueberfaelligAnzahl)} unten={eur(kz.ueberfaelligBetrag)} />
        <Kachel ton="#16a34a" icon={<CheckCircle2 className="h-5 w-5" />} titel="Zahlungseingänge (Monat)" wert={eur(kz.bezahltMonatBetrag)} unten={`${kz.bezahltMonatAnzahl} Rechnung${kz.bezahltMonatAnzahl === 1 ? '' : 'en'}`} />
        <Kachel ton="#e8590c" icon={<BarChart3 className="h-5 w-5" />} titel={`Umsatz ${heute.slice(0, 4)} (netto)`} wert={eur(kz.umsatzJahr)}
          unten={kz.umsatzVeraenderungProzent === null ? 'kein Vorjahresvergleich' : `${kz.umsatzVeraenderungProzent >= 0 ? '+' : ''}${String(kz.umsatzVeraenderungProzent).replace('.', ',')} % zum Vorjahr`} />
      </div>

      <Karte titel="Braucht Aufmerksamkeit" icon={<BellRing className="h-4 w-4" style={{ color: WIN.akzent }} />}>
        <div data-testid="aufmerksamkeit" className="space-y-3">
          {ueberfaellig.length === 0 && bald.length === 0 && entwuerfe.length === 0 && versand.fehlgeschlagen.length === 0 && (
            <p className="text-[13px]" style={{ color: WIN.textGedaempft }}>Nichts Dringendes: keine überfälligen Rechnungen, nichts in den nächsten 7 Tagen fällig, keine offenen Entwürfe.</p>
          )}
          {versand.fehlgeschlagen.length > 0 && (
            <div data-testid="versand-fehlgeschlagen">
              <p className="text-[12px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#b42318' }}>Versand fehlgeschlagen ({versand.fehlgeschlagen.length})</p>
              <ul>{versand.fehlgeschlagen.slice(0, 5).map(zeile)}</ul>
              <p className="px-2 text-[12px]" style={{ color: WIN.textGedaempft }}>Die Rechnung ist nicht beim Kunden angekommen. Im Rechnungsdetail steht der Fehler im Versandprotokoll; dort lässt sich erneut senden.</p>
            </div>
          )}
          {ueberfaellig.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide mb-1" style={{ color: '#b42318' }}>Überfällig ({ueberfaellig.length})</p>
              <ul>{ueberfaellig.slice(0, 5).map(zeile)}</ul>
              {ueberfaellig.length > 5 && <BereichLink bereich="zahlungen" onBereich={onBereich} className="text-[13px] underline px-2" style={{ color: WIN.akzent }}>alle {ueberfaellig.length} ansehen</BereichLink>}
            </div>
          )}
          {bald.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide mb-1" style={{ color: WIN.textGedaempft }}>In den nächsten 7 Tagen fällig ({bald.length})</p>
              <ul>{bald.slice(0, 5).map(zeile)}</ul>
            </div>
          )}
          {entwuerfe.length > 0 && (
            <p className="text-[13px]">
              <BereichLink bereich="rechnungen" extra={{ reiter: 'entwuerfe' }} onBereich={onBereich} className="underline" style={{ color: WIN.akzent }}>{entwuerfe.length} Entwurf{entwuerfe.length === 1 ? '' : 'e'}</BereichLink>
              {' '}warten auf das Anlegen als Rechnung.
            </p>
          )}
        </div>
      </Karte>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <Karte className="lg:col-span-3" titel="Schnell erstellen" icon={<FilePlus2 className="h-4 w-4" style={{ color: WIN.akzent }} />}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { href: '/rechnungen?neu=1', icon: <ReceiptText className="h-5 w-5" />, t: 'Rechnung', s: 'frei', ziel: 'rechnung' as const },
              { href: '/kunden', icon: <Layers className="h-5 w-5" />, t: 'Abschlag', s: 'Teilleistung, am Auftrag', ziel: 'abschlag' as const },
              { href: '/kunden', icon: <ClipboardList className="h-5 w-5" />, t: 'Schlussrechnung', s: 'Gesamtleistung, am Auftrag', ziel: 'schluss' as const },
              { href: '/kunden', icon: <Undo2 className="h-5 w-5" />, t: 'Gutschrift', s: 'Korrektur, am Auftrag', ziel: 'gutschrift' as const },
            ].map((a) => {
              const inhalt = (
                <>
                  <span className="flex justify-center mb-1" style={{ color: WIN.akzent }}>{a.icon}</span>
                  <span className="block text-[13px] font-semibold">{a.t}</span>
                  <span className="block text-[11.5px]" style={{ color: WIN.textGedaempft }}>{a.s}</span>
                </>
              );
              const kl = 'rounded-lg border p-3 text-center hover:bg-black/5';
              // Im Kundenordner öffnet sich alles an Ort und Stelle: Rechnung (Formular), Abschlag/Schluss (Dialog), Gutschrift (Aufträge abrechnen).
              if (imKundenordner && a.ziel) return <button key={a.t} type="button" onClick={() => onSchnell?.(a.ziel)} className={kl} style={{ borderColor: WIN.randHell }}>{inhalt}</button>;
              return <Link key={a.t} href={a.ziel === 'rechnung' ? a.href : '/kunden'} className={kl} style={{ borderColor: WIN.randHell }}>{inhalt}</Link>;
            })}
          </div>
        </Karte>
        <Karte className="lg:col-span-2" titel="Versand & E-Rechnung" icon={<Mail className="h-4 w-4" style={{ color: WIN.akzent }} />}>
          <ul className="space-y-1.5 text-[13px]" style={{ color: WIN.text }} data-testid="versand-stand">
            <li>✅ {versand.versendet} versendet{versand.versendet > 0 ? ` (${versand.zugferd} ZUGFeRD, ${versand.xrechnung} XRechnung, ${versand.nurPdf} nur als normale PDF)` : ''}</li>
            <li style={{ color: versand.fehlgeschlagen.length ? '#b42318' : undefined }}>{versand.fehlgeschlagen.length ? '❌' : '✓'} {versand.fehlgeschlagen.length} Versand fehlgeschlagen</li>
            <li style={{ color: WIN.textGedaempft }}>{versand.keiner} ohne Eintrag im Versandprotokoll (vor dem Protokoll oder außerhalb von SCAFFOLD OS verschickt – das ist nicht erkennbar)</li>
            <li style={{ color: WIN.textGedaempft }}>Format wählst du beim Senden: ZUGFeRD, XRechnung oder nur PDF. Geht die E-Rechnung nicht, wird nichts versendet.</li>
            {versandHinweis && <li className="text-amber-800">⚠️ {versandHinweis}</li>}
          </ul>
        </Karte>
      </div>
    </div>
  );
}
