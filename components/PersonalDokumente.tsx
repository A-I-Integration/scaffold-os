'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DOKUMENT_KATEGORIEN, faelligkeit, faelligkeitText, sortiereNachFaelligkeit } from '@/lib/personal-dokumente';

// ============================================================
// SCAFFOLD OS – Reiter „Dokumente“
// Personalien, Lehrgänge, G-Untersuchungen, Führer-/Kranscheine mit Gültig-bis-Datum und Fälligkeitsübersicht.
// Chef und Disposition. Bei G-Untersuchungen nur die Bescheinigung ablegen, keine medizinischen Befunde.
// ============================================================

interface Dok { id: string; employee_id: string; kategorie: string; bezeichnung: string; ausgestellt_am: string | null; gueltig_bis: string | null; file_name: string | null; notiz: string | null; mitarbeiter?: string }
interface Ma { id: string; first_name: string; last_name: string }

const heute = () => new Date().toLocaleDateString('sv-SE');
const inputCls = 'w-full rounded-lg bg-[#f5f5f7] border border-black/10 px-3 py-2 text-sm text-[#1d1d1f] placeholder-[#86868b] focus:border-[#e8590c] focus:outline-none';
const farbe = { abgelaufen: 'bg-red-50 text-red-700 border-red-200', bald: 'bg-amber-50 text-amber-700 border-amber-200', gueltig: 'bg-emerald-50 text-emerald-700 border-emerald-200', unbefristet: 'bg-black/5 text-[#424245] border-black/10' } as const;

