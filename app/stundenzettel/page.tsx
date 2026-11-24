'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Download } from 'lucide-react';
import { baueStundenzettel, monatsGrenzen, type ZeitBuchung } from '@/lib/stundenzettel';
import { erzeugeStundenzettelPdf, stundenzettelPdfDateiname, monatDe } from '@/lib/stundenzettel-pdf';

// ============================================================
// SCAFFOLD OS – Stundenzettel (Bereich Personal)
// Je Mitarbeiter und Monat aus den Zeitbuchungen: Tage mit Von/Bis, Pause, Netto-Stunden, Baustelle, Fahrzeit, Spesen, Summen; als PDF zum
// Unterschreiben. Mitarbeiter sehen nur den eigenen Stundenzettel. Nur der Chef sieht zusätzlich die Lohnkosten je Baustelle.
// ============================================================

interface Buchung extends ZeitBuchung { employee?: { id: string; first_name: string; last_name: string } | null }
interface LohnkostenAntwort {
  baustellen: { projectId: string | null; name: string; stunden: number; kosten: number; mitarbeiter: { employeeId: string; name: string; stunden: number; kosten: number }[] }[]
  ohneLohn: { stunden: number; mitarbeiter: { employeeId: string; name: string; stunden: number }[] }
  summe: { stunden: number; kosten: number }
}

const aktuellerMonat = () => new Date().toLocaleDateString('sv-SE').slice(0, 7);
const de = (iso: string) => iso.split('-').reverse().join('.');
const nm = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const inputCls = 'rounded-lg bg-[#f5f5f7] border border-black/10 px-3 py-2 text-sm text-[#1d1d1f] focus:border-[#e8590c] focus:outline-none';

