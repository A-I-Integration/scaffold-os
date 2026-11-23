'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, AlertTriangle, CheckCircle2, BarChart3, Plus, Search, FilePlus2, ClipboardList, Layers, ReceiptText, Undo2, Mail, Eye } from 'lucide-react';
import { WIN } from '@/components/win/Win';
import { fmtEur, fmtDate, type Invoice } from '@/lib/invoice-pdf';
import {
  type FakturaReiter, type FakturaFilter, type ZahlungKurz, REITER_LABEL, berechneKennzahlen, filtereRechnungen, zaehleJeReiter,
  anzeigeStatus, offenerBetrag, rechnungsJahre, monatsGrenzen, heuteIso, type AnzeigeStatus,
} from '@/lib/faktura-kennzahlen';

// ============================================================
// SCAFFOLD OS – Faktura (Übersicht): Kennzahlen, Reiter, Liste, Schnellstart
// Liest dieselben Daten wie /rechnungen (GET /api/invoices); Anlegen, Bearbeiten und Versand laufen
// unverändert über die bestehenden Seiten (Rechnungsdetail, Kundenakte, Aufmaß). Nichts wird hier doppelt gerechnet.
// ============================================================

const STATUS_STIL: Record<AnzeigeStatus, { label: string; bg: string; fg: string }> = {
  offen: { label: 'Offen', bg: '#fff4e5', fg: '#a65300' },
  ueberfaellig: { label: 'Überfällig', bg: '#fde8e8', fg: '#b42318' },
  teilbezahlt: { label: 'Teilbezahlt', bg: '#eef4ff', fg: '#1d4ed8' },
  bezahlt: { label: 'Bezahlt', bg: '#e7f6ec', fg: '#1a7f37' },
  storniert: { label: 'Storniert', bg: '#eeeeee', fg: '#605e5c' },
  gutschrift: { label: 'Gutschrift', bg: '#f3e8ff', fg: '#7e22ce' },
};
const ART_LABEL: Record<string, string> = { standard: 'Rechnung', abschlag: 'Abschlag', schluss: 'Schlussrechnung', gutschrift: 'Gutschrift' };
const REITER: FakturaReiter[] = ['alle', 'rechnungen', 'abschlag', 'schluss', 'gutschriften', 'entwuerfe'];
const knopf = 'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium hover:bg-black/5';

function Kachel({ icon, titel, wert, unten, ton }: { icon: React.ReactNode; titel: string; wert: string; unten?: React.ReactNode; ton: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 flex items-start gap-3" style={{ borderColor: WIN.rand }}>
      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: ton + '1a', color: ton }}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[13px]" style={{ color: WIN.textGedaempft }}>{titel}</p>
        <p className="text-2xl font-bold tabular-nums" style={{ color: WIN.text }}>{wert}</p>
        {unten && <p className="text-[13px] tabular-nums" style={{ color: WIN.textGedaempft }}>{unten}</p>}
      </div>
    </div>
  );
}

