'use client';

import { useState, useEffect, useCallback } from 'react';
import { getEmployees } from '@/lib/actions/employees';
import type { EmployeeWithSkills } from '@/types/employees';

// ============================================================
// SCAFFOLD OS – Touren / Dispo-Cockpit (Disponentin)
// Tab 1: Touren-Übersicht & Statussteuerung
// Tab 2: Neue Tour aus offenen Transportaufträgen
// Tab 3: Stundenauswertung (Zeiterfassung) mit CSV-Export
// ============================================================

interface Vehicle { id: string; name: string; license_plate: string; }
interface Driver {
  id: string; name: string; employee_id?: string | null;
  employee?: { id: string; first_name: string; last_name: string } | null;
}
interface Stop {
  id: string; stop_order: number; address: string; status: string;
  transport_order?: { quantity: number; inventory?: { name: string } | null } | null;
}
interface Tour {
  id: string; name: string; status: string; planned_date: string; planned_start_time: string | null;
  total_weight_kg: number | null; vehicle: Vehicle | null; driver: Driver | null; stops: Stop[];
  team_ids?: string[] | null;
}
interface TimeEntry {
  id: string; work_date: string; start_time: string | null; end_time: string | null;
  hours: number | null; note: string | null;
  employee?: { id: string; first_name: string; last_name: string } | null;
}

type Tab = 'touren' | 'neu' | 'stunden';

const STATUS_LABEL: Record<string, string> = {
  planned: 'Geplant', in_progress: 'Unterwegs', completed: 'Abgeschlossen', cancelled: 'Abgebrochen',
};
const STATUS_CLASS: Record<string, string> = {
  planned: 'bg-blue-600', in_progress: 'bg-amber-600', completed: 'bg-emerald-600', cancelled: 'bg-black/20',
};
const STOP_STATUS_LABEL: Record<string, string> = {
  pending: 'Offen', arrived: 'Angekommen', completed: 'Erledigt', skipped: 'Übersprungen',
};

