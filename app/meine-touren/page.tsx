'use client';

import { useState, useEffect, useCallback } from 'react';
import { getEmployees, createAbsence } from '@/lib/actions/employees';
import type { EmployeeWithSkills } from '@/types/employees';

// ============================================================
// SCAFFOLD OS – Meine Touren (Bauleiter / Mitarbeiter)
// • Tour des Tages mit Stopp-Timeline + Navigation
// • Packliste (aus den Stopp-Transporten) mit Abhaken
// • Zeiterfassung: Kommen / Gehen stempeln
// • Krank / Urlaub selbst melden
// ============================================================

interface Stop {
  id: string; stop_order: number; address: string; status: string;
  transport_order?: { quantity: number; inventory?: { name: string } | null } | null;
}
interface Tour {
  id: string; name: string; status: string; planned_date: string; planned_start_time: string | null;
  vehicle?: { name: string; license_plate: string } | null;
  driver?: { name: string } | null;
  stops: Stop[];
}
interface TimeEntry {
  id: string; work_date: string; start_time: string | null; end_time: string | null;
  hours: number | null; note: string | null;
}
interface PackItem { name: string; quantity: number; }

const ME_KEY = 'scaffold_me_employee';
const PACK_KEY = 'scaffold_packliste_';

function todayISO() { return new Date().toISOString().split('T')[0]; }
function fmtTime(iso: string | null) {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function MeineTourenPage() {
  const [employees, setEmployees] = useState<EmployeeWithSkills[]>([]);
  const [meId, setMeId] = useState<string>('');
  const [tours, setTours] = useState<Tour[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');

  // Abwesenheit-Formular
  const [absType, setAbsType] = useState<'sick' | 'vacation'>('sick');
  const [absFrom, setAbsFrom] = useState(todayISO());
  const [absTo, setAbsTo] = useState(todayISO());
  const [absReason, setAbsReason] = useState('');
  const [absSaving, setAbsSaving] = useState(false);
  const [absMsg, setAbsMsg] = useState('');

  // Mitarbeiter laden + gespeicherte Auswahl
  useEffect(() => {
    (async () => {
      try {
        const emps = await getEmployees();
        setEmployees(emps.filter(e => e.status === 'active'));
        const saved = localStorage.getItem(ME_KEY);
        if (saved && emps.some(e => e.id === saved)) setMeId(saved);
      } catch (e) { console.error(e); }
    })();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tours?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        const today = todayISO();
        const relevant = (json.tours || []).filter((t: Tour) =>
          t.planned_date >= today && t.status !== 'completed' && t.status !== 'cancelled'
        );
        setTours(relevant);
      }
      if (meId) {
        const er = await fetch(`/api/time-entries?employee_id=${meId}&from=${todayISO()}`, { cache: 'no-store' });
        const ej = await er.json();
        if (ej.success) setEntries(ej.entries || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [meId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Packliste-Häkchen je Tour laden
  const myTour = tours.find(t => t.planned_date === todayISO()) || tours[0] || null;
  useEffect(() => {
    if (!myTour) return;
    try {
      const saved = localStorage.getItem(PACK_KEY + myTour.id);
      setChecked(saved ? JSON.parse(saved) : {});
    } catch { setChecked({}); }
  }, [myTour?.id]);

  function selectMe(id: string) {
    setMeId(id);
    localStorage.setItem(ME_KEY, id);
  }

  function togglePacked(key: string) {
    if (!myTour) return;
    const next = { ...checked, [key]: !checked[key] };
    setChecked(next);
    localStorage.setItem(PACK_KEY + myTour.id, JSON.stringify(next));
  }

  // Packliste aus Stopps aggregieren
  const packlist: PackItem[] = [];
  if (myTour) {
    const agg: Record<string, number> = {};
    for (const s of myTour.stops) {
      const name = s.transport_order?.inventory?.name;
      const qty = s.transport_order?.quantity || 0;
      if (name) agg[name] = (agg[name] || 0) + qty;
    }
    for (const [name, quantity] of Object.entries(agg)) packlist.push({ name, quantity });
  }

  const openEntry = entries.find(e => e.start_time && !e.end_time) || null;
  const todayHours = entries.reduce((s, e) => s + (e.hours || 0), 0);

  async function stampIn() {
    if (!meId) { setMsg('Bitte zuerst oben deinen Namen wählen.'); return; }
    setMsg('');
    try {
      const res = await fetch('/api/time-entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: meId, tour_id: myTour?.id || null, note: myTour ? `Tour: ${myTour.name}` : null }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg('✅ Eingestempelt um ' + fmtTime(json.entry.start_time));
      loadData();
    } catch (e: any) { setMsg('Fehler: ' + e.message); }
  }

  async function stampOut() {
    if (!openEntry) return;
    setMsg('');
    try {
      const res = await fetch('/api/time-entries', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: openEntry.id, end_time: new Date().toISOString() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg(`✅ Ausgestempelt – ${json.entry.hours ?? '–'} h erfasst.`);
      loadData();
    } catch (e: any) { setMsg('Fehler: ' + e.message); }
  }

  async function submitAbsence() {
    if (!meId) { setAbsMsg('Bitte zuerst oben deinen Namen wählen.'); return; }
    if (absTo < absFrom) { setAbsMsg('„Bis" darf nicht vor „Von" liegen.'); return; }
    setAbsSaving(true); setAbsMsg('');
    try {
      const fd = new FormData();
      fd.set('employee_id', meId);
      fd.set('start_date', absFrom);
      fd.set('end_date', absTo);
      fd.set('type', absType);
      fd.set('reason', absReason);
      const result = await createAbsence(fd);
      if (!result.success) throw new Error(result.error);
      setAbsMsg('✅ Gemeldet – die Disposition sieht die Meldung jetzt in der Planung und kann umplanen.');
      setAbsReason('');
    } catch (e: any) { setAbsMsg('Fehler: ' + e.message); }
    setAbsSaving(false);
  }

  // Google-Maps-Route mit allen Stopps als Wegpunkte
  function mapsUrl(tour: Tour): string {
    const stops = tour.stops.map(s => encodeURIComponent(s.address));
    if (stops.length === 0) return '#';
    const dest = stops[stops.length - 1];
    const waypoints = stops.slice(0, -1).join('|');
    return `https://www.google.com/maps/dir/?api=1&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}&travelmode=driving`;
  }

  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-500 focus:outline-none';

  if (loading && tours.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-2xl mx-auto p-4 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-amber-500">👷 Meine Touren</h1>
          <p className="text-slate-400 text-sm">
            {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Wer bist du? */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <label className="block text-sm text-slate-400 mb-1">Wer bist du? (für Zeiterfassung & Abwesenheit)</label>
          <select value={meId} onChange={e => selectMe(e.target.value)} className={inputCls}>
            <option value="">– Namen wählen –</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>
                {e.first_name} {e.last_name}{e.is_available_today ? '' : ' (heute abwesend)'}
              </option>
            ))}
          </select>
        </div>

        {/* ═══ TOUR DES TAGES ═══ */}
        <section className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold">🚛 {myTour ? (myTour.planned_date === todayISO() ? 'Deine Tour heute' : 'Deine nächste Tour') : 'Keine Tour geplant'}</h2>
            {myTour && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                myTour.status === 'in_progress' ? 'bg-amber-600' : 'bg-blue-600'
              }`}>
                {myTour.status === 'in_progress' ? 'Unterwegs' : 'Geplant'}
              </span>
            )}
          </div>
          {myTour ? (
            <div className="p-4 space-y-4">
              <div className="text-sm text-slate-300">
                <strong>{myTour.name}</strong>
                {myTour.planned_start_time ? ` · Start ${myTour.planned_start_time}` : ''}
                {myTour.vehicle ? ` · 🚛 ${myTour.vehicle.name} (${myTour.vehicle.license_plate})` : ''}
                {myTour.planned_date !== todayISO() && (
                  <span className="block text-amber-400 mt-1">
                    📅 {new Date(myTour.planned_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                  </span>
                )}
              </div>

              {/* Stopp-Timeline */}
              <ol className="relative border-l-2 border-slate-700 ml-3 space-y-4">
                {myTour.stops.map(stop => (
                  <li key={stop.id} className="ml-5 relative">
                    <span className={`absolute -left-[31px] w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      stop.status === 'completed' ? 'bg-emerald-600' : 'bg-slate-600'
                    }`}>
                      {stop.status === 'completed' ? '✓' : stop.stop_order}
                    </span>
                    <div className="font-medium">{stop.address}</div>
                    {stop.transport_order?.inventory?.name && (
                      <div className="text-slate-400 text-sm">
                        {stop.transport_order.inventory.name} × {stop.transport_order.quantity}
                      </div>
                    )}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}&travelmode=driving`}
                      target="_blank" rel="noreferrer"
                      className="text-amber-400 text-sm hover:underline"
                    >
                      → Navigation
                    </a>
                  </li>
                ))}
              </ol>

              <a
                href={mapsUrl(myTour)}
                target="_blank" rel="noreferrer"
                className="block text-center bg-blue-600 hover:bg-blue-500 rounded-lg px-4 py-3 font-semibold transition"
              >
                🧭 Gesamte Route in Google Maps öffnen
              </a>
            </div>
          ) : (
            <div className="p-6 text-center text-slate-400 text-sm">
              Für dich ist aktuell keine Tour eingeplant. Frage bei der Disposition nach.
            </div>
          )}
        </section>

        {/* ═══ PACKLISTE ═══ */}
        {myTour && packlist.length > 0 && (
          <section className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <h2 className="font-semibold mb-3">📦 Packliste</h2>
            <div className="space-y-2">
              {packlist.map(item => {
                const k = item.name;
                const done = !!checked[k];
                return (
                  <button
                    key={k}
                    onClick={() => togglePacked(k)}
                    className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition ${
                      done ? 'border-emerald-600 bg-emerald-900/20' : 'border-slate-700 bg-slate-900/50'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                      done ? 'border-emerald-500 bg-emerald-500 text-black' : 'border-slate-500'
                    }`}>
                      {done ? '✓' : ''}
                    </span>
                    <span className={`flex-1 ${done ? 'line-through text-slate-500' : ''}`}>{item.name}</span>
                    <span className="font-bold">{item.quantity}×</span>
                  </button>
                );
              })}
            </div>
            <p className="text-slate-500 text-xs mt-2">
              {packlist.filter(i => checked[i.name]).length} von {packlist.length} Positionen geladen
            </p>
          </section>
        )}

        {/* ═══ ZEITERFASSUNG ═══ */}
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">⏱️ Zeiterfassung</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={stampIn}
              disabled={!!openEntry || !meId}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-lg px-4 py-3 font-semibold transition"
            >
              ▶ Kommen
            </button>
            <button
              onClick={stampOut}
              disabled={!openEntry}
              className="bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded-lg px-4 py-3 font-semibold transition"
            >
              ⏹ Gehen
            </button>
          </div>
          {openEntry && (
            <div className="bg-emerald-900/30 border border-emerald-700 rounded-lg p-3 text-sm text-emerald-200">
              Läuft seit {fmtTime(openEntry.start_time)} Uhr
            </div>
          )}
          {msg && (
            <div className={`rounded-lg p-3 text-sm ${msg.startsWith('✅') ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-200' : 'bg-red-900/40 border border-red-700 text-red-200'}`}>
              {msg}
            </div>
          )}
          {entries.length > 0 && (
            <div className="text-sm text-slate-300 border-t border-slate-700 pt-3">
              Heute erfasst: <strong className="text-amber-400">{todayHours.toLocaleString('de-DE')} h</strong>
              <ul className="mt-1 space-y-1 text-slate-400">
                {entries.map(e => (
                  <li key={e.id}>
                    {fmtTime(e.start_time)} – {fmtTime(e.end_time)}
                    {e.hours !== null ? ` (${e.hours.toLocaleString('de-DE')} h)` : ' (läuft)'}
                    {e.note ? ` · ${e.note}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ═══ KRANK / URLAUB MELDEN ═══ */}
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">🩺 Krank / Urlaub melden</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAbsType('sick')}
              className={`rounded-lg border px-3 py-2 text-sm transition ${absType === 'sick' ? 'border-red-500 bg-red-900/30' : 'border-slate-700 bg-slate-900/50'}`}
            >
              🤒 Krank
            </button>
            <button
              onClick={() => setAbsType('vacation')}
              className={`rounded-lg border px-3 py-2 text-sm transition ${absType === 'vacation' ? 'border-blue-500 bg-blue-900/30' : 'border-slate-700 bg-slate-900/50'}`}
            >
              🏖️ Urlaub
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Von</label>
              <input type="date" value={absFrom} onChange={e => setAbsFrom(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Bis</label>
              <input type="date" value={absTo} onChange={e => setAbsTo(e.target.value)} className={inputCls} />
            </div>
          </div>
          <input
            value={absReason}
            onChange={e => setAbsReason(e.target.value)}
            placeholder="Grund (optional)"
            className={inputCls}
          />
          {absMsg && (
            <div className={`rounded-lg p-3 text-sm ${absMsg.startsWith('✅') ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-200' : 'bg-red-900/40 border border-red-700 text-red-200'}`}>
              {absMsg}
            </div>
          )}
          <button
            onClick={submitAbsence}
            disabled={absSaving || !meId}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-40 rounded-lg px-4 py-3 font-semibold transition"
          >
            {absSaving ? 'Sende…' : 'Meldung absenden'}
          </button>
          <p className="text-slate-500 text-xs">
            Die Meldung erscheint sofort in der Planung – die Disposition kann Personal und Fahrten umplanen.
          </p>
        </section>
      </div>
    </div>
  );
}
