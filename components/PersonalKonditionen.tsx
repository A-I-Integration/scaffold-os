'use client';

import { useCallback, useEffect, useState } from 'react';
import StundenlohnBlock from '@/components/StundenlohnBlock';
import UrlaubskontoKarte from '@/components/UrlaubskontoKarte';
import BetriebskalenderBlock from '@/components/BetriebskalenderBlock';
import { SONDERZAHLUNG_ARTEN, SONDERZAHLUNG_LABEL, urlaubsanspruchAm } from '@/lib/konditionen';

// ============================================================
// SCAFFOLD OS – Reiter „Lohn & Konditionen“ (nur Chef; die Routen prüfen das)
// Stundenlohn, erster Arbeitstag, Urlaubsanspruch, Kündigungsfrist/Probezeit und Sonderzahlungen je Mitarbeiter.
// ============================================================

interface Ma { id: string; first_name: string; last_name: string }
interface Urlaub { id: string; tage_pro_jahr: number; gueltig_ab: string; notiz: string | null }
interface Sonder { id: string; art: string; bezeichnung: string | null; betrag: number | null; monat: string; notiz: string | null }

const heute = () => new Date().toLocaleDateString('sv-SE');
const de = (iso: string) => iso.split('-').reverse().join('.');
const monatDe = (m: string) => { const [j, mm] = m.split('-'); return `${mm}/${j}`; };
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const zahlDe = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const inputCls = 'w-full rounded-lg bg-[#f5f5f7] border border-black/10 px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:border-[#e8590c] focus:outline-none';
const kasten = 'bg-white border border-black/5 rounded-2xl p-5 space-y-3';

