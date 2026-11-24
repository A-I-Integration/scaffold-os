'use client';

import { useCallback, useEffect, useState } from 'react';
import { Euro } from 'lucide-react';
import { stundenlohnAm, type Stundenlohn } from '@/lib/stundenlohn';

// ============================================================
// SCAFFOLD OS – Stundenlohn je Mitarbeiter (Bereich Personal)
// Aktueller Stundenlohn mit Gültigkeitsdatum; frühere Löhne bleiben als Verlauf erhalten. Nur für den Chef sichtbar (die Route prüft das).
// Es gibt keine vorbelegten Werte, der Betrieb trägt seine Löhne selbst ein.
// ============================================================

interface Props { employees: { id: string; first_name: string; last_name: string }[] }

const heute = () => new Date().toLocaleDateString('sv-SE');
const de = (iso: string) => iso.split('-').reverse().join('.');
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const inputCls = 'w-full rounded-lg bg-[#f5f5f7] border border-black/10 px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:border-[#e8590c] focus:outline-none';

export default function StundenlohnBlock({ employees }: Props) {
  const [empId, setEmpId] = useState('');
  const [loehne, setLoehne] = useState<Stundenlohn[]>([]);
  const [verboten, setVerboten] = useState(false);
  const [lohn, setLohn] = useState('');
  const [ab, setAb] = useState(heute());
  const [notiz, setNotiz] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async (id: string) => {
    if (!id) { setLoehne([]); return; }
    const res = await fetch(`/api/mitarbeiter-lohn?employee_id=${id}`, { cache: 'no-store' });
    if (res.status === 403) { setVerboten(true); return; }
    const j = await res.json().catch(() => ({}));
    if (j.success) setLoehne(j.loehne || []);
    else setMeldung({ ok: false, text: j.error || 'Löhne konnten nicht geladen werden.' });
  }, []);
  useEffect(() => { setMeldung(null); laden(empId); }, [empId, laden]);

  async function speichern() {
    setLaeuft(true); setMeldung(null);
    try {
      const res = await fetch('/api/mitarbeiter-lohn', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employee_id: empId, stundenlohn: lohn, gueltig_ab: ab, notiz }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) { setMeldung({ ok: false, text: j.error || 'Speichern fehlgeschlagen' }); return; }
      setLohn(''); setNotiz(''); await laden(empId);
      setMeldung({ ok: true, text: 'Stundenlohn gespeichert.' });
    } catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler beim Speichern' }); }
    finally { setLaeuft(false); }
  }

  async function loeschen(id: string) {
    setLaeuft(true); setMeldung(null);
    const res = await fetch(`/api/mitarbeiter-lohn?id=${id}`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    setLaeuft(false);
    if (!res.ok || !j.success) { setMeldung({ ok: false, text: j.error || 'Löschen fehlgeschlagen' }); return; }
    await laden(empId);
  }

  if (verboten) return (
    <section className="bg-white border border-black/5 rounded-2xl p-5" data-testid="stundenlohn-gesperrt">
      <h2 className="text-lg font-semibold flex items-center gap-2"><Euro className="w-5 h-5 text-[#e8590c]" /> Stundenlohn</h2>
      <p className="text-sm text-[#86868b] mt-1">Löhne sehen und pflegen kann nur der Chef.</p>
    </section>
  );

  const aktuell = stundenlohnAm(loehne, heute());
  return (
    <section className="bg-white border border-black/5 rounded-2xl p-5 space-y-4" data-testid="stundenlohn-block">
      <h2 className="text-lg font-semibold flex items-center gap-2"><Euro className="w-5 h-5 text-[#e8590c]" /> Stundenlohn</h2>
      <p className="text-sm text-[#86868b]">Aktueller Stundenlohn je Mitarbeiter mit Gültigkeitsdatum. Eine Lohnänderung ist ein neuer Eintrag ab einem Datum, der bisherige Lohn bleibt im Verlauf. Grundlage für die Lohnkosten je Baustelle.</p>
      <select value={empId} onChange={(e) => setEmpId(e.target.value)} className={inputCls} aria-label="Mitarbeiter für den Stundenlohn" data-testid="stundenlohn-mitarbeiter">
        <option value="">– Mitarbeiter wählen –</option>
        {employees.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>)}
      </select>
      {empId && (
        <>
          <p className="text-sm" data-testid="stundenlohn-aktuell">Aktuell: <strong>{aktuell === null ? 'noch kein Lohn hinterlegt' : eur(aktuell) + ' pro Stunde'}</strong></p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input value={lohn} onChange={(e) => setLohn(e.target.value)} inputMode="decimal" placeholder="Stundenlohn in € (z. B. 18,50)" className={inputCls} aria-label="Stundenlohn" data-testid="stundenlohn-wert" />
            <input type="date" value={ab} onChange={(e) => setAb(e.target.value)} className={inputCls} aria-label="Gilt ab" data-testid="stundenlohn-ab" />
            <input value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="Notiz (optional)" className={inputCls} aria-label="Notiz" />
            <button type="button" onClick={speichern} disabled={laeuft || !lohn.trim()} className="rounded-lg bg-[#e8590c] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" data-testid="stundenlohn-speichern">{laeuft ? 'Speichert …' : 'Speichern'}</button>
          </div>
          {loehne.length > 0 && (
            <table className="w-full text-sm" data-testid="stundenlohn-verlauf">
              <thead><tr className="text-left text-[11px] uppercase text-[#86868b]"><th className="font-normal">Gilt ab</th><th className="font-normal">Stundenlohn</th><th className="font-normal">Notiz</th><th /></tr></thead>
              <tbody>
                {loehne.map((l) => (
                  <tr key={l.id} className="border-t border-black/5">
                    <td className="py-1.5">{de(l.gueltig_ab)}</td><td>{eur(Number(l.stundenlohn))}</td><td className="text-[#86868b]">{l.notiz || ''}</td>
                    <td className="text-right"><button type="button" onClick={() => loeschen(l.id)} disabled={laeuft} className="text-xs text-red-600 hover:underline">löschen</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {meldung && <p className={`text-sm ${meldung.ok ? 'text-emerald-700' : 'text-red-600'}`}>{meldung.ok ? '✅' : '❌'} {meldung.text}</p>}
    </section>
  );
}