export default function FakturaPage() {
  const router = useRouter();
  const heute = useMemo(() => heuteIso(), []);
  const [rechnungen, setRechnungen] = useState<Invoice[]>([]);
  const [zahlungenMonat, setZahlungenMonat] = useState<ZahlungKurz[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [filter, setFilter] = useState<FakturaFilter>({ reiter: 'alle', suche: '', status: 'alle', jahr: heute.slice(0, 4) });

  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const { von, bis } = monatsGrenzen(heute);
        const [r, z] = await Promise.all([
          fetch('/api/invoices').then((x) => x.json()),
          fetch(`/api/invoice-payments?von=${von}&bis=${bis}`).then((x) => x.json()).catch(() => null),
        ]);
        if (!aktiv) return;
        if (!r?.success) throw new Error(r?.error || 'Rechnungen konnten nicht geladen werden');
        setRechnungen(r.invoices as Invoice[]);
        setZahlungenMonat(z?.success ? (z.payments as ZahlungKurz[]) : []);
      } catch (e) {
        if (aktiv) setFehler(e instanceof Error ? e.message : 'Fehler beim Laden');
      } finally {
        if (aktiv) setLaedt(false);
      }
    })();
    return () => { aktiv = false; };
  }, [heute]);

  const kz = useMemo(() => berechneKennzahlen(rechnungen, zahlungenMonat, heute), [rechnungen, zahlungenMonat, heute]);
  const jeReiter = useMemo(() => zaehleJeReiter(filter.jahr === 'alle' ? rechnungen : rechnungen.filter((r) => String(r.invoice_date || '').slice(0, 4) === filter.jahr)), [rechnungen, filter.jahr]);
  const jahre = useMemo(() => rechnungsJahre(rechnungen, heute), [rechnungen, heute]);
  const sichtbar = useMemo(() => filtereRechnungen(rechnungen, filter, heute), [rechnungen, filter, heute]);
  const eur = (n: number) => `${fmtEur(n)} €`;

  return (
    <div className="min-h-full" style={{ background: WIN.grund }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-white" style={{ borderColor: WIN.rand }}>
        <div>
          <h1 className="text-lg font-bold" style={{ color: WIN.text }}>Faktura</h1>
          <p className="text-[13px]" style={{ color: WIN.textGedaempft }}>Rechnungen, Abschläge und Zahlungen im Blick</p>
        </div>
        <div className="ml-auto relative w-full max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: WIN.textGedaempft }} />
          <input value={filter.suche} onChange={(e) => setFilter({ ...filter, suche: e.target.value })} placeholder="Kunde, Projektnummer, Rechnungsnummer …"
            className="w-full rounded-lg border bg-white pl-9 pr-3 py-2 text-sm focus:outline-none" style={{ borderColor: WIN.rand }} aria-label="Rechnungen durchsuchen" />
        </div>
      </div>

      <div className="p-4 space-y-4 max-w-[1400px]">
        {fehler && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">❌ {fehler}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3" data-testid="faktura-kennzahlen">
          <Kachel ton="#2563eb" icon={<FileText className="h-5 w-5" />} titel="Offene Rechnungen" wert={String(kz.offenAnzahl)} unten={eur(kz.offenBetrag) + ' offen'} />
          <Kachel ton="#d97706" icon={<AlertTriangle className="h-5 w-5" />} titel="Überfällig" wert={String(kz.ueberfaelligAnzahl)} unten={eur(kz.ueberfaelligBetrag)} />
          <Kachel ton="#16a34a" icon={<CheckCircle2 className="h-5 w-5" />} titel="Zahlungseingänge (Monat)" wert={eur(kz.bezahltMonatBetrag)} unten={`${kz.bezahltMonatAnzahl} Rechnung${kz.bezahltMonatAnzahl === 1 ? '' : 'en'}`} />
          <Kachel ton="#e8590c" icon={<BarChart3 className="h-5 w-5" />} titel={`Umsatz ${heute.slice(0, 4)} (netto)`} wert={eur(kz.umsatzJahr)}
            unten={kz.umsatzVeraenderungProzent === null ? 'kein Vorjahresvergleich' : `${kz.umsatzVeraenderungProzent >= 0 ? '+' : ''}${String(kz.umsatzVeraenderungProzent).replace('.', ',')} % zum Vorjahr`} />
        </div>

        <div className="rounded-xl border bg-white" style={{ borderColor: WIN.rand }}>
          <div className="flex flex-wrap gap-1 px-3 pt-2 border-b" style={{ borderColor: WIN.rand }} role="tablist">
            {REITER.map((k) => (
              <button key={k} role="tab" aria-selected={filter.reiter === k} onClick={() => setFilter({ ...filter, reiter: k })}
                className="px-3 py-2 text-[14px] -mb-px border-b-2"
                style={{ borderColor: filter.reiter === k ? WIN.akzent : 'transparent', color: filter.reiter === k ? WIN.akzent : WIN.text, fontWeight: filter.reiter === k ? 600 : 400 }}>
                {REITER_LABEL[k]} <span className="text-[12px] opacity-60">{jeReiter[k]}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 p-3">
            <Link href="/rechnungen?neu=1" className={`${knopf} text-white`} style={{ background: WIN.akzent, borderColor: WIN.akzent }}><Plus className="h-4 w-4" /> Neue Rechnung</Link>
            <Link href="/aufmass" className={knopf} style={{ borderColor: WIN.rand }}><ClipboardList className="h-4 w-4" /> Aus Aufmaß</Link>
            <Link href="/kunden" className={knopf} style={{ borderColor: WIN.rand }}><Layers className="h-4 w-4" /> Aus Auftrag</Link>
            <span className="ml-auto flex items-center gap-2">
              <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as FakturaFilter['status'] })} className="rounded-lg border bg-white px-3 py-2 text-[13px]" style={{ borderColor: WIN.rand }} aria-label="Status filtern">
                <option value="alle">Alle Status</option><option value="offen">Offen</option><option value="ueberfaellig">Überfällig</option><option value="bezahlt">Bezahlt</option><option value="storniert">Storniert</option>
              </select>
              <select value={filter.jahr} onChange={(e) => setFilter({ ...filter, jahr: e.target.value })} className="rounded-lg border bg-white px-3 py-2 text-[13px]" style={{ borderColor: WIN.rand }} aria-label="Jahr wählen">
                <option value="alle">Alle Jahre</option>
                {jahre.map((j) => <option key={j} value={j}>{j === heute.slice(0, 4) ? 'Dieses Jahr' : j}</option>)}
              </select>
            </span>
          </div>

          {filter.reiter === 'entwuerfe' ? (
            <p className="px-4 pb-6 pt-2 text-sm" style={{ color: WIN.textGedaempft }} data-testid="entwuerfe-leer">
              Entwürfe folgen mit dem nächsten Bundle (Rechnung speichern, ohne eine Rechnungsnummer zu vergeben). Heute bekommt jede neue Rechnung sofort ihre endgültige Nummer.
            </p>
          ) : laedt ? (
            <p className="px-4 pb-6 text-sm" style={{ color: WIN.textGedaempft }}>Lade …</p>
          ) : sichtbar.length === 0 ? (
            <p className="px-4 pb-6 text-sm" style={{ color: WIN.textGedaempft }} data-testid="faktura-leer">Keine Rechnungen für diese Auswahl.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]" data-testid="faktura-liste">
                <thead>
                  <tr className="text-left text-[12px] uppercase tracking-wide border-y" style={{ color: WIN.textGedaempft, borderColor: WIN.randHell, background: '#fafafa' }}>
                    <th className="px-3 py-2">Nr.</th><th className="px-3 py-2">Kunde / Projekt</th><th className="px-3 py-2">Art</th>
                    <th className="px-3 py-2 text-right">Netto</th><th className="px-3 py-2 text-right">Brutto</th><th className="px-3 py-2 text-right">Offen</th>
                    <th className="px-3 py-2">Status</th><th className="px-3 py-2">Fällig</th><th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sichtbar.map((r) => {
                    const st = STATUS_STIL[anzeigeStatus(r, heute)];
                    const offen = offenerBetrag(r);
                    return (
                      <tr key={r.id} onClick={() => router.push(`/rechnungen/${r.id}`)} className="border-b cursor-pointer hover:bg-[#f7f8fa]" style={{ borderColor: WIN.randHell }}>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.invoice_number}</td>
                        <td className="px-3 py-2.5"><span className="block">{r.customer_name}</span>{r.projektnummer && <span className="block text-[12px]" style={{ color: WIN.textGedaempft }}>{r.projektnummer}</span>}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{ART_LABEL[r.invoice_type || 'standard'] || 'Rechnung'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{eur(Number(r.net_amount))}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{eur(Number(r.gross_amount))}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{offen > 0 ? eur(offen) : '–'}</td>
                        <td className="px-3 py-2.5"><span className="rounded-md px-2 py-0.5 text-[12px] font-semibold" style={{ background: st.bg, color: st.fg }}>{st.label}</span></td>
                        <td className="px-3 py-2.5 whitespace-nowrap">{r.due_date ? fmtDate(r.due_date) : '–'}</td>
                        <td className="px-3 py-2.5"><Link href={`/rechnungen/${r.id}`} onClick={(e) => e.stopPropagation()} aria-label={`${r.invoice_number} öffnen`} className="p-1 rounded hover:bg-black/5 inline-flex"><Eye className="h-4 w-4" style={{ color: WIN.textGedaempft }} /></Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-3 rounded-xl border bg-white p-4" style={{ borderColor: WIN.rand }}>
            <p className="font-semibold mb-3 flex items-center gap-2" style={{ color: WIN.text }}><FilePlus2 className="h-4 w-4" style={{ color: WIN.akzent }} /> Schnell erstellen</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { href: '/rechnungen?neu=1', icon: <ReceiptText className="h-5 w-5" />, t: 'Rechnung', s: 'frei' },
                { href: '/kunden', icon: <Layers className="h-5 w-5" />, t: 'Abschlag', s: 'Teilleistung, in der Kundenakte' },
                { href: '/kunden', icon: <ClipboardList className="h-5 w-5" />, t: 'Schlussrechnung', s: 'Gesamtleistung, in der Kundenakte' },
                { href: '/kunden', icon: <Undo2 className="h-5 w-5" />, t: 'Gutschrift', s: 'Korrektur, in der Kundenakte' },
              ].map((a) => (
                <Link key={a.t} href={a.href} className="rounded-lg border p-3 text-center hover:bg-black/5" style={{ borderColor: WIN.randHell }}>
                  <span className="flex justify-center mb-1" style={{ color: WIN.akzent }}>{a.icon}</span>
                  <span className="block text-[13px] font-semibold">{a.t}</span>
                  <span className="block text-[11.5px]" style={{ color: WIN.textGedaempft }}>{a.s}</span>
                </Link>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 rounded-xl border bg-white p-4" style={{ borderColor: WIN.rand }}>
            <p className="font-semibold mb-2 flex items-center gap-2" style={{ color: WIN.text }}><Mail className="h-4 w-4" style={{ color: WIN.akzent }} /> Versand &amp; E-Rechnung</p>
            <ul className="space-y-1.5 text-[13px]" style={{ color: WIN.text }}>
              <li>✅ Versand per E-Mail aus dem Rechnungsdetail</li>
              <li>✅ ZUGFeRD beim Versand (bei Datenlücken Rückfall auf normale PDF mit Hinweis)</li>
              <li>⬇️ XRechnung als Download im Rechnungsdetail</li>
              <li style={{ color: WIN.textGedaempft }}>Folgt: Versandprotokoll, XRechnung als Anhang, Vorlagen</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
