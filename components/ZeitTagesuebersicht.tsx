'use client';

import { useCallback, useEffect, useState } from 'react';
import { ABSCHNITT_ARTEN, ABSCHNITT_LABEL, tageszeile, zusammenfassung, fmtMinuten, berlinDatum, type Abschnitt } from '@/lib/zeit-abschnitte';
import { OrtungVorschlag, OrtungImport } from '@/components/OrtungBloecke';
import { SpesenTag, SpesenMonatBlock, SpesenSaetzeBlock, type SpesenZeile, type SatzZeile } from '@/components/SpesenBloecke';

// ============================================================
// SCAFFOLD OS – Tagesübersicht der Zeiterfassung
// Je Mitarbeiter: Beginn, Ende, Pause, Abschnitte (Baustelle, Fahrt vom Hof, Schlechtwetter, Fortbildung).
// Chef und Dispo können Abschnitte eintragen, ändern und löschen. Die gebuchten Stunden bleiben unverändert.
// ============================================================

interface Emp { id: string; first_name: string; last_name: string; status: string }
interface Eintrag { id: string; employee_id: string; start_time: string | null; end_time: string | null; hours: number | null; break_minutes: number | null; project?: { name: string } | null }
interface Abs extends Abschnitt { id: string; project?: { name: string } | null }
interface Lauf { employee_id: string; art: string; start_time: string; project?: { name: string } | null }
const QUELLE_TEXT: Record<string, string> = { knopf: 'per Knopf erfasst', mitarbeiter: 'vom Mitarbeiter nachgetragen', ortung: 'aus der Ortung' };

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
  const [tourIds, setTourIds] = useState<string[]>([]);
  const [laufend, setLaufend] = useState<Lauf[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [meldung, setMeldung] = useState('');
  const [form, setForm] = useState<typeof leeresFormular | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [spesenTage, setSpesenTage] = useState<SpesenZeile[]>([]);
  const [saetze, setSaetze] = useState<SatzZeile[]>([]);
  const [spesenFehlt, setSpesenFehlt] = useState(false);
  const [spesenAn, setSpesenAn] = useState(false);

  const laden = useCallback(async () => {
    setLaedt(true); setMeldung('');
    try {
      const r = await fetch(`/api/zeit-abschnitte?datum=${datum}`, { cache: 'no-store' });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      setEmployees(j.employees); setEintraege(j.entries); setAbschnitte(j.abschnitte); setTabelleFehlt(!!j.tabelleFehlt); setTourIds(j.tourMitarbeiter || []); setLaufend(j.laufend || []);
    } catch (e: any) { setMeldung(e.message || 'Laden fehlgeschlagen.'); }
    finally { setLaedt(false); }
  }, [datum]);
  const spesenLaden = useCallback(async () => {
    if (!canEdit) return;
    try {
      const r = await fetch(`/api/spesen?datum=${datum}`, { cache: 'no-store' });
      const j = await r.json();
      if (!j.success) { setSpesenAn(false); return; }
      setSpesenAn(true); setSpesenTage(j.tage); setSaetze(j.saetze); setSpesenFehlt(!!j.tabelleFehlt);
    } catch { setSpesenAn(false); }
  }, [datum, canEdit]);
  useEffect(() => { laden(); spesenLaden(); }, [laden, spesenLaden]);
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

  const laufHeute = laufend.filter(l => berlinDatum(l.start_time) === datum || datum === heute());
  const ids = new Set([...eintraege.map(e => e.employee_id), ...abschnitte.map(a => a.employee_id), ...tourIds, ...laufHeute.map(l => l.employee_id)]);
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
      {!laedt && sichtbar.length === 0 && <p className="text-sm text-[#86868b]" data-testid="tag-leer">Für diesen Tag gibt es keine Stempelzeiten, keine Abschnitte und keine Tour-Einteilung.</p>}

      {!laedt && sichtbar.length > 1 && <Gesamt abschnitte={abschnitte} laufend={laufHeute} />}

      {!laedt && sichtbar.map(emp => {
        const z = tageszeile(emp.id, eintraege, abschnitte);
        const meine = abschnitte.filter(a => a.employee_id === emp.id);
        const lauf = laufHeute.find(l => l.employee_id === emp.id) || null;
        const zus = zusammenfassung(meine, lauf);
        return (
          <div key={emp.id} className="bg-white border border-black/10 rounded-xl mb-3 p-4" data-testid={`tag-mitarbeiter-${emp.id}`}>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold">{emp.last_name}, {emp.first_name}</span>
              <span>Beginn {uhr(z.beginn)} · Ende {uhr(z.ende)}</span>
              <span className="text-[#86868b]">gebucht {z.gebuchtStunden.toLocaleString('de-DE', { minimumFractionDigits: 2 })} h · Pause laut Stempelzeit {z.pauseGebucht} min</span>
            </div>
            {z.hinweise.map(h => <p key={h} className="text-xs text-amber-700 mt-1" data-testid="tag-hinweis">⚠ {h}</p>)}
            {(meine.length > 0 || lauf) && <Zusammen z={zus} lauf={lauf} />}
            {meine.length > 0 && (
              <ul className="mt-2 text-sm">
                {meine.map(a => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-1 border-t border-black/5" data-testid="tag-abschnitt">
                    <span className="w-44">{ABSCHNITT_LABEL[a.art] || a.art}</span>
                    <span>{hhmm(a.start_time)} – {hhmm(a.end_time)}</span>
                    {a.project?.name && <span className="text-blue-600">📁 {a.project.name}</span>}
                    {a.note && <span className="text-[#86868b]">{a.note}</span>}
                    {a.quelle && QUELLE_TEXT[a.quelle] && <span className="text-xs text-[#86868b]" data-testid="tag-quelle">{QUELLE_TEXT[a.quelle]}</span>}
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
            {canEdit && <OrtungVorschlag employeeId={emp.id} datum={datum} onUebernommen={laden} />}
            {spesenAn && !spesenFehlt && (
              <SpesenTag key={emp.id + datum + (spesenTage.find(t => t.employee_id === emp.id)?.id || 'neu') + (spesenTage.find(t => t.employee_id === emp.id)?.betrag_manuell ?? '')}
                employeeId={emp.id} datum={datum} stempelStunden={Math.round((z.bruttoMinuten / 60) * 100) / 100}
                fortbildung={(z.minuten.fortbildung || 0) > 0} zeile={spesenTage.find(t => t.employee_id === emp.id)} saetze={saetze} onGespeichert={spesenLaden} />
            )}
            {meine.length > 0 && (
              <p className="text-xs text-[#86868b] mt-2">
                {Object.entries(z.minuten).map(([art, m]) => `${ABSCHNITT_LABEL[art] || art}: ${fmtMinuten(m)}`).join(' · ')}
              </p>
            )}
          </div>
        );
      })}
      {canEdit && <OrtungImport />}
      {spesenAn && spesenFehlt && <div className="rounded-xl p-3 text-sm mt-4 bg-amber-50 border border-amber-200 text-amber-800" data-testid="spesen-tabelle-fehlt">Die Tabellen für Spesen fehlen noch. Bitte phase-138-spesen.sql in Supabase ausführen.</div>}
      {spesenAn && !spesenFehlt && <SpesenMonatBlock monat={datum.slice(0, 7)} namen={Object.fromEntries(employees.map(e => [e.id, `${e.last_name}, ${e.first_name}`]))} key={datum.slice(0, 7) + spesenTage.length} />}
      {spesenAn && !spesenFehlt && <SpesenSaetzeBlock saetze={saetze} datum={datum} onGeaendert={spesenLaden} />}
      <p className="text-xs text-[#86868b] mt-4">Die Abschnitte gliedern den Tag. „Aktiv gearbeitet“ zählt Baustelle und Fahrten zusammen, Pausen stehen getrennt daneben. Die gebuchten Stunden für Lohn und DATEV kommen weiterhin aus der Stempelzeit; Korrekturen dort wie bisher in der Monatsansicht.</p>
    </div>
  );
}

function Zusammen({ z, lauf }: { z: ReturnType<typeof zusammenfassung>; lauf: Lauf | null }) {
  return (
    <div className="mt-2 grid gap-2 rounded-lg bg-[#f5f5f7] p-3 text-sm md:grid-cols-2" data-testid="tag-zusammen">
      <div>
        <div className="text-xs font-semibold text-[#424245]">Aktiv gearbeitet</div>
        <div className="text-base font-semibold" data-testid="tag-aktiv">{fmtMinuten(z.aktivMinuten)}</div>
        <div className="text-xs text-[#86868b]">Baustelle {fmtMinuten(z.baustelleMinuten)} · Fahrten {fmtMinuten(z.fahrtMinuten)}{z.fortbildungMinuten > 0 ? ` · Fortbildung ${fmtMinuten(z.fortbildungMinuten)}` : ''}</div>
      </div>
      <div>
        <div className="text-xs font-semibold text-[#424245]">Pausen</div>
        <div className="text-base font-semibold" data-testid="tag-pausen">{fmtMinuten(z.pauseMinuten)}</div>
        <div className="text-xs text-[#86868b]">{z.pauseAnzahl} {z.pauseAnzahl === 1 ? 'Pause' : 'Pausen'}{z.schlechtwetterMinuten > 0 ? ` · Schlechtwetter ${fmtMinuten(z.schlechtwetterMinuten)} (nicht aktiv gezählt)` : ''}</div>
      </div>
      {lauf && <div className="md:col-span-2 text-xs text-blue-700" data-testid="tag-laeuft">Läuft gerade: {ABSCHNITT_LABEL[lauf.art] || lauf.art} seit {hhmm(lauf.start_time)} Uhr{lauf.project?.name ? ` (${lauf.project.name})` : ''}. Die Zeit bis jetzt ist enthalten.</div>}
    </div>
  );
}

function Gesamt({ abschnitte, laufend }: { abschnitte: Abs[]; laufend: Lauf[] }) {
  const alle = zusammenfassung(abschnitte, null);
  const lauf = laufend.reduce((s, l) => { const z = zusammenfassung([], l); return { aktiv: s.aktiv + z.aktivMinuten, pause: s.pause + z.pauseMinuten }; }, { aktiv: 0, pause: 0 });
  return (
    <div className="mb-3 rounded-xl border border-black/10 bg-white p-4 text-sm" data-testid="tag-gesamt">
      <span className="font-semibold">Alle Mitarbeiter zusammen: </span>
      aktiv gearbeitet <b>{fmtMinuten(alle.aktivMinuten + lauf.aktiv)}</b> · Pausen <b>{fmtMinuten(alle.pauseMinuten + lauf.pause)}</b>
    </div>
  );
}
