'use client';

import { useCallback, useEffect, useState } from 'react';
import { ABSCHNITT_ARTEN, ABSCHNITT_LABEL, tageszeile, fmtMinuten, type Abschnitt } from '@/lib/zeit-abschnitte';

// ============================================================
// SCAFFOLD OS – Tagesübersicht der Zeiterfassung
// Je Mitarbeiter: Beginn, Ende, Pause, Abschnitte (Baustelle, Fahrt vom Hof, Schlechtwetter, Fortbildung).
// Chef und Dispo können Abschnitte eintragen, ändern und löschen. Die gebuchten Stunden bleiben unverändert.
// ============================================================

interface Emp { id: string; first_name: string; last_name: string; status: string }
interface Eintrag { id: string; employee_id: string; start_time: string | null; end_time: string | null; hours: number | null; break_minutes: number | null; project?: { name: string } | null }
interface Abs extends Abschnitt { id: string; project?: { name: string } | null }

const heute = () => new Date().toLocaleDateString('en-CA');
const uhr = (ts: string | null) => (ts ? new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–');
const hhmm = (ts: string) => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const leeresFormular = { id: '', employee_id: '', art: 'baustelle', von: '', bis: '', project_id: '', note: '' };

export default function ZeitTagesuebersicht({ canEdit }: { canEdit: boolean }) {
  const [datum, setDatum] = useState(heute());
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [abschnitte, setAbschnitte] = useState<Abs[]>([]);
  const [projekte, setProjekte] = useState<{ id: string; name: string }[]>([]);
  const [tabelleFehlt, setTabelleFehlt] = useState(false);
  const [laedt, setLaedt] = useState(true);
  const [meldung, setMeldung] = useState('');
  const [form, setForm] = useState<typeof leeresFormular | null>(null);
  const [speichert, setSpeichert] = useState(false);

  const laden = useCallback(async () => {
    setLaedt(true); setMeldung('');
    try {
      const r = await fetch(`/api/zeit-abschnitte?datum=${datum}`, { cache: 'no-store' });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setEmployees(j.employees); setEintraege(j.entries); setAbschnitte(j.abschnitte); setTabelleFehlt(!!j.tabelleFehlt);
    } catch (e: any) { setMeldung(e.message || 'Laden fehlgeschlagen.'); }
    finally { setLaedt(false); }
  }, [datum]);
  useEffect(() => { laden(); }, [laden]);
  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(j => { if (j.success) setProjekte((j.projects || []).map((p: any) => ({ id: p.id, name: p.name }))); }).catch(() => {});
  }, []);

  const iso = (h: string) => new Date(`${datum}T${h}:00`).toISOString();

  async function speichern() {
    if (!form) return;
    if (!form.employee_id) { setMeldung('Bitte einen Mitarbeiter wählen.'); return; }
    if (!form.von || !form.bis) { setMeldung('Bitte Von und Bis angeben.'); return; }
    setSpeichert(true); setMeldung('');
    try {
      const body = { id: form.id || undefined, employee_id: form.employee_id, work_date: datum, art: form.art, start_time: iso(form.von), end_time: iso(form.bis), project_id: form.project_id || null, note: form.note };
      const r = await fetch('/api/zeit-abschnitte', { method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setForm(null); await laden();
    } catch (e: any) { setMeldung(e.message || 'Speichern fehlgeschlagen.'); }
    finally { setSpeichert(false); }
  }

  async function loeschen(id: string) {
    setMeldung('');
    const r = await fetch(`/api/zeit-abschnitte?id=${id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!j.success) setMeldung(j.error || 'Löschen fehlgeschlagen.');
    else await laden();
  }

  const ids = new Set([...eintraege.map(e => e.employee_id), ...abschnitte.map(a => a.employee_id)]);
  const sichtbar = employees.filter(e => ids.has(e.id));
  const aktive = employees.filter(e => e.status === 'active');
  const inp = 'bg-white border border-black/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#e8590c]';

  return (
    <div data-testid="zeit-tagesuebersicht">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="date" value={datum} onChange={e => setDatum(e.target.value)} data-testid="tag-datum" className={inp} />
        {canEdit && !form && (
          <button data-testid="tag-neu" onClick={() => setForm({ ...leeresFormular })} className="border border-black/10 hover:border-[#e8590c] text-sm px-4 py-2 rounded-xl">+ Abschnitt eintragen</button>
        )}
      </div>

      {tabelleFehlt && <div className="rounded-xl p-3 text-sm mb-4 bg-amber-50 border border-amber-200 text-amber-800" data-testid="tag-tabelle-fehlt">Die Tabelle für Tagesabschnitte fehlt noch. Bitte phase-137-zeit-abschnitte.sql in Supabase ausführen.</div>}
      {meldung && <div className="rounded-xl p-3 text-sm mb-4 bg-red-50 border border-red-200 text-red-700" data-testid="tag-meldung">{meldung}</div>}

      {canEdit && form && (
        <div className="bg-white border border-black/10 rounded-xl p-4 mb-4 grid gap-3 md:grid-cols-3" data-testid="tag-formular">
          <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className={inp} data-testid="tag-mitarbeiter">
            <option value="">Mitarbeiter wählen …</option>
            {aktive.map(e => <option key={e.id} value={e.id}>{e.last_name}, {e.first_name}</option>)}
          </select>
          <select value={form.art} onChange={e => setForm({ ...form, art: e.target.value })} className={inp} data-testid="tag-art">
            {ABSCHNITT_ARTEN.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} className={inp} data-testid="tag-baustelle">
            <option value="">ohne Baustelle</option>
            {projekte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <label className="text-xs text-[#86868b]">Von<input type="time" value={form.von} onChange={e => setForm({ ...form, von: e.target.value })} className={inp + ' block w-full'} data-testid="tag-von" /></label>
          <label className="text-xs text-[#86868b]">Bis<input type="time" value={form.bis} onChange={e => setForm({ ...form, bis: e.target.value })} className={inp + ' block w-full'} data-testid="tag-bis" /></label>
          <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Notiz (optional)" maxLength={300} className={inp} data-testid="tag-notiz" />
          <div className="md:col-span-3 flex gap-2">
            <button onClick={speichern} disabled={speichert} data-testid="tag-speichern" className="bg-[#e8590c] text-white text-sm px-4 py-2 rounded-xl disabled:opacity-50">{speichert ? 'Speichere …' : 'Speichern'}</button>
            <button onClick={() => setForm(null)} className="border border-black/10 text-sm px-4 py-2 rounded-xl">Abbrechen</button>
          </div>
        </div>
      )}

      {laedt && <p className="text-[#86868b]">Lade Tag …</p>}
      {!laedt && sichtbar.length === 0 && <p className="text-sm text-[#86868b]" data-testid="tag-leer">Für diesen Tag gibt es keine Stempelzeiten und keine Abschnitte.</p>}

      {!laedt && sichtbar.map(emp => {
        const z = tageszeile(emp.id, eintraege, abschnitte);
        const meine = abschnitte.filter(a => a.employee_id === emp.id);
        return (
          <div key={emp.id} className="bg-white border border-black/10 rounded-xl mb-3 p-4" data-testid={`tag-mitarbeiter-${emp.id}`}>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold">{emp.last_name}, {emp.first_name}</span>
              <span>Beginn {uhr(z.beginn)} · Ende {uhr(z.ende)}</span>
              <span className="text-[#86868b]">gebucht {z.gebuchtStunden.toLocaleString('de-DE', { minimumFractionDigits: 2 })} h · Pause laut Stempelzeit {z.pauseGebucht} min</span>
            </div>
            {z.hinweise.map(h => <p key={h} className="text-xs text-amber-700 mt-1" data-testid="tag-hinweis">⚠ {h}</p>)}
            {meine.length > 0 && (
              <ul className="mt-2 text-sm">
                {meine.map(a => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-1 border-t border-black/5" data-testid="tag-abschnitt">
                    <span className="w-44">{ABSCHNITT_LABEL[a.art] || a.art}</span>
                    <span>{hhmm(a.start_time)} – {hhmm(a.end_time)}</span>
                    {a.project?.name && <span className="text-blue-600">📁 {a.project.name}</span>}
                    {a.note && <span className="text-[#86868b]">{a.note}</span>}
                    {canEdit && (
                      <span className="ml-auto flex gap-2">
                        <button className="text-xs border border-black/10 rounded-md px-2 py-1" onClick={() => setForm({ id: a.id, employee_id: a.employee_id, art: a.art, von: hhmm(a.start_time), bis: hhmm(a.end_time), project_id: a.project_id || '', note: a.note || '' })}>Bearbeiten</button>
                        <button className="text-xs border border-black/10 rounded-md px-2 py-1 text-red-600" onClick={() => loeschen(a.id)}>Löschen</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {meine.length > 0 && (
              <p className="text-xs text-[#86868b] mt-2">
                {Object.entries(z.minuten).map(([art, m]) => `${ABSCHNITT_LABEL[art] || art}: ${fmtMinuten(m)}`).join(' · ')}
              </p>
            )}
          </div>
        );
      })}
      <p className="text-xs text-[#86868b] mt-4">Die Abschnitte gliedern den Tag. Die gebuchten Stunden kommen weiterhin aus der Stempelzeit; Korrekturen dort wie bisher in der Monatsansicht.</p>
    </div>
  );
}