export default function PersonalKonditionen({ employees }: { employees: Ma[] }) {
  const [empId, setEmpId] = useState('');
  const [verboten, setVerboten] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [stand, setStand] = useState(0);

  const [eintritt, setEintritt] = useState('');
  const [frist, setFrist] = useState('');
  const [probe, setProbe] = useState('');
  const [kNotiz, setKNotiz] = useState('');
  const [urlaub, setUrlaub] = useState<Urlaub[]>([]);
  const [sonder, setSonder] = useState<Sonder[]>([]);
  const [uTage, setUTage] = useState('');
  const [uAb, setUAb] = useState(heute());
  const [sArt, setSArt] = useState('');
  const [sBez, setSBez] = useState('');
  const [sBetrag, setSBetrag] = useState('');
  const [sMonat, setSMonat] = useState(heute().slice(0, 7));
  const [sNotiz, setSNotiz] = useState('');

  const laden = useCallback(async (id: string) => {
    if (!id) return;
    const res = await fetch(`/api/mitarbeiter-konditionen?employee_id=${id}`, { cache: 'no-store' });
    if (res.status === 403) { setVerboten(true); return; }
    const j = await res.json().catch(() => ({}));
    if (!j.success) { setMeldung({ ok: false, text: j.error || 'Laden fehlgeschlagen' }); return; }
    setEintritt(j.eintrittsdatum || ''); setFrist(j.konditionen?.kuendigungsfrist || ''); setProbe(j.konditionen?.probezeit_ende || ''); setKNotiz(j.konditionen?.notiz || '');
    setUrlaub(j.urlaub || []); setSonder(j.sonderzahlungen || []); setStand(x => x + 1);
  }, []);
  useEffect(() => { setMeldung(null); setSArt(''); laden(empId); }, [empId, laden]);

  async function senden(body: Record<string, unknown>, okText: string): Promise<boolean> {
    setLaeuft(true); setMeldung(null);
    try {
      const res = await fetch('/api/mitarbeiter-konditionen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: empId, ...body }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) { setMeldung({ ok: false, text: j.error || 'Speichern fehlgeschlagen' }); return false; }
      await laden(empId); setMeldung({ ok: true, text: okText }); return true;
    } catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler beim Speichern' }); return false; }
    finally { setLaeuft(false); }
  }
  async function loeschen(typ: 'urlaub' | 'sonderzahlung', id: string) {
    setLaeuft(true); setMeldung(null);
    const res = await fetch(`/api/mitarbeiter-konditionen?typ=${typ}&id=${id}`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    setLaeuft(false);
    if (!res.ok || !j.success) { setMeldung({ ok: false, text: j.error || 'Löschen fehlgeschlagen' }); return; }
    await laden(empId);
  }

  if (verboten) return <section className={kasten} data-testid="konditionen-gesperrt"><p className="text-sm text-[#86868b]">Lohn und Konditionen sieht und pflegt nur der Chef.</p></section>;

  const anspruch = urlaubsanspruchAm(urlaub, heute());
  return (
    <div className="space-y-6" data-testid="personal-konditionen">
      <BetriebskalenderBlock />
      <section className={kasten}>
        <h2 className="text-lg font-semibold">💶 Lohn & Konditionen</h2>
        <select value={empId} onChange={e => setEmpId(e.target.value)} className={inputCls + ' md:max-w-sm'} data-testid="konditionen-mitarbeiter" aria-label="Mitarbeiter">
          <option value="">– Mitarbeiter wählen –</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.last_name}, {e.first_name}</option>)}
        </select>
      </section>

      {empId && (
        <>
          <StundenlohnBlock employees={employees} festerMitarbeiter={empId} />

          <section className={kasten} data-testid="konditionen-eintritt">
            <h3 className="font-semibold">Eintritt, Urlaub, Kündigung</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div><label className="block text-xs text-[#86868b] mb-1">Erster Arbeitstag</label>
                <input type="date" value={eintritt} onChange={e => setEintritt(e.target.value)} className={inputCls} data-testid="konditionen-eintritt-datum" /></div>
              <div><label className="block text-xs text-[#86868b] mb-1">Urlaubsanspruch pro Jahr (aktuell)</label>
                <p className="py-2 text-sm font-semibold" data-testid="konditionen-urlaub-aktuell">{anspruch === null ? 'noch nicht hinterlegt' : `${zahlDe(anspruch)} Tage pro Jahr`}</p></div>
              <div><label className="block text-xs text-[#86868b] mb-1">Ende der Probezeit</label>
                <input type="date" value={probe} onChange={e => setProbe(e.target.value)} className={inputCls} /></div>
              <div><label className="block text-xs text-[#86868b] mb-1">Kündigungsfrist</label>
                <input value={frist} onChange={e => setFrist(e.target.value)} placeholder="so wie im Arbeitsvertrag" className={inputCls} data-testid="konditionen-frist" /></div>
            </div>
            <input value={kNotiz} onChange={e => setKNotiz(e.target.value)} placeholder="Notiz (optional)" className={inputCls} />
            <button type="button" disabled={laeuft} onClick={() => senden({ typ: 'konditionen', eintrittsdatum: eintritt, kuendigungsfrist: frist, probezeit_ende: probe, notiz: kNotiz }, 'Konditionen gespeichert.')}
              className="rounded-lg bg-[#e8590c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" data-testid="konditionen-speichern">Speichern</button>

            <UrlaubskontoKarte key={stand} employeeId={empId} />
            <h4 className="text-sm font-semibold pt-2">Urlaubsanspruch ändern</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input value={uTage} onChange={e => setUTage(e.target.value)} inputMode="decimal" placeholder="Tage pro Jahr (z. B. 30)" className={inputCls} data-testid="konditionen-urlaub-tage" />
              <input type="date" value={uAb} onChange={e => setUAb(e.target.value)} className={inputCls} aria-label="Gilt ab" />
              <button type="button" disabled={laeuft || !uTage.trim()} onClick={async () => { if (await senden({ typ: 'urlaub', tage_pro_jahr: uTage, gueltig_ab: uAb }, 'Urlaubsanspruch gespeichert.')) setUTage(''); }}
                className="rounded-lg bg-black/10 hover:bg-black/15 px-3 py-2 text-sm font-medium disabled:opacity-60" data-testid="konditionen-urlaub-speichern">Anspruch ab Datum speichern</button>
            </div>
            {urlaub.length > 0 && (
              <ul className="text-sm space-y-1" data-testid="konditionen-urlaub-verlauf">
                {urlaub.map(u => <li key={u.id} className="flex justify-between border-t border-black/5 pt-1"><span>ab {de(u.gueltig_ab)}: {zahlDe(Number(u.tage_pro_jahr))} Tage pro Jahr</span><button type="button" onClick={() => loeschen('urlaub', u.id)} className="text-xs text-red-600 hover:underline">löschen</button></li>)}
              </ul>
            )}
          </section>

          <section className={kasten} data-testid="konditionen-sonder">
            <h3 className="font-semibold">Sonderzahlungen und besondere Lohnbestandteile</h3>
            <p className="text-sm text-[#86868b]">Art anklicken, Monat wählen, für den die Zahlung gilt, Betrag eintragen (optional) und speichern.</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Art der Zahlung">
              {SONDERZAHLUNG_ARTEN.map(a => (
                <button key={a.value} type="button" aria-pressed={sArt === a.value} onClick={() => setSArt(a.value)} data-testid={`sonder-art-${a.value}`}
                  className={`rounded-full px-3 py-1.5 text-sm border transition ${sArt === a.value ? 'bg-[#e8590c] text-white border-[#e8590c]' : 'bg-[#f5f5f7] text-[#424245] border-black/10 hover:bg-black/10'}`}>{a.label}</button>
              ))}
            </div>
            {sArt && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div><label className="block text-xs text-[#86868b] mb-1">Für Monat</label><input type="month" value={sMonat} onChange={e => setSMonat(e.target.value)} className={inputCls} data-testid="sonder-monat" /></div>
                <div><label className="block text-xs text-[#86868b] mb-1">Betrag in € (optional)</label><input value={sBetrag} onChange={e => setSBetrag(e.target.value)} inputMode="decimal" className={inputCls} data-testid="sonder-betrag" /></div>
                <div><label className="block text-xs text-[#86868b] mb-1">{sArt === 'sonstiges' ? 'Bezeichnung *' : 'Bezeichnung (optional)'}</label><input value={sBez} onChange={e => setSBez(e.target.value)} className={inputCls} data-testid="sonder-bezeichnung" /></div>
                <div><label className="block text-xs text-[#86868b] mb-1">Notiz</label><input value={sNotiz} onChange={e => setSNotiz(e.target.value)} className={inputCls} /></div>
                <div className="md:col-span-4">
                  <button type="button" disabled={laeuft} data-testid="sonder-speichern" className="rounded-lg bg-[#e8590c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    onClick={async () => { if (await senden({ typ: 'sonderzahlung', art: sArt, bezeichnung: sBez, betrag: sBetrag, monat: sMonat, notiz: sNotiz }, 'Sonderzahlung gespeichert.')) { setSBez(''); setSBetrag(''); setSNotiz(''); setSArt(''); } }}>Sonderzahlung speichern</button>
                </div>
              </div>
            )}
            {sonder.length > 0 ? (
              <table className="w-full text-sm" data-testid="sonder-liste">
                <thead><tr className="text-left text-[11px] uppercase text-[#86868b]"><th className="font-normal">Monat</th><th className="font-normal">Art</th><th className="font-normal">Betrag</th><th className="font-normal">Notiz</th><th /></tr></thead>
                <tbody>{sonder.map(s => (
                  <tr key={s.id} className="border-t border-black/5">
                    <td className="py-1.5">{monatDe(s.monat)}</td>
                    <td>{SONDERZAHLUNG_LABEL[s.art] || s.art}{s.bezeichnung ? `: ${s.bezeichnung}` : ''}</td>
                    <td>{s.betrag != null ? eur(Number(s.betrag)) : '–'}</td><td className="text-[#86868b]">{s.notiz || ''}</td>
                    <td className="text-right"><button type="button" onClick={() => loeschen('sonderzahlung', s.id)} className="text-xs text-red-600 hover:underline">löschen</button></td>
                  </tr>))}</tbody>
              </table>
            ) : <p className="text-sm text-[#86868b]">Noch keine Sonderzahlungen eingetragen.</p>}
          </section>
        </>
      )}
      {meldung && <p className={`text-sm ${meldung.ok ? 'text-emerald-700' : 'text-red-600'}`} data-testid="konditionen-meldung">{meldung.ok ? '✅' : '❌'} {meldung.text}</p>}
    </div>
  );
}
