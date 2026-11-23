'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ClipboardList, ExternalLink } from 'lucide-react';
import { WIN } from '@/components/win/Win';
import { baueAuftragsZeilen, type ProjektKurz, type RechnungMitProjekt } from '@/lib/faktura-auftraege';
import { type FakturaDaten, eur } from './daten';
import { knopf, kopfZeile } from './ui';

// „Aufmaß & Abrechnung“: eine Zeile je Auftrag mit dem Stand der Abrechnung. Gerechnet wird mit derselben Logik wie in der Kundenakte.
// Abschlag, Schlussrechnung, Zwischenaufmaß und Bauphasen werden dort am Auftrag gestellt – diese Übersicht führt direkt hin.
export default function FakturaAufmass({ daten }: { daten: FakturaDaten }) {
  const { heute, rechnungen } = daten;
  const [projekte, setProjekte] = useState<ProjektKurz[] | null>(null);
  const [kranSatz, setKranSatz] = useState(850);
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState('');

  useEffect(() => {
    let aktiv = true;
    (async () => {
      try {
        const [p, c] = await Promise.all([
          fetch('/api/projects').then((x) => x.json()),
          fetch('/api/company').then((x) => x.json()).catch(() => null),
        ]);
        if (!aktiv) return;
        if (!p?.success) throw new Error(p?.error || 'Aufträge konnten nicht geladen werden');
        setProjekte(p.projects as ProjektKurz[]);
        if (c?.success) setKranSatz(Number(c.company?.calc_crane_day) || 850);
      } catch (e) {
        if (aktiv) { setFehler(e instanceof Error ? e.message : 'Fehler beim Laden'); setProjekte([]); }
      }
    })();
    return () => { aktiv = false; };
  }, []);

  const zeilen = useMemo(() => {
    if (!projekte) return [];
    const z = baueAuftragsZeilen(projekte, rechnungen as unknown as RechnungMitProjekt[], kranSatz, heute);
    const q = suche.trim().toLowerCase();
    return q ? z.filter((x) => x.name.toLowerCase().includes(q)) : z;
  }, [projekte, rechnungen, kranSatz, heute, suche]);

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: WIN.rand }}>
      <div className="flex flex-wrap items-center gap-2 p-3">
        <p className="text-[13px]" style={{ color: WIN.textGedaempft }}>Auftragswert = Angebot + bestätigte Nachträge. Abgerechnet ohne stornierte Rechnungen.</p>
        <Link href="/aufmass" className={`${knopf} ml-auto`} style={{ borderColor: WIN.rand }}><ClipboardList className="h-4 w-4" /> Neues Aufmaß</Link>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Auftrag suchen …" aria-label="Aufträge durchsuchen" className="rounded-lg border bg-white px-3 py-2 text-[13px] w-56" style={{ borderColor: WIN.rand }} />
      </div>
      {fehler && <p className="mx-3 mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">❌ {fehler}</p>}
      {!projekte ? (
        <p className="px-4 pb-6 text-sm" style={{ color: WIN.textGedaempft }}>Lade …</p>
      ) : zeilen.length === 0 ? (
        <p className="px-4 pb-6 text-sm" style={{ color: WIN.textGedaempft }} data-testid="auftraege-leer">Keine Aufträge mit Angebot oder Rechnung gefunden.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]" data-testid="auftraege-liste">
            <thead>
              <tr className={kopfZeile} style={{ color: WIN.textGedaempft, borderColor: WIN.randHell, background: '#fafafa' }}>
                <th className="px-3 py-2">Auftrag</th><th className="px-3 py-2 text-right">Auftragswert</th><th className="px-3 py-2 text-right">Abgerechnet</th>
                <th className="px-3 py-2 text-right">%</th><th className="px-3 py-2 text-right">Noch abzurechnen</th><th className="px-3 py-2 text-right">Offen (brutto)</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.projektId} className="border-b" style={{ borderColor: WIN.randHell }}>
                  <td className="px-3 py-2.5"><span className="block font-medium">{z.name}</span><span className="block text-[12px]" style={{ color: WIN.textGedaempft }}>{z.anzahlRechnungen} Rechnung{z.anzahlRechnungen === 1 ? '' : 'en'}{z.hatAngebot ? '' : ' · ohne Angebot'}</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{z.auftragswert > 0 ? eur(z.auftragswert) : '–'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{eur(z.abgerechnet)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{z.prozentAbgerechnet === null ? '–' : `${String(z.prozentAbgerechnet).replace('.', ',')} %`}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-medium">{z.auftragswert > 0 ? eur(z.restZuAbrechnen) : '–'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap" style={{ color: z.ueberfaellig > 0 ? '#b42318' : undefined }}>{z.offenBrutto > 0 ? eur(z.offenBrutto) : '–'}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {z.kundeId
                      ? <Link href={`/kunden/${z.kundeId}?baustelle=${z.projektId}`} className={knopf} style={{ borderColor: WIN.rand }}>Abrechnen <ExternalLink className="h-3.5 w-3.5" /></Link>
                      : <span className="text-[12px]" style={{ color: WIN.textGedaempft }} title="Dieser Auftrag ist keinem Kunden zugeordnet">kein Kunde</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
