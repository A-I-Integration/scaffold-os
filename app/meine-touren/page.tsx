'use client';

import { useState, useEffect, useCallback } from 'react';
import { getEmployees, createAbsence } from '@/lib/actions/employees';
import type { EmployeeWithSkills } from '@/types/employees';
import ProjektDokumentation from '@/components/ProjektDokumentation';
import Link from 'next/link';
import { Wrench, Navigation, ClipboardList, Euro } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Mitarbeiter-Bereich (Bauleiter / Mitarbeiter)
//
// NEU: zentrale Startseite mit 4 Reitern, statt einer einzelnen
// langen Seite – "oben" (über den Reitern) bleibt sichtbar, wer
// eingeloggt ist (Namens-Erkennung), unabhängig vom gewählten Reiter:
//   1. Werkzeug           – Zugang zum Aufmaß
//   2. Touren & Stempeln  – Tour des Tages, Packliste, Zeiterfassung,
//                           Krank/Urlaub (bisheriger Seiteninhalt,
//                           UNVERÄNDERT übernommen)
//   3. Baustellen-Dokumentation – bestehende /dokumentation-Logik
//                           (ProjektDokumentation), hier mit
//                           vorausgewähltem eigenen Mitarbeiter
//   4. Lohnabrechnungen    – ansehen, versenden, als PDF speichern
// ============================================================

interface Stop {
  id: string; stop_order: number; address: string; status: string;
  transport_order?: { quantity: number; inventory?: { name: string } | null } | null;
}
interface Tour {
  id: string; name: string; status: string; planned_date: string; planned_start_time: string | null;
  vehicle?: { name: string; license_plate: string } | null;
  driver?: { name: string; employee_id?: string | null } | null;
  team_ids?: string[] | null;
  stops: Stop[];
}
interface TimeEntry {
  id: string; work_date: string; start_time: string | null; end_time: string | null;
  hours: number | null; note: string | null;
}
interface PackItem { name: string; quantity: number; }
interface DokProject { id: string; name: string | null; adresse: string | null; status: string; }
interface PayrollDoc { id: string; month: string; file_name: string; uploaded_at: string; sent_at: string | null; }

const ME_KEY = 'scaffold_me_employee';
const PACK_KEY = 'scaffold_packliste_';
const DOK_PROJECT_KEY = 'scaffold_dokumentation_project';

type Tab = 'werkzeug' | 'touren' | 'dokumentation' | 'lohnabrechnung';

