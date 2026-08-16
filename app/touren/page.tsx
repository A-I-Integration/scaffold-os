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
interface TransportOrder {
  id: string; quantity: number; status: string; created_at: string;
  to_project?: { name: string; adresse: string } | null;
  inventory?: { name: string } | null;
}
interface Stop {
  id: string; stop_order: number; address: string; status: string;
  transport_order?: { quantity: number; inventory?: { name: string } | null } | null;
}
interface Tour {
  id: string; name: string; status: string; planned_date: string; planned_start_time: string | null;
  total_weight_kg: number | null; vehicle: Vehicle | null; driver: Driver | null; stops: Stop[];
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

function todayISO() { return new Date().toISOString().split('T')[0]; }
function fmtTime(iso: string | null) {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function TourenPage() {
  const [tab, setTab] = useState<Tab>('touren');
  const [tours, setTours] = useState<Tour[]>([]);
  const [transports, setTransports] = useState<TransportOrder[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithSkills[]>([]);
  const [newDriverName, setNewDriverName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedTour, setExpandedTour] = useState<string | null>(null);

  // Formular „Neue Tour"
  const [fName, setFName] = useState('');
  const [fDate, setFDate] = useState(todayISO());
  const [fTime, setFTime] = useState('07:00');
  const [fVehicle, setFVehicle] = useState('');
  const [fDriver, setFDriver] = useState('');
  const [fSelected, setFSelected] = useState<string[]>([]);
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
      const [toursRes, transRes, vehRes, drvRes] = await Promise.all([
        fetch('/api/tours?t=' + Date.now(), { cache: 'no-store' }),
        fetch('/api/transport-orders?t=' + Date.now(), { cache: 'no-store' }),
        fetch('/api/vehicles', { cache: 'no-store' }),
        fetch('/api/drivers', { cache: 'no-store' }),
      ]);
      const [toursJson, transJson, vehJson, drvJson] = await Promise.all([
        toursRes.json(), transRes.json(), vehRes.json(), drvRes.json(),
      ]);
      if (toursJson.success) setTours(toursJson.tours || []);
      else setError('Touren: ' + (toursJson.error || 'Fehler'));
      if (transJson.success) setTransports(transJson.transports || []);
      else setError('Transporte: ' + (transJson.error || 'Fehler'));
      if (vehJson.success) setVehicles(vehJson.vehicles || []);
      if (drvJson.success) setDrivers(drvJson.drivers || []);
      try { setEmployees(await getEmployees()); } catch { /* Mitarbeiter-Liste optional */ }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

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
    if (!fName.trim()) { setFMessage('Bitte Tour-Name eingeben.'); return; }
    if (!fVehicle) { setFMessage('Bitte Fahrzeug wählen.'); return; }
    if (!fDriver) { setFMessage('Bitte Fahrer wählen.'); return; }
    if (fSelected.length === 0) { setFMessage('Bitte mindestens einen Transportauftrag wählen.'); return; }
    setFSaving(true);
    try {
      const res = await fetch('/api/tours', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fName.trim(), vehicle_id: fVehicle, driver_id: fDriver,
          planned_date: fDate, planned_start_time: fTime, transport_order_ids: fSelected,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setFMessage('✅ Tour „' + fName + '" wurde angelegt.');
      setFName(''); setFSelected([]);
      loadAll();
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
  const toursToday = tours.filter(t => t.planned_date === today);
  const planned = tours.filter(t => t.status === 'planned');
  const inProgress = tours.filter(t => t.status === 'in_progress');

  // Stunden je Mitarbeiter summieren
  const hoursPerEmployee: Record<string, { name: string; hours: number }> = {};
  for (const e of entries) {
    const k = e.employee?.id || 'unbekannt';
    if (!hoursPerEmployee[k]) hoursPerEmployee[k] = { name: e.employee ? `${e.employee.first_name} ${e.employee.last_name}` : 'Unbekannt', hours: 0 };
    hoursPerEmployee[k].hours += e.hours || 0;
  }

  // Leerfahrt-Hinweis: Transporte zur selben Adresse bündeln
  const addrCount: Record<string, number> = {};
  for (const t of transports) {
    const a = t.to_project?.adresse || 'Unbekannt';
    addrCount[a] = (addrCount[a] || 0) + 1;
  }
  const bundleHint = Object.entries(addrCount).filter(([, n]) => n > 1);

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
            <p className="text-[#86868b] text-sm mt-1">Tagesplanung, Tour-Überwachung und Stundenauswertung</p>
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
          <div className="bg-[#f5f5f7] border border-black/10 rounded-xl p-4">
            <div className="text-2xl font-bold text-[#e8590c]">{transports.length}</div>
            <div className="text-[#86868b] text-sm">Offene Transporte</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-black/10 pb-0">
          {([['touren', '🚛 Touren'], ['neu', '➕ Neue Tour'], ['stunden', '⏱️ Stundenauswertung']] as [Tab, string][]).map(([key, label]) => (
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
                <div className="p-4 flex flex-wrap items-center gap-4">
                  <button onClick={() => setExpandedTour(expandedTour === tour.id ? null : tour.id)} className="text-[#86868b] hover:text-[#1d1d1f] w-6">
                    {expandedTour === tour.id ? '▾' : '▸'}
                  </button>
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-semibold">{tour.name}</div>
                    <div className="text-[#86868b] text-sm">
                      {new Date(tour.planned_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                      {tour.planned_start_time ? ` · ab ${tour.planned_start_time}` : ''}
                      {` · ${tour.stops.length} Stopp${tour.stops.length === 1 ? '' : 's'}`}
                    </div>
                  </div>
                  <div className="text-sm text-[#424245]">
                    🚛 {tour.vehicle?.name || '–'} {tour.vehicle?.license_plate ? `(${tour.vehicle.license_plate})` : ''}
                    <span className="mx-2 text-[#86868b]">|</span>
                    👷 {tour.driver?.name || '–'}
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
                    {tour.stops.length === 0 && <div className="text-[#86868b] text-sm">Keine Stopps.</div>}
                    <ol className="space-y-2">
                      {tour.stops.map(stop => (
                        <li key={stop.id} className="flex items-center gap-3 text-sm">
                          <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-xs font-bold shrink-0">
                            {stop.stop_order}
                          </span>
                          <span className="flex-1">{stop.address}</span>
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
                <label className="block text-sm text-[#86868b] mb-1">Tour-Name *</label>
                <input value={fName} onChange={e => setFName(e.target.value)} placeholder="z. B. Tour Nord Vormittag" className={inputCls} />
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
                <label className="block text-sm text-[#86868b] mb-1">Fahrer *</label>
                <select value={fDriver} onChange={e => setFDriver(e.target.value)} className={inputCls}>
                  <option value="">– wählen –</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}{d.employee ? ` (${d.employee.first_name} ${d.employee.last_name})` : ''}</option>)}
                </select>
                {drivers.length === 0 && <p className="text-xs text-[#e8590c] mt-1">Keine Fahrer – Phase-4-SQL enthält Beispiel-Datensätze.</p>}
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
                {fSaving ? 'Lege an…' : `Tour anlegen (${fSelected.length} Transport${fSelected.length === 1 ? '' : 'e'})`}
              </button>
            </div>

            <div className="bg-[#f5f5f7] border border-black/10 rounded-xl p-5">
              <h2 className="font-semibold text-lg mb-1">Offene Transportaufträge</h2>
              <p className="text-[#86868b] text-sm mb-3">Reihenfolge der Auswahl = Reihenfolge der Stopps.</p>
              {bundleHint.length > 0 && (
                <div className="mb-3 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
                  💡 <strong>Leerfahrten vermeiden:</strong> {bundleHint.map(([a, n]) => `${n}× ${a}`).join(' · ')} – gleiche Adressen in eine Tour bündeln.
                </div>
              )}
              {transports.length === 0 && (
                <div className="text-[#86868b] text-sm py-6 text-center">Keine offenen Transportaufträge.</div>
              )}
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {transports.map(t => {
                  const idx = fSelected.indexOf(t.id);
                  const selected = idx >= 0;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setFSelected(selected ? fSelected.filter(x => x !== t.id) : [...fSelected, t.id])}
                      className={`w-full text-left rounded-xl border p-3 transition flex items-center gap-3 ${
                        selected ? 'border-[#e8590c] bg-[#e8590c]/10' : 'border-black/10 bg-white/50 hover:border-black/20'
                      }`}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${selected ? 'bg-amber-500 text-black' : 'bg-black/10'}`}>
                        {selected ? idx + 1 : '·'}
                      </span>
                      <span className="flex-1">
                        <span className="block font-medium">{t.inventory?.name || 'Material'} × {t.quantity}</span>
                        <span className="block text-[#86868b] text-xs">
                          → {t.to_project?.name || 'Baustelle'}{t.to_project?.adresse ? `, ${t.to_project.adresse}` : ''}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

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