export default function StundenzettelPage() {
  const [monat, setMonat] = useState(aktuellerMonat());
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [projekte, setProjekte] = useState<Record<string, string>>({});
  const [empId, setEmpId] = useState('');
  const [fehler, setFehler] = useState('');
  const [laedt, setLaedt] = useState(true);
  const [kosten, setKosten] = useState<LohnkostenAntwort | null>(null);
  const [meldung, setMeldung] = useState('');

  const laden = useCallback(async () => {
    const g = monatsGrenzen(monat);
    if (!g) return;
    setLaedt(true); setFehler(''); setKosten(null);
    try {
      const res = await fetch(`/api/time-entries?from=${g.von}&to=${g.bis}`, { cache: 'no-store' });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Zeiten konnten nicht geladen werden');
      setBuchungen(j.entries || []);
      const k = await fetch(`/api/lohnkosten?monat=${monat}`, { cache: 'no-store' });
      if (k.ok) { const kj = await k.json(); if (kj.success) setKosten(kj); }
    } catch (e: any) { setFehler(e?.message || 'Fehler beim Laden'); }
    setLaedt(false);
  }, [monat]);
  useEffect(() => { laden(); }, [laden]);
  useEffect(() => {
    fetch('/api/projects').then((r) => r.json()).then((j) => {
      if (j.success) setProjekte(Object.fromEntries((j.projects || []).map((p: any) => [p.id, p.name])));
    }).catch(() => {});
  }, []);

  const mitarbeiter = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of buchungen) if (b.employee) m.set(b.employee_id, `${b.employee.first_name} ${b.employee.last_name}`.trim());
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de'));
  }, [buchungen]);
  useEffect(() => { if (!empId || !mitarbeiter.some(([id]) => id === empId)) setEmpId(mitarbeiter[0]?.[0] ?? ''); }, [mitarbeiter, empId]);

  const zettel = useMemo(() => baueStundenzettel(buchungen.filter((b) => b.employee_id === empId), monat), [buchungen, empId, monat]);
  const projektName = (id: string | null) => (id ? projekte[id] || 'Baustelle' : '–');
  const name = mitarbeiter.find(([id]) => id === empId)?.[1] || '';

  async function pdf() {
    setMeldung('');
    try {
      let firma: { name?: string; street?: string; zip?: string; city?: string } | null = null;
      try {
        const j = await (await fetch('/api/company')).json();
        if (j?.company) firma = { name: j.company.company_name, street: j.company.street, zip: j.company.zip, city: j.company.city };
      } catch { /* Firmendaten sind optional */ }
      erzeugeStundenzettelPdf({ mitarbeiter: name, zettel, projektName, firma }).save(stundenzettelPdfDateiname(name, monat));
    } catch (e: any) { setMeldung(e?.message || 'PDF konnte nicht erstellt werden'); }
  }

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2"><FileText className="w-7 h-7 text-[#e8590c]" /> Stundenzettel</h1>
          <p className="text-[#86868b] mt-1">Arbeitszeiten je Mitarbeiter und Monat aus der Zeiterfassung, als PDF zum Unterschreiben.</p>
        </header>

        <section className="bg-white border border-black/5 rounded-2xl p-5 space-y-4" data-testid="stundenzettel-block">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-sm text-[#86868b]">Monat<input type="month" value={monat} onChange={(e) => setMonat(e.target.value)} className={inputCls + ' block mt-1'} data-testid="stundenzettel-monat" /></label>
            {mitarbeiter.length > 1 && (
              <label className="text-sm text-[#86868b]">Mitarbeiter
                <select value={empId} onChange={(e) => setEmpId(e.target.value)} className={inputCls + ' block mt-1'} data-testid="stundenzettel-mitarbeiter">
                  {mitarbeiter.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                </select>
              </label>
            )}
            <button type="button" onClick={pdf} disabled={!empId} className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#e8590c] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" data-testid="stundenzettel-pdf"><Download className="w-4 h-4" /> PDF</button>
          </div>
          {fehler && <p className="text-sm text-red-600">❌ {fehler}</p>}
          {meldung && <p className="text-sm text-red-600">❌ {meldung}</p>}
          {laedt ? <p className="text-sm text-[#86868b]">Lädt …</p> : !empId ? (
            <p className="text-sm text-[#86868b]" data-testid="stundenzettel-leer">Für {monatDe(monat)} gibt es keine Zeitbuchungen.</p>
          ) : (
            <>
              <p className="text-sm"><strong>{name}</strong> · {monatDe(monat)}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="stundenzettel-tabelle">
                  <thead><tr className="text-left text-[11px] uppercase text-[#86868b]">
                    <th className="font-normal pr-3">Datum</th><th className="font-normal pr-3">Von</th><th className="font-normal pr-3">Bis</th><th className="font-normal pr-3">Pause</th>
                    <th className="font-normal text-right pr-3">Stunden</th><th className="font-normal pr-3">Baustelle</th><th className="font-normal pr-3">Fahrzeit</th><th className="font-normal text-right">Spesen</th>
                  </tr></thead>
                  <tbody>
                    {zettel.zeilen.map((z, i) => (
                      <tr key={i} className="border-t border-black/5">
                        <td className="py-1.5 pr-3 whitespace-nowrap">{de(z.datum)}</td><td className="pr-3">{z.von || '–'}</td><td className="pr-3">{z.bis || (z.offen ? 'läuft' : '–')}</td>
                        <td className="pr-3">{z.pauseMin ? `${z.pauseMin} min` : '–'}</td><td className="text-right pr-3">{nm(z.stunden)}</td><td className="pr-3">{projektName(z.projektId)}</td>
                        <td className="pr-3">{z.fahrzeitMin ? hm(z.fahrzeitMin) : '–'}</td><td className="text-right">{z.spesen ? nm(z.spesen) : '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t border-black/20 font-semibold" data-testid="stundenzettel-summe">
                    <td className="py-1.5 pr-3">{zettel.summe.tage} Tage</td><td /><td /><td className="pr-3">{zettel.summe.pauseMin} min</td><td className="text-right pr-3">{nm(zettel.summe.stunden)}</td><td /><td className="pr-3">{hm(zettel.summe.fahrzeitMin)}</td><td className="text-right">{nm(zettel.summe.spesen)}</td>
                  </tr></tfoot>
                </table>
              </div>
            </>
          )}
        </section>

        {kosten && (
          <section className="bg-white border border-black/5 rounded-2xl p-5 space-y-3" data-testid="lohnkosten-block">
            <h2 className="text-lg font-semibold">Lohnkosten je Baustelle · {monatDe(monat)}</h2>
            <p className="text-sm text-[#86868b]">Netto-Stunden × Stundenlohn, der am Arbeitstag galt. Direkte Lohnkosten ohne Arbeitgeberanteile und Zuschläge. Nur für den Chef sichtbar.</p>
            {kosten.baustellen.length === 0 ? <p className="text-sm text-[#86868b]">Für diesen Monat sind keine bewerteten Stunden vorhanden.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase text-[#86868b]"><th className="font-normal">Baustelle</th><th className="font-normal text-right">Stunden</th><th className="font-normal text-right">Lohnkosten</th></tr></thead>
                <tbody>
                  {kosten.baustellen.map((b, i) => (
                    <tr key={i} className="border-t border-black/5 align-top">
                      <td className="py-1.5">{b.name}<span className="block text-[11px] text-[#86868b]">{b.mitarbeiter.map((m) => `${m.name} ${nm(m.stunden)} h`).join(' · ')}</span></td>
                      <td className="text-right">{nm(b.stunden)}</td><td className="text-right">{nm(b.kosten)} €</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t border-black/20 font-semibold"><td className="py-1.5">Summe bewertet</td><td className="text-right">{nm(kosten.summe.stunden - kosten.ohneLohn.stunden)}</td><td className="text-right">{nm(kosten.summe.kosten)} €</td></tr></tfoot>
              </table>
            )}
            {kosten.ohneLohn.stunden > 0 && (
              <p className="text-sm text-[#e8590c]" data-testid="lohnkosten-ohne-lohn">⚠️ {nm(kosten.ohneLohn.stunden)} Stunden sind nicht bewertet, weil kein Stundenlohn hinterlegt ist: {kosten.ohneLohn.mitarbeiter.map((m) => `${m.name} (${nm(m.stunden)} h)`).join(', ')}. Bitte unter Personal → Mitarbeiter & Zugänge den Stundenlohn eintragen.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