function todayISO() { return new Date().toISOString().split('T')[0]; }
function fmtTime(iso: string | null) {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function MeineTourenPage() {
  const [activeTab, setActiveTab] = useState<Tab>('touren');
  const [employees, setEmployees] = useState<EmployeeWithSkills[]>([]);
  const [meId, setMeId] = useState<string>('');
  const [heutigerEinsatz, setHeutigerEinsatz] = useState<{ id: string; name: string } | null>(null);
  const [tours, setTours] = useState<Tour[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState('');
  const [autoMe, setAutoMe] = useState<{ id: string; name: string } | null>(null);
  const [showAllHint, setShowAllHint] = useState(false);
  // team_ids auf tours enthält drivers.id (nicht employees.id, siehe
  // api/tours POST: team_ids = fDrivers, die Fahrer-Auswahl-IDs). Um zu
  // prüfen, ob "ich" (employees.id) im Team einer Tour stehe, brauchen wir
  // die Zuordnung drivers.id -> employee_id aus /api/drivers.
  const [meineFahrerIds, setMeineFahrerIds] = useState<string[]>([]);

  // Abwesenheit-Formular
  const [absType, setAbsType] = useState<'sick' | 'vacation'>('sick');
  const [absFrom, setAbsFrom] = useState(todayISO());
  const [absTo, setAbsTo] = useState(todayISO());
  const [absReason, setAbsReason] = useState('');
  const [absSaving, setAbsSaving] = useState(false);
  const [absMsg, setAbsMsg] = useState('');

  // ─── Baustellen-Dokumentation (Reiter 3) ───
  const [dokProjects, setDokProjects] = useState<DokProject[]>([]);
  const [dokProjectId, setDokProjectId] = useState('');
  const [dokLoading, setDokLoading] = useState(false);

  // ─── Lohnabrechnungen (Reiter 4) ───
  const [lohnDocs, setLohnDocs] = useState<PayrollDoc[]>([]);
  const [lohnLoading, setLohnLoading] = useState(false);
  const [lohnMsg, setLohnMsg] = useState('');
  const [lohnSending, setLohnSending] = useState<string | null>(null);

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

  // Automatische Erkennung: Ist der Login mit einem Mitarbeiter verknüpft?
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        const json = await res.json();
        if (json.success && json.employee) {
          setAutoMe({ id: json.employee.id, name: `${json.employee.first_name} ${json.employee.last_name}` });
          setMeId(json.employee.id);
          localStorage.setItem(ME_KEY, json.employee.id);
        }
      } catch { /* keine Verknüpfung → Namenswahl bleibt als Fallback */ }
    })();
  }, []);

  // Eigene Fahrer-IDs auflösen, sobald bekannt ist, wer "ich" bin – damit
  // Touren erkannt werden, in denen ich nur als Team-Mitglied (nicht als
  // Hauptfahrer) über team_ids eingeteilt bin.
  useEffect(() => {
    if (!meId) { setMeineFahrerIds([]); return; }
    (async () => {
      try {
        const res = await fetch('/api/drivers', { cache: 'no-store' });
        const json = await res.json();
        if (json.success) {
          setMeineFahrerIds(
            (json.drivers || []).filter((d: any) => d.employee_id === meId).map((d: any) => d.id)
          );
        }
      } catch (e) { console.error(e); }
    })();
  }, [meId]);

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
        // Persönliche Touren zuerst: bin ich Fahrer ODER im Team der Tour
        // (team_ids)? VORHER: nur der Fahrer sah seine Tour hier – ein als
        // Team-Mitglied (nicht Fahrer) eingeteilter Mitarbeiter sah "seine"
        // Tour nicht, obwohl er ihr zugewiesen war. team_ids enthält
        // drivers.id (nicht employees.id, s. api/tours POST), daher der
        // Abgleich über meineFahrerIds (aufgelöst aus /api/drivers).
        const mine = meId ? relevant.filter((t: Tour) =>
          t.driver?.employee_id === meId ||
          (t.team_ids || []).some((id) => meineFahrerIds.includes(id))
        ) : [];
        setShowAllHint(meId !== '' && mine.length === 0 && relevant.length > 0);
        setTours(mine.length > 0 ? mine : relevant);
      }
      if (meId) {
        const er = await fetch(`/api/time-entries?employee_id=${meId}&from=${todayISO()}`, { cache: 'no-store' });
        const ej = await er.json();
        if (ej.success) setEntries(ej.entries || []);
        // NEU (Phase 54): heutigen Wochenplan-Einsatz laden – zeigt sofort
        // Änderungen, die der Bauleiter/Disponent per Drag & Drop in der
        // Wochenplanung vorgenommen hat.
        try {
          const heute = todayISO();
          const wr = await fetch(`/api/wochenplanung?start=${heute}&end=${heute}`, { cache: 'no-store' });
          const wj = await wr.json();
          if (wj.success) {
            const meiner = (wj.einsaetze || []).find((e: any) => e.employee_id === meId);
            setHeutigerEinsatz(meiner?.project || null);
          }
        } catch { /* nicht kritisch, Rest der Seite funktioniert weiter */ }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [meId, meineFahrerIds]);

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

  // ─── Baustellen-Dokumentation: Projekte laden, heutigen Einsatz vorauswählen ───
  const loadDokProjects = useCallback(async () => {
    setDokLoading(true);
    try {
      const res = await fetch('/api/projects', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        const list: DokProject[] = json.projects || [];
        setDokProjects(list);
        const saved = localStorage.getItem(DOK_PROJECT_KEY);
        if (heutigerEinsatz?.id && list.some(p => p.id === heutigerEinsatz.id)) {
          setDokProjectId(heutigerEinsatz.id);
        } else if (saved && list.some(p => p.id === saved)) {
          setDokProjectId(saved);
        }
      }
    } catch (e) { console.error(e); }
    setDokLoading(false);
  }, [heutigerEinsatz]);

  useEffect(() => {
    if (activeTab === 'dokumentation' && dokProjects.length === 0) loadDokProjects();
  }, [activeTab, dokProjects.length, loadDokProjects]);

  function selectDokProject(id: string) {
    setDokProjectId(id);
    localStorage.setItem(DOK_PROJECT_KEY, id);
  }

  // ─── Lohnabrechnungen laden ───
  const loadLohnDocs = useCallback(async () => {
    if (!meId) return;
    setLohnLoading(true);
    try {
      const res = await fetch(`/api/lohnabrechnungen?employee_id=${meId}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setLohnDocs(json.documents || []);
    } catch (e) { console.error(e); }
    setLohnLoading(false);
  }, [meId]);

  useEffect(() => {
    if (activeTab === 'lohnabrechnung' && meId) loadLohnDocs();
  }, [activeTab, meId, loadLohnDocs]);

  async function lohnAnsehen(id: string) {
    try {
      const res = await fetch(`/api/lohnabrechnungen/signed-url?id=${id}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      window.open(json.url, '_blank');
    } catch (e: any) { setLohnMsg('Fehler: ' + e.message); }
  }

  async function lohnHerunterladen(id: string) {
    try {
      const res = await fetch(`/api/lohnabrechnungen/signed-url?id=${id}&download=1`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      window.location.href = json.url;
    } catch (e: any) { setLohnMsg('Fehler: ' + e.message); }
  }

  async function lohnVersenden(id: string) {
    const ziel = prompt('An welche E-Mail-Adresse senden? (leer lassen für deine eigene Login-E-Mail)') || '';
    setLohnSending(id); setLohnMsg('');
    try {
      const res = await fetch('/api/lohnabrechnungen/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, to: ziel.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setLohnMsg(`✅ Versendet an ${json.to}`);
      loadLohnDocs();
    } catch (e: any) { setLohnMsg('Fehler: ' + e.message); }
    setLohnSending(null);
  }

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
        // NEU: heutigen Wochenplanungs-Einsatz automatisch als Projekt
        // vorschlagen – das eigentliche Einstempeln bleibt weiterhin ein
        // aktiver, manueller Schritt des Mitarbeiters, nur das Projekt-Feld
        // wird ihm dabei nicht nochmal abverlangt.
        body: JSON.stringify({ employee_id: meId, tour_id: myTour?.id || null, project_id: heutigerEinsatz?.id || null, note: myTour ? `Tour: ${myTour.name}` : null }),
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

  const inputCls = 'w-full bg-[#f5f5f7] border border-black/10 rounded-lg px-3 py-2 text-[#1d1d1f] focus:border-[#e8590c] focus:outline-none';

  const TABS: { key: Tab; label: string; icon: any }[] = [
    { key: 'werkzeug', label: 'Werkzeug', icon: Wrench },
    { key: 'touren', label: 'Touren & Stempeln', icon: Navigation },
    { key: 'dokumentation', label: 'Baustellen-Dokumentation', icon: ClipboardList },
    { key: 'lohnabrechnung', label: 'Lohnabrechnungen', icon: Euro },
  ];

  if (loading && tours.length === 0) {
    return (
      <div className="min-h-screen bg-white text-[#1d1d1f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#e8590c]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#1d1d1f]">
      <div className="max-w-2xl mx-auto p-4 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[#e8590c]">👷 Mein Bereich</h1>
          <p className="text-[#86868b] text-sm">
            {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Wer bist du? – automatisch erkannt ODER Namenswahl. Bleibt über
            allen Reitern sichtbar, damit immer klar ist, wer gerade
            stempelt/dokumentiert/seine Lohnabrechnung ansieht. */}
        <div className="bg-[#f5f5f7] border border-black/10 rounded-xl p-4">
          {autoMe ? (
            <div className="flex items-center gap-3">
              <span className="text-2xl">👤</span>
              <div>
                <div className="font-semibold">{autoMe.name}</div>
                <div className="text-[#86868b] text-xs">Automatisch erkannt – dein Login ist mit dir verknüpft.</div>
              </div>
            </div>
          ) : (
            <>
              <label className="block text-sm text-[#86868b] mb-1">Wer bist du? (für Zeiterfassung & Abwesenheit)</label>
              <select value={meId} onChange={e => selectMe(e.target.value)} className={inputCls}>
                <option value="">– Namen wählen –</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.first_name} {e.last_name}{e.is_available_today ? '' : ' (heute abwesend)'}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>

        {/* ═══ REITER ═══ */}
        <div className="flex gap-1 overflow-x-auto border-b border-black/10 -mx-4 px-4">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 shrink-0 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key ? 'border-[#e8590c] text-[#e8590c]' : 'border-transparent text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══ REITER 1: WERKZEUG ═══ */}
        {activeTab === 'werkzeug' && (
          <section className="bg-[#f5f5f7] border border-black/10 rounded-xl p-5 space-y-3">
            <h2 className="font-semibold">🛠️ Werkzeug</h2>
            <p className="text-sm text-[#86868b]">Werkzeuge für die Baustelle – aktuell verfügbar:</p>
            <Link
              href="/aufmass/schritt1"
              className="flex items-center gap-3 bg-white border border-black/10 rounded-xl p-4 hover:border-[#e8590c]/40 transition"
            >
              <Wrench className="w-6 h-6 text-[#e8590c] shrink-0" />
              <div>
                <div className="font-semibold">📐 Aufmaß</div>
                <div className="text-[#86868b] text-sm">Baustelle erfassen – Maße, Fotos, Material.</div>
              </div>
            </Link>
          </section>
        )}

        {/* ═══ REITER 2: TOUREN & STEMPELN ═══ */}
        {activeTab === 'touren' && (
          <div className="space-y-5">
            {showAllHint && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
                ℹ️ Für dich ist aktuell keine eigene Tour zugeordnet – du siehst die Übersicht aller Touren.
              </div>
            )}

            {/* NEU (Phase 54): heutiger Einsatz aus der Wochenplanung – zeigt
                automatisch, wenn der Bauleiter/Disponent per Drag & Drop
                geändert hat, ohne dass eine formale Tour (Fahrzeug+Fahrer)
                angelegt sein muss. */}
            {heutigerEinsatz && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Heutiger Einsatz (Wochenplanung)</p>
                <p className="text-lg font-bold text-emerald-900 mt-1">📁 {heutigerEinsatz.name}</p>
              </div>
            )}

            {/* ═══ TOUR DES TAGES ═══ */}
            <section className="bg-[#f5f5f7] border border-black/10 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-black/10 flex items-center justify-between">
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
                  <div className="text-sm text-[#424245]">
                    <strong>{myTour.name}</strong>
                    {myTour.planned_start_time ? ` · Start ${myTour.planned_start_time}` : ''}
                    {myTour.vehicle ? ` · 🚛 ${myTour.vehicle.name} (${myTour.vehicle.license_plate})` : ''}
                    {myTour.planned_date !== todayISO() && (
                      <span className="block text-[#e8590c] mt-1">
                        📅 {new Date(myTour.planned_date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                  </div>

                  {/* Stopp-Timeline */}
                  <ol className="relative border-l-2 border-black/10 ml-3 space-y-4">
                    {myTour.stops.map(stop => (
                      <li key={stop.id} className="ml-5 relative">
                        <span className={`absolute -left-[31px] w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          stop.status === 'completed' ? 'bg-emerald-600' : 'bg-black/20'
                        }`}>
                          {stop.status === 'completed' ? '✓' : stop.stop_order}
                        </span>
                        <div className="font-medium">{stop.address}</div>
                        {stop.transport_order?.inventory?.name && (
                          <div className="text-[#86868b] text-sm">
                            {stop.transport_order.inventory.name} × {stop.transport_order.quantity}
                          </div>
                        )}
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stop.address)}&travelmode=driving`}
                          target="_blank" rel="noreferrer"
                          className="text-[#e8590c] text-sm hover:underline"
                        >
                          → Navigation
                        </a>
                      </li>
                    ))}
                  </ol>

                  <a
                    href={mapsUrl(myTour)}
                    target="_blank" rel="noreferrer"
                    className="block text-center bg-blue-600 hover:bg-blue-500 rounded-xl px-4 py-3 font-semibold transition"
                  >
                    🧭 Gesamte Route in Google Maps öffnen
                  </a>
                </div>
              ) : (
                <div className="p-6 text-center text-[#86868b] text-sm">
                  Für dich ist aktuell keine Tour eingeplant. Frage bei der Disposition nach.
                </div>
              )}
            </section>

            {/* ═══ PACKLISTE ═══ */}
            {myTour && packlist.length > 0 && (
              <section className="bg-[#f5f5f7] border border-black/10 rounded-xl p-4">
                <h2 className="font-semibold mb-3">📦 Packliste</h2>
                <div className="space-y-2">
                  {packlist.map(item => {
                    const k = item.name;
                    const done = !!checked[k];
                    return (
                      <button
                        key={k}
                        onClick={() => togglePacked(k)}
                        className={`w-full flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                          done ? 'border-emerald-600 bg-emerald-900/20' : 'border-black/10 bg-white/50'
                        }`}
                      >
                        <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 ${
                          done ? 'border-emerald-500 bg-emerald-500 text-black' : 'border-black/20'
                        }`}>
                          {done ? '✓' : ''}
                        </span>
                        <span className={`flex-1 ${done ? 'line-through text-[#86868b]' : ''}`}>{item.name}</span>
                        <span className="font-bold">{item.quantity}×</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[#86868b] text-xs mt-2">
                  {packlist.filter(i => checked[i.name]).length} von {packlist.length} Positionen geladen
                </p>
              </section>
            )}

            {/* ═══ ZEITERFASSUNG ═══ */}
            <section className="bg-[#f5f5f7] border border-black/10 rounded-xl p-4 space-y-3">
              <h2 className="font-semibold">⏱️ Zeiterfassung</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={stampIn}
                  disabled={!!openEntry || !meId}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-xl px-4 py-3 font-semibold transition"
                >
                  ▶ Kommen
                </button>
                <button
                  onClick={stampOut}
                  disabled={!openEntry}
                  className="bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded-xl px-4 py-3 font-semibold transition"
                >
                  ⏹ Gehen
                </button>
              </div>
              {openEntry && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700">
                  Läuft seit {fmtTime(openEntry.start_time)} Uhr
                </div>
              )}
              {msg && (
                <div className={`rounded-xl p-3 text-sm ${msg.startsWith('✅') ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {msg}
                </div>
              )}
              {entries.length > 0 && (
                <div className="text-sm text-[#424245] border-t border-black/10 pt-3">
                  Heute erfasst: <strong className="text-[#e8590c]">{todayHours.toLocaleString('de-DE')} h</strong>
                  <ul className="mt-1 space-y-1 text-[#86868b]">
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
            <section className="bg-[#f5f5f7] border border-black/10 rounded-xl p-4 space-y-3">
              <h2 className="font-semibold">🩺 Krank / Urlaub melden</h2>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setAbsType('sick')}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${absType === 'sick' ? 'border-red-500 bg-red-50' : 'border-black/10 bg-white/50'}`}
                >
                  🤒 Krank
                </button>
                <button
                  onClick={() => setAbsType('vacation')}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${absType === 'vacation' ? 'border-blue-500 bg-blue-50' : 'border-black/10 bg-white/50'}`}
                >
                  🏖️ Urlaub
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[#86868b] mb-1">Von</label>
                  <input type="date" value={absFrom} onChange={e => setAbsFrom(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-sm text-[#86868b] mb-1">Bis</label>
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
                <div className={`rounded-xl p-3 text-sm ${absMsg.startsWith('✅') ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {absMsg}
                </div>
              )}
              <button
                onClick={submitAbsence}
                disabled={absSaving || !meId}
                className="w-full bg-[#e8590c] hover:bg-[#d9480f] text-white disabled:opacity-40 rounded-xl px-4 py-3 font-semibold transition"
              >
                {absSaving ? 'Sende…' : 'Meldung absenden'}
              </button>
              <p className="text-[#86868b] text-xs">
                Die Meldung erscheint sofort in der Planung – die Disposition kann Personal und Fahrten umplanen.
              </p>
            </section>
          </div>
        )}

        {/* ═══ REITER 3: BAUSTELLEN-DOKUMENTATION ═══ */}
        {activeTab === 'dokumentation' && (
          <div className="space-y-5">
            <section className="bg-[#f5f5f7] border border-black/10 rounded-xl p-4">
              <label className="block text-sm text-[#86868b] mb-1">Projekt / Baustelle *</label>
              {dokLoading ? (
                <p className="text-sm text-[#86868b]">Lade Projekte…</p>
              ) : (
                <select value={dokProjectId} onChange={e => selectDokProject(e.target.value)} className={inputCls}>
                  <option value="">– Projekt wählen –</option>
                  {dokProjects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.adresse || p.id} {p.status === 'completed' ? '(abgeschlossen)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </section>
            {dokProjectId && <ProjektDokumentation projectId={dokProjectId} employeeId={meId || null} />}
          </div>
        )}

        {/* ═══ REITER 4: LOHNABRECHNUNGEN ═══ */}
        {activeTab === 'lohnabrechnung' && (
          <section className="bg-[#f5f5f7] border border-black/10 rounded-xl p-4 space-y-3">
            <h2 className="font-semibold">💶 Lohnabrechnungen</h2>
            {!meId ? (
              <p className="text-sm text-[#86868b]">Bitte zuerst oben deinen Namen wählen.</p>
            ) : lohnLoading ? (
              <p className="text-sm text-[#86868b]">Lade…</p>
            ) : lohnDocs.length === 0 ? (
              <p className="text-sm text-[#86868b]">Noch keine Lohnabrechnung hinterlegt. Deine Geschäftsführung legt sie hier ab, sobald sie fertig ist.</p>
            ) : (
              <ul className="space-y-2">
                {lohnDocs.map(d => (
                  <li key={d.id} className="bg-white border border-black/10 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{d.month}</div>
                      <div className="text-[#86868b] text-xs">{d.file_name}{d.sent_at ? ' · zuletzt versendet' : ''}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => lohnAnsehen(d.id)} className="text-sm px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 transition">👁️ Ansehen</button>
                      <button onClick={() => lohnHerunterladen(d.id)} className="text-sm px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 transition">⬇️ Als PDF speichern</button>
                      <button
                        onClick={() => lohnVersenden(d.id)}
                        disabled={lohnSending === d.id}
                        className="text-sm px-3 py-1.5 rounded-lg bg-[#e8590c]/10 hover:bg-[#e8590c]/20 text-[#e8590c] transition disabled:opacity-50"
                      >
                        {lohnSending === d.id ? '⏳ …' : '✉️ Versenden'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {lohnMsg && (
              <div className={`rounded-xl p-3 text-sm ${lohnMsg.startsWith('✅') ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                {lohnMsg}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