export default function PersonalDokumente({ employees }: { employees: Ma[] }) {
  const [alle, setAlle] = useState<Dok[]>([]);
  const [stammFristen, setStammFristen] = useState<{ schluessel: string; employee_id: string; mitarbeiter: string; was: string; gueltig_bis: string }[]>([]);
  const [empId, setEmpId] = useState('');
  const [kategorie, setKategorie] = useState('lehrgang');
  const [bezeichnung, setBezeichnung] = useState('');
  const [ausgestellt, setAusgestellt] = useState('');
  const [gueltigBis, setGueltigBis] = useState('');
  const [notiz, setNotiz] = useState('');
  const [datei, setDatei] = useState<File | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async () => {
    const res = await fetch('/api/mitarbeiter-dokumente', { cache: 'no-store' });
    const j = await res.json().catch(() => ({}));
    if (j.success) setAlle(j.dokumente || []);
    else setMeldung({ ok: false, text: j.error || 'Dokumente konnten nicht geladen werden.' });
  }, []);
  useEffect(() => { laden(); }, [laden]);
  // Ausweis, Reisepass und Führerschein stehen im Personalstamm (nur Chef): für die Disposition kommt hier 403 und die Liste bleibt leer
  useEffect(() => {
    fetch('/api/mitarbeiter-stamm?faellig=1', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.success) setStammFristen(j.fristen || []); }).catch(() => undefined);
  }, []);

  const tag = heute();
  const faellig = useMemo(() => {
    const aus: Dok[] = stammFristen.map(f => ({ id: f.schluessel, employee_id: f.employee_id, kategorie: 'personalien', bezeichnung: f.was, ausgestellt_am: null, gueltig_bis: f.gueltig_bis, file_name: null, notiz: null, mitarbeiter: f.mitarbeiter }));
    return sortiereNachFaelligkeit([...alle, ...aus].filter(d => ['abgelaufen', 'bald'].includes(faelligkeit(d.gueltig_bis, tag))), tag);
  }, [alle, stammFristen, tag]);
  const vomMa = useMemo(() => sortiereNachFaelligkeit(alle.filter(d => d.employee_id === empId), tag), [alle, empId, tag]);
  const name = (id: string) => { const e = employees.find(x => x.id === id); return e ? `${e.first_name} ${e.last_name}` : '–'; };

  async function speichern() {
    setLaeuft(true); setMeldung(null);
    try {
      const fd = new FormData();
      fd.set('employee_id', empId); fd.set('kategorie', kategorie); fd.set('bezeichnung', bezeichnung);
      fd.set('ausgestellt_am', ausgestellt); fd.set('gueltig_bis', gueltigBis); fd.set('notiz', notiz);
      if (datei) fd.set('file', datei);
      const res = await fetch('/api/mitarbeiter-dokumente', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) { setMeldung({ ok: false, text: j.error || 'Speichern fehlgeschlagen' }); return; }
      setBezeichnung(''); setAusgestellt(''); setGueltigBis(''); setNotiz(''); setDatei(null);
      await laden();
      setMeldung({ ok: true, text: 'Dokument gespeichert.' });
    } catch (e: any) { setMeldung({ ok: false, text: e?.message || 'Fehler beim Speichern' }); }
    finally { setLaeuft(false); }
  }

  async function oeffnen(id: string) {
    const res = await fetch(`/api/mitarbeiter-dokumente/signed-url?id=${id}`);
    const j = await res.json().catch(() => ({}));
    if (j.success) window.open(j.url, '_blank', 'noopener');
    else setMeldung({ ok: false, text: j.error || 'Datei konnte nicht geöffnet werden.' });
  }

  async function loeschen(id: string) {
    if (!confirm('Dieses Dokument wirklich löschen?')) return;
    const res = await fetch(`/api/mitarbeiter-dokumente?id=${id}`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.success) { setMeldung({ ok: false, text: j.error || 'Löschen fehlgeschlagen' }); return; }
    await laden();
  }

  const zeile = (d: Dok, mitName: boolean) => {
    const f = faelligkeit(d.gueltig_bis, tag);
    const kat = DOKUMENT_KATEGORIEN.find(k => k.value === d.kategorie)?.label || d.kategorie;
    return (
      <li key={d.id} data-testid="dok-zeile" className={`flex flex-wrap items-center justify-between gap-2 text-sm rounded-lg border px-3 py-2 ${farbe[f]}`}>
        <span><b>{mitName ? `${d.mitarbeiter || name(d.employee_id)} · ` : ''}{d.bezeichnung}</b> <span className="opacity-70">({kat})</span> – {faelligkeitText(d.gueltig_bis, tag)}{d.notiz ? ` · ${d.notiz}` : ''}</span>
        <span className="flex gap-3 text-xs font-medium">
          {d.file_name && <button onClick={() => oeffnen(d.id)} className="underline">Ansehen</button>}
          {!d.id.includes(':') && <button onClick={() => loeschen(d.id)} className="text-red-700 underline">Löschen</button>}
        </span>
      </li>
    );
  };

  return (
    <div className="space-y-6" data-testid="personal-dokumente">
      <section className="bg-white border border-black/5 rounded-2xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">⏰ Bald fällig oder abgelaufen</h2>
        {faellig.length === 0
          ? <p className="text-sm text-[#86868b]" data-testid="dok-nichts-faellig">Nichts fällig in den nächsten 30 Tagen.</p>
          : <ul className="space-y-1.5" data-testid="dok-faellig">{faellig.map(d => zeile(d, true))}</ul>}
      </section>

      <section className="bg-white border border-black/5 rounded-2xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">📎 Dokument eintragen</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label className="block text-xs text-[#86868b] mb-1">Mitarbeiter *</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)} className={inputCls} data-testid="dok-mitarbeiter">
              <option value="">– wählen –</option>{employees.map(e => <option key={e.id} value={e.id}>{e.last_name}, {e.first_name}</option>)}
            </select></div>
          <div><label className="block text-xs text-[#86868b] mb-1">Kategorie *</label>
            <select value={kategorie} onChange={e => setKategorie(e.target.value)} className={inputCls} data-testid="dok-kategorie">
              {DOKUMENT_KATEGORIEN.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select></div>
          <div><label className="block text-xs text-[#86868b] mb-1">Bezeichnung *</label>
            <input value={bezeichnung} onChange={e => setBezeichnung(e.target.value)} className={inputCls} placeholder={DOKUMENT_KATEGORIEN.find(k => k.value === kategorie)?.beispiel || ''} data-testid="dok-bezeichnung" /></div>
          <div><label className="block text-xs text-[#86868b] mb-1">Ausgestellt am</label>
            <input type="date" value={ausgestellt} onChange={e => setAusgestellt(e.target.value)} className={inputCls} /></div>
          <div><label className="block text-xs text-[#86868b] mb-1">Gültig bis (leer = unbefristet)</label>
            <input type="date" value={gueltigBis} onChange={e => setGueltigBis(e.target.value)} className={inputCls} data-testid="dok-gueltig-bis" /></div>
          <div><label className="block text-xs text-[#86868b] mb-1">Datei (PDF, JPG, PNG, max. 10 MB)</label>
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => setDatei(e.target.files?.[0] || null)}
              className="w-full text-sm text-[#424245] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-black/10 file:text-sm file:font-medium" /></div>
        </div>
        <div><label className="block text-xs text-[#86868b] mb-1">Notiz</label>
          <input value={notiz} onChange={e => setNotiz(e.target.value)} className={inputCls} /></div>
        {kategorie === 'g_untersuchung' && <p className="text-xs text-[#86868b]">Bitte nur die Bescheinigung (Eignung, nächster Termin) ablegen, keine medizinischen Befunde.</p>}
        <div className="flex items-center gap-3">
          <button onClick={speichern} disabled={laeuft} data-testid="dok-speichern" className="rounded-xl bg-[#e8590c] hover:bg-[#d9480f] text-white disabled:opacity-50 px-5 py-2.5 font-semibold transition">{laeuft ? '⏳ Speichere…' : 'Speichern'}</button>
          {meldung && <span data-testid="dok-meldung" className={`text-sm ${meldung.ok ? 'text-emerald-700' : 'text-red-700'}`}>{meldung.text}</span>}
        </div>
      </section>

      <section className="bg-white border border-black/5 rounded-2xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">🗂️ Dokumente je Mitarbeiter</h2>
        {!empId ? <p className="text-sm text-[#86868b]">Oben einen Mitarbeiter wählen.</p>
          : vomMa.length === 0 ? <p className="text-sm text-[#86868b]">Noch keine Dokumente für {name(empId)}.</p>
          : DOKUMENT_KATEGORIEN.map(k => {
              const dk = vomMa.filter(d => d.kategorie === k.value);
              return dk.length === 0 ? null : (
                <div key={k.value}><h3 className="text-sm font-semibold text-[#424245] mb-1">{k.label}</h3><ul className="space-y-1.5">{dk.map(d => zeile(d, false))}</ul></div>
              );
            })}
      </section>
    </div>
  );
}