// Lokales Datum (YYYY-MM-DD). toISOString() läuft auf UTC und liefert
// zwischen 00:00 und 02:00 Uhr deutscher Zeit noch den Vortag.
function todayISO() { return new Date().toLocaleDateString('sv-SE'); }
function fmtTime(iso: string | null) {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function TourenPage() {
  const [tab, setTab] = useState<Tab>('touren');
  const [tours, setTours] = useState<Tour[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithSkills[]>([]);
  const [newDriverName, setNewDriverName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedTour, setExpandedTour] = useState<string | null>(null);

  // Formular „Neue Tour"
  const [fDate, setFDate] = useState(todayISO());
  const [fTime, setFTime] = useState('07:00');
  const [fVehicle, setFVehicle] = useState('');
  // FIX: Mehrere Leute pro Tour – erste Person fährt (driver_id),
  // alle gewählten landen in team_ids. Auswahl als Dropdown (wie Fahrzeug).
  const [fDrivers, setFDrivers] = useState<string[]>([]);
  const [teamOpen, setTeamOpen] = useState(false);
  const [stopsOpen, setStopsOpen] = useState(false);
  const [fSelected, setFSelected] = useState<string[]>([]);
  // Phase 68-C: Baustellen-Anfahrten (ohne Material)
  const [fProjSelected, setFProjSelected] = useState<string[]>([]);
  const [projekte, setProjekte] = useState<any[]>([]);
  const [fSaving, setFSaving] = useState(false);
  const [fMessage, setFMessage] = useState('');

  // Stundenauswertung
  const [sFrom, setSFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0];
  });
  const [sTo, setSTo] = useState(todayISO());
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [sLoading, setSLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [toursRes, vehRes, drvRes] = await Promise.all([
        fetch('/api/tours?t=' + Date.now(), { cache: 'no-store' }),
        fetch('/api/vehicles', { cache: 'no-store' }),
        fetch('/api/drivers', { cache: 'no-store' }),
      ]);
      const [toursJson, vehJson, drvJson] = await Promise.all([
        toursRes.json(), vehRes.json(), drvRes.json(),
      ]);
      if (toursJson.success) setTours(toursJson.tours || []);
      else setError('Touren: ' + (toursJson.error || 'Fehler'));
      if (vehJson.success) setVehicles(vehJson.vehicles || []);
      if (drvJson.success) setDrivers(drvJson.drivers || []);
      // Phase 68-C: aktive Projekte für Baustellen-Anfahrten
      try {
        const prjRes = await fetch('/api/projects', { cache: 'no-store' });
        const prjJson = await prjRes.json();
        // FIX: Dashboard zaehlt 'aktiv' als 'nicht completed' – hier genauso,
        // sonst fehlen Baustellen ohne expliziten Status (Stand 19.09.: 10 vs 2).
        if (prjJson.success) setProjekte((prjJson.projects || []).filter((p: any) => p.status !== 'completed'));
      } catch { /* Projekt-Liste optional */ }
      try { setEmployees(await getEmployees()); } catch { /* Mitarbeiter-Liste optional */ }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Phase 68-C: aktive Baustellen, die noch in KEINER offenen Tour vorkommen
  const verplanteProjektIds = new Set(
    tours.flatMap((t: any) => (t.status === 'completed' || t.status === 'cancelled') ? [] : (t.stops || []).map((s: any) => s.project_id))
  );
  // FIX: Kein Adresse-Zwang – Projekte ohne Adresse tauchen im Dropdown auf
  // („Adresse nachtragen"). Verplant-Status steuert nur das Ausgrauen.

  // FIX: Projekte mit Materialliste (Aufmaß Schritt 5 / KI Schritt 4)
  // brauchen einen Materialtransport und gehören nicht in die reine
  // Team-Anfahrt – sie werden separat gelistet.
  const hatMaterial = (p: any) => {
    try {
      const d = typeof p.data === 'string' ? JSON.parse(p.data) : (p.data || {});
      const s5 = d?.step5 || d?.s5 || {};
      const felder = ['rahmen', 'diagonale', 'gelander', 'arbeitsbuehnen', 'spindeltreppe', 'anker'];
      if (felder.some((k) => parseFloat(String(s5[k] || '0').replace(',', '.')) > 0)) return true;
      const liste = d?.step4?.kiResult?.materialList || d?.step4?.ki_result?.materialList || [];
      return Array.isArray(liste) && liste.some((m) => Number(m?.quantity ?? 0) > 0);
    } catch { return false; }
  };
  // EINE Liste: alle Baustellen anhakbar; hatMaterial(p) steuert nur das Badge.

  const loadEntries = useCallback(async () => {
    setSLoading(true);
    try {
      const res = await fetch(`/api/time-entries?from=${sFrom}&to=${sTo}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setEntries(json.entries || []);
    } catch (e) { console.error(e); }
    setSLoading(false);
  }, [sFrom, sTo]);

  useEffect(() => { if (tab === 'stunden') loadEntries(); }, [tab, loadEntries]);

  async function setTourStatus(tour: Tour, status: string) {
    try {
      const body: any = { id: tour.id, status };
      if (status === 'completed') body.completed_at = new Date().toISOString();
      const res = await fetch('/api/tours', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      loadAll();
    } catch (e: any) { alert('Fehler: ' + e.message); }
  }

  async function createTour() {
    setFMessage('');
    // Tour-Name ist optional – wird aus Datum + erstem Stopp erzeugt.
    if (!fVehicle) { setFMessage('Bitte Fahrzeug wählen.'); return; }
    if (fDrivers.length === 0) { setFMessage('Bitte mindestens eine Person wählen (Mehrfachauswahl möglich).'); return; }
    if (fSelected.length === 0 && fProjSelected.length === 0) { setFMessage('Bitte mindestens einen Transport ODER eine Baustellen-Anfahrt wählen.'); return; }
    setFSaving(true);
    const erstesProjekt = projekte.find(p => p.id === fProjSelected[0]);
    // Name entfällt als Eingabe – wird automatisch aus Datum + erstem Stopp gebaut.
    const tourName = `Tour ${new Date(fDate + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}${erstesProjekt ? ` – ${erstesProjekt.name}` : ''}`;
    try {
      setFMessage('');
      const res = await fetch('/api/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // FIX: erste gewählte Person fährt (driver_id), alle gewählten
          // Personen werden als Team gespeichert (team_ids).
          name: tourName, vehicle_id: fVehicle, driver_id: fDrivers[0], team_ids: fDrivers,
          planned_date: fDate, planned_start_time: fTime, transport_order_ids: fSelected, project_ids: fProjSelected,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setFMessage('✅ Tour „' + tourName + '" wurde angelegt.');
      setFSelected([]); setFProjSelected([]); setFDrivers([]);
      await loadAll();
      // Phase 68-D: direkt zum Touren-Tab wechseln, damit die neue Tour
      // sofort sichtbar ist (vorher blieb man auf dem leeren Formular
      // stehen — sah aus, als waere alles verschwunden).
      setTab('touren');
    } catch (e: any) { setFMessage('Fehler: ' + e.message); }
    setFSaving(false);
  }

  // Fahrer ↔ Mitarbeiter verknüpfen (Phase 6)
  async function linkDriver(driverId: string, employeeId: string) {
    try {
      const res = await fetch('/api/drivers', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: driverId, employee_id: employeeId || null }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      loadAll();
    } catch (e: any) { setError('Verknüpfung: ' + e.message); }
  }

  async function createDriver() {
    if (!newDriverName.trim()) return;
    try {
      const res = await fetch('/api/drivers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDriverName.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setNewDriverName('');
      loadAll();
    } catch (e: any) { setError('Fahrer anlegen: ' + e.message); }
  }

  function exportCSV() {
    const header = 'Datum;Mitarbeiter;Von;Bis;Stunden;Notiz';
    const rows = entries.map(e => [
      e.work_date,
      e.employee ? `${e.employee.first_name} ${e.employee.last_name}` : '–',
      fmtTime(e.start_time), fmtTime(e.end_time),
      e.hours !== null ? String(e.hours).replace('.', ',') : '',
      (e.note || '').replace(/;/g, ','),
    ].join(';'));
    const csv = '﻿' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `stundenauswertung_${sFrom}_${sTo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ─── Abgeleitete Daten ───
  const today = todayISO();
  // FIX: planned_date kann "2026-09-19" oder "2026-09-19T07:00:00..." sein –
  // beide Seiten auf YYYY-MM-DD normalisieren, sonst matcht nie etwas.
  const toursToday = tours.filter(t => String(t.planned_date ?? '').slice(0, 10) === today);
  const planned = tours.filter(t => t.status === 'planned');
  const inProgress = tours.filter(t => t.status === 'in_progress');

  // Stunden je Mitarbeiter summieren
  const hoursPerEmployee: Record<string, { name: string; hours: number }> = {};
  for (const e of entries) {
    const k = e.employee?.id || 'unbekannt';
    if (!hoursPerEmployee[k]) hoursPerEmployee[k] = { name: e.employee ? `${e.employee.first_name} ${e.employee.last_name}` : 'Unbekannt', hours: 0 };
    hoursPerEmployee[k].hours += e.hours || 0;
  }

  const inputCls = 'w-full bg-[#f5f5f7] border border-black/10 rounded-lg px-3 py-2 text-[#1d1d1f] focus:border-[#e8590c] focus:outline-none';

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-[#1d1d1f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#e8590c]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f]">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-[#e8590c]">🗺️ Touren & Disposition</h1>
            <p className="text-[#86868b] text-sm mt-1">Tagesplanung und Tour-Überwachung</p>
            {/* Versions-Stempel: nur sichtbar, wenn dieser Build geladen ist.
                Fehlt er, lieg Chrome-Cache/Service Worker dazwischen. */}
            <p className="text-[10px] text-black/30 mt-0.5">Stand: FINAL-20.09 · Baustellen: alle 10, verplante ausgegraut</p>
          </div>
          <button onClick={loadAll} className="bg-[#f5f5f7] hover:bg-black/10 border border-black/10 rounded-xl px-4 py-2 text-sm transition">
            ↻ Aktualisieren
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-900/40 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            {error} – Läuft das Phase-4-SQL in Supabase schon?
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[#f5f5f7] border border-black/10 rounded-xl p-4">
            <div className="text-2xl font-bold">{toursToday.length}</div>
            <div className="text-[#86868b] text-sm">Touren heute</div>
          </div>
          <div className="bg-[#f5f5f7] border border-black/10 rounded-xl p-4">
            <div className="text-2xl font-bold text-blue-600">{planned.length}</div>
            <div className="text-[#86868b] text-sm">Geplant</div>
          </div>
          <div className="bg-[#f5f5f7] border border-black/10 rounded-xl p-4">
            <div className="text-2xl font-bold text-[#e8590c]">{inProgress.length}</div>
            <div className="text-[#86868b] text-sm">Unterwegs</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-black/10 pb-0">
          {([['touren', '🚛 Touren'], ['neu', '➕ Neue Tour']] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition ${
                tab === key ? 'bg-[#f5f5f7] text-[#e8590c] border border-b-0 border-black/10' : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ═══ TAB: TOUREN ═══ */}
        {tab === 'touren' && (
          <div className="space-y-4">
            {tours.length === 0 && (
              <div className="bg-[#f5f5f7] border border-black/10 rounded-xl p-8 text-center text-[#86868b]">
                Noch keine Touren. Lege unter „Neue Tour" die erste an.
              </div>
            )}
            {tours.map(tour => (
              <div key={tour.id} className="bg-[#f5f5f7] border border-black/10 rounded-xl overflow-hidden">
                {/* FIX: ganze Zeile klickbar (nicht nur der kleine Pfeil) */}
                <div onClick={() => setExpandedTour(expandedTour === tour.id ? null : tour.id)}
                  className="p-4 flex flex-wrap items-center gap-4 cursor-pointer select-none hover:bg-black/[0.03] transition-colors">
                  <span className="text-[#86868b] w-6">{expandedTour === tour.id ? '▾' : '▸'}</span>
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-semibold">{tour.name}</div>
                    <div className="text-[#86868b] text-sm">
                      {new Date(String(tour.planned_date || '').slice(0, 10) + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      {tour.planned_start_time ? ` · ab ${tour.planned_start_time}` : ''}
                      {` · ${tour.stops?.length ?? 0} Stopp${(tour.stops?.length ?? 0) === 1 ? '' : 's'}`}
                    </div>
                  </div>
                  <div className="text-sm text-[#424245]">
                    🚛 {tour.vehicle?.name || '–'} {tour.vehicle?.license_plate ? `(${tour.vehicle.license_plate})` : ''}
                    <span className="mx-2 text-[#86868b]">|</span>
                    👷 {tour.driver?.name || '–'}{Array.isArray(tour.team_ids) && tour.team_ids.length > 1 ? ` +${tour.team_ids.length - 1}` : ''}
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_CLASS[tour.status] || 'bg-black/20'}`}>
                    {STATUS_LABEL[tour.status] || tour.status}
                  </span>
                  <div className="flex gap-2">
                    {tour.status === 'planned' && (
                      <button onClick={() => setTourStatus(tour, 'in_progress')} className="bg-[#e8590c] hover:bg-[#d9480f] text-white rounded-xl px-3 py-1.5 text-sm transition">
                        Starten
                      </button>
                    )}
                    {tour.status === 'in_progress' && (
                      <button onClick={() => setTourStatus(tour, 'completed')} className="bg-emerald-600 hover:bg-emerald-500 rounded-xl px-3 py-1.5 text-sm transition">
                        Abschließen
                      </button>
                    )}
                  </div>
                </div>
                {expandedTour === tour.id && (
                  <div className="border-t border-black/10 p-4 bg-white/50">
                    {!(tour.stops?.length) && <div className="text-[#86868b] text-sm">Keine Stopps.</div>}
                    <ol className="space-y-2">
                      {(tour.stops ?? []).map(stop => (
                        <li key={stop.id} className="flex items-center gap-3 text-sm">
                          <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-xs font-bold shrink-0">
                            {stop.stop_order}
                          </span>
                          <span className="flex-1">
                            {/* Verknuepfung wie in Planung: Klick -> zum Projekt (Aufmaß) */}
                            {(stop as any).project_id ? (
                              <a href={`/aufmass/schritt6?id=${(stop as any).project_id}`} className="hover:text-[#e8590c] hover:underline underline-offset-2">{stop.address || 'Baustelle öffnen'}</a>
                            ) : (
                              stop.address
                            )}
                          </span>
                          <span className="text-[#86868b]">
                            {stop.transport_order?.inventory?.name || ''}
                            {stop.transport_order?.quantity ? ` × ${stop.transport_order.quantity}` : ''}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs ${stop.status === 'completed' ? 'bg-emerald-700' : 'bg-black/10'}`}>
                            {STOP_STATUS_LABEL[stop.status] || stop.status}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ═══ TAB: NEUE TOUR ═══ */}
        {tab === 'neu' && (
          <>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-[#f5f5f7] border border-black/10 rounded-xl p-5 space-y-4">
              <h2 className="font-semibold text-lg">Tour anlegen</h2>
              <div>
                {/* FIX: Baustellen-Auswahl als Dropdown direkt im Formular
                    (gleiche Funktion wie Fahrzeug/Team). Enthält nur Projekte
                    ohne geplante Tour. Tour-Name entfällt – er wird aus
                    Datum + erstem Stopp automatisch erzeugt. */}
                <label className="block text-sm text-[#86868b] mb-1">Baustellen (Stopps) *</label>
                <div className="relative">
                  <button type="button" onClick={() => setStopsOpen(o => !o)}
                    className="w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-[15px] outline-none focus:border-[#e8590c]/50 flex items-center justify-between gap-2 text-left">
                    <span className={fProjSelected.length === 0 ? 'text-[#86868b]' : ''}>
                      {fProjSelected.length === 0
                        ? '– Baustellen wählen –'
                        : fProjSelected.map(id => projekte.find(p => p.id === id)?.name).filter(Boolean).join(', ')}
                    </span>
                    <span className="text-[#86868b] text-xs">▾</span>
                  </button>
                  {stopsOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setStopsOpen(false)} />
                      <div className="absolute z-20 mt-1 w-full rounded-xl border border-black/10 bg-white shadow-lg max-h-64 overflow-y-auto p-2 space-y-1">
                        {/* ALLE Baustellen anzeigen (erwartet: 10). Bereits in
                            einer Tour verplante sind ausgegraut + nicht waehlbar. */}
                        {projekte.map(p => {
                          const idx = fProjSelected.indexOf(p.id);
                          const selected = idx >= 0;
                          const mitMat = hatMaterial(p);
                          const bereitsVerplant = verplanteProjektIds.has(p.id);
                          return (
                            <label key={p.id} title={bereitsVerplant ? 'Bereits in einer Tour verplant' : undefined}
                              className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg ${bereitsVerplant ? 'opacity-50 cursor-not-allowed' : `cursor-pointer ${mitMat ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-black/5'}`}`}>
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={bereitsVerplant}
                                onChange={() => setFProjSelected(selected ? fProjSelected.filter(x => x !== p.id) : [...fProjSelected, p.id])}
                              />
                              <span className="flex-1">
                                <a href={`/aufmass/schritt6?id=${p.id}`} title="Projekt öffnen"
                                  onClick={e => { e.preventDefault(); e.stopPropagation(); window.location.href = `/aufmass/schritt6?id=${p.id}`; }}
                                  className="block font-medium hover:text-[#e8590c] hover:underline underline-offset-2">{p.name}</a>
                                <span className="block text-[#86868b] text-xs">{p.adresse || '(Adresse nachtragen)'}</span>
                              </span>
                              {bereitsVerplant && <span className="text-xs font-medium text-[#86868b] bg-black/10 rounded-full px-2 py-0.5 shrink-0">in Tour</span>}
                              {mitMat && <span className="text-xs font-medium text-amber-800 bg-amber-200/70 rounded-full px-2 py-0.5 shrink-0">📦</span>}
                            </label>
                          );
                        })}
                        {projekte.length === 0 && <p className="text-xs text-[#86868b] px-2 py-1.5">Keine Baustellen vorhanden.</p>}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[#86868b] mb-1">Datum *</label>
                  <input type="date" value={fDate} onChange={e => setFDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm text-[#86868b] mb-1">Startzeit</label>
                  <input type="time" value={fTime} onChange={e => setFTime(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-[#86868b] mb-1">Fahrzeug *</label>
                <select value={fVehicle} onChange={e => setFVehicle(e.target.value)} className={inputCls}>
                  <option value="">– wählen –</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.license_plate})</option>)}
                </select>
                {vehicles.length === 0 && <p className="text-xs text-[#e8590c] mt-1">Keine Fahrzeuge – Phase-4-SQL ausführen bzw. Fahrzeuge anlegen.</p>}
              </div>
              <div>
                <label className="block text-sm text-[#86868b] mb-1">Team / Fahrer * <span className="text-xs">(Mehrfachauswahl – erste Person fährt)</span></label>
                <div className="relative">
                  {/* Aussehen/Verhalten wie das Fahrzeug-Dropdown oben, nur mit Mehrfachauswahl */}
                  <button type="button" onClick={() => setTeamOpen(o => !o)}
                    className="w-full rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-[15px] outline-none focus:border-[#e8590c]/50 flex items-center justify-between gap-2 text-left">
                    <span className={fDrivers.length === 0 ? 'text-[#86868b]' : ''}>
                      {fDrivers.length === 0
                        ? '– wählen –'
                        : fDrivers.map(id => drivers.find(d => d.id === id)?.name).filter(Boolean).join(', ')}
                    </span>
                    <span className="text-[#86868b] text-xs">▾</span>
                  </button>
                  {teamOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setTeamOpen(false)} />
                      <div className="absolute z-20 mt-1 w-full rounded-xl border border-black/10 bg-white shadow-lg max-h-48 overflow-y-auto p-2 space-y-1">
                        {drivers.map(d => (
                          <label key={d.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg hover:bg-black/5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={fDrivers.includes(d.id)}
                              onChange={e => setFDrivers(e.target.checked ? [...fDrivers, d.id] : fDrivers.filter(x => x !== d.id))}
                            />
                            <span>{d.name}{d.employee ? ` (${d.employee.first_name} ${d.employee.last_name})` : ''}</span>
                          </label>
                        ))}
                        {drivers.length === 0 && <p className="text-xs text-[#e8590c] px-2 py-1.5">Keine Fahrer – Phase-4-SQL enthält Beispiel-Datensätze.</p>}
                      </div>
                    </>
                  )}
                </div>
              </div>
              {fMessage && (
                <div className={`rounded-xl p-3 text-sm ${fMessage.startsWith('✅') ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {fMessage}
                </div>
              )}
              <button
                onClick={createTour}
                disabled={fSaving}
                className="w-full bg-[#e8590c] hover:bg-[#d9480f] text-white disabled:opacity-50 rounded-xl px-4 py-3 font-semibold transition"
              >
                {fSaving ? 'Lege an…' : `Tour anlegen (${fSelected.length + fProjSelected.length} Stopp${fSelected.length + fProjSelected.length === 1 ? '' : 's'})`}
              </button>
            </div>

          </div>

          {/* Phase 68-C: Baustellen-Auswahl ist jetzt das Dropdown „Baustellen (Stopps)"
              im Formular oben – diese separate Liste entfällt. */}

          {/* Fahrer ↔ Mitarbeiter verknüpfen (Phase 6) */}
          <div className="mt-6 bg-[#f5f5f7] border border-black/10 rounded-xl p-5">
            <h2 className="font-semibold text-lg mb-1">👷 Fahrer ↔ Mitarbeiter verknüpfen</h2>
            <p className="text-[#86868b] text-sm mb-4">
              Verknüpfte Mitarbeiter sehen in „Meine Touren" automatisch nur ihre eigenen Fahrten.
            </p>
            <div className="space-y-3">
              {drivers.map(d => (
                <div key={d.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="font-medium sm:w-48 shrink-0">{d.name}</span>
                  <select
                    value={d.employee_id || ''}
                    onChange={e => linkDriver(d.id, e.target.value)}
                    className={inputCls}
                  >
                    <option value="">– nicht verknüpft –</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                    ))}
                  </select>
                  {d.employee && <span className="text-emerald-600 text-sm shrink-0">✅ verknüpft</span>}
                </div>
              ))}
              {drivers.length === 0 && <p className="text-[#86868b] text-sm">Keine Fahrer vorhanden.</p>}
            </div>
            <div className="mt-5 pt-4 border-t border-black/10 flex flex-col sm:flex-row gap-2">
              <input
                value={newDriverName}
                onChange={e => setNewDriverName(e.target.value)}
                placeholder="Neuer Fahrer – Name"
                className={inputCls}
              />
              <button onClick={createDriver} className="shrink-0 bg-black/10 hover:bg-black/15 rounded-xl px-4 py-2 text-sm font-semibold transition">
                + Fahrer anlegen
              </button>
            </div>
          </div>
          </>
        )}

        {/* ═══ TAB: STUNDENAUSWERTUNG ═══ */}
        {tab === 'stunden' && (
          <div className="space-y-4">
            <div className="bg-[#f5f5f7] border border-black/10 rounded-xl p-4 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm text-[#86868b] mb-1">Von</label>
                <input type="date" value={sFrom} onChange={e => setSFrom(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-sm text-[#86868b] mb-1">Bis</label>
                <input type="date" value={sTo} onChange={e => setSTo(e.target.value)} className={inputCls} />
              </div>
              <button onClick={loadEntries} className="bg-black/10 hover:bg-black/15 rounded-xl px-4 py-2 text-sm transition">
                Laden
              </button>
              <button onClick={exportCSV} disabled={entries.length === 0} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-xl px-4 py-2 text-sm font-semibold transition ml-auto">
                ⬇ CSV-Export
              </button>
            </div>

            {/* Summen je Mitarbeiter */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.values(hoursPerEmployee).map(e => (
                <div key={e.name} className="bg-[#f5f5f7] border border-black/10 rounded-xl p-4">
                  <div className="font-semibold truncate">{e.name}</div>
                  <div className="text-2xl font-bold text-[#e8590c]">{e.hours.toLocaleString('de-DE')} h</div>
                </div>
              ))}
              {entries.length === 0 && !sLoading && (
                <div className="col-span-full text-[#86868b] text-sm py-4 text-center">
                  Keine Einträge im Zeitraum. Zeiterfassung läuft über „Meine Touren" (Kommen/Gehen).
                </div>
              )}
            </div>

            {/* Einzelnachweis */}
            {entries.length > 0 && (
              <div className="bg-[#f5f5f7] border border-black/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-white/80 text-[#86868b] text-left">
                    <tr>
                      <th className="px-4 py-2">Datum</th>
                      <th className="px-4 py-2">Mitarbeiter</th>
                      <th className="px-4 py-2">Von</th>
                      <th className="px-4 py-2">Bis</th>
                      <th className="px-4 py-2 text-right">Stunden</th>
                      <th className="px-4 py-2">Notiz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id} className="border-t border-black/10">
                        <td className="px-4 py-2">{new Date(e.work_date + 'T00:00:00').toLocaleDateString('de-DE')}</td>
                        <td className="px-4 py-2">{e.employee ? `${e.employee.first_name} ${e.employee.last_name}` : '–'}</td>
                        <td className="px-4 py-2">{fmtTime(e.start_time)}</td>
                        <td className="px-4 py-2">{fmtTime(e.end_time)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{e.hours !== null ? e.hours.toLocaleString('de-DE') : '–'}</td>
                        <td className="px-4 py-2 text-[#86868b]">{e.note || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
