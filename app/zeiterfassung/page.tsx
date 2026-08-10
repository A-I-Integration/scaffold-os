'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { workdaysInMonth, BREAK_RULE_TEXT } from '@/lib/worktime';
import {
  Clock, ChevronDown, ChevronRight, Download, Plus, Pencil, X, Check,
} from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Monatsübersicht Zeiterfassung (Nr. 6)
//
// Für admin / disponent / bauleiter (lesen).
// Korrigieren & Nachtragen: nur admin / disponent
// (wird zusätzlich in /api/zeiterfassung erzwungen).
//
// • Stunden je Mitarbeiter/Monat + Pause
// • Soll-Vergleich (Wochenstunden ÷ 5 × Arbeitstage Mo–Fr)
// • Überstunden (Differenz)
// • Korrektur + Nachtragen direkt in der Übersicht
// • CSV-Export (Excel-tauglich, ; und Komma-Dezimal)
// ============================================================

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  weekly_hours: number;
  status: string;
}

interface Entry {
  id: string;
  employee_id: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  hours: number | null;
  break_minutes: number | null;
  note: string | null;
}

interface Summary { ist_hours: number; pause_minutes: number; days: number }

const fmtH = (n: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtTime = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

function currentMonth(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

export default function ZeiterfassungPage() {
  const [month, setMonth] = useState(currentMonth());
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entriesBy, setEntriesBy] = useState<Record<string, Entry[]>>({});
  const [summary, setSummary] = useState<Record<string, Summary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  // Korrektur-/Nachtragen-Formular
  const [editId, setEditId] = useState<string | null>(null);
  const [fVon, setFVon] = useState('');
  const [fBis, setFBis] = useState('');
  const [fStunden, setFStunden] = useState('');
  const [fPause, setFPause] = useState('');
  const [fNotiz, setFNotiz] = useState('');
  const [addFor, setAddFor] = useState<string | null>(null);
  const [aDatum, setADatum] = useState('');
  const [saving, setSaving] = useState(false);

  // Rolle holen → darf korrigieren?
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setCanEdit(p?.role === 'admin' || p?.role === 'disponent');
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let ep = `/api/zeiterfassung?month=${month}`;
      if (employeeFilter) ep += `&employee_id=${employeeFilter}`;
      const res = await fetch(ep, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setEmployees(json.employees);
      setEntriesBy(json.entriesByEmployee);
      setSummary(json.summary);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [month, employeeFilter]);

  useEffect(() => { load(); }, [load]);

  // ─── Soll-Berechnung (Wochenstunden ÷ 5 × Arbeitstage Mo–Fr) ───
  const workdays = workdaysInMonth(month);
  const sollFor = (emp: Employee) =>
    Math.round((((emp.weekly_hours || 40) / 5) * workdays) * 100) / 100;

  // ─── Korrektur starten ───
  function startEdit(e: Entry) {
    setEditId(e.id);
    setFVon(e.start_time ? fmtTime(e.start_time) : '');
    setFBis(e.end_time ? fmtTime(e.end_time) : '');
    setFStunden(e.hours !== null ? String(e.hours).replace('.', ',') : '');
    setFPause(e.break_minutes ? String(e.break_minutes) : '');
    setFNotiz(e.note || '');
    setAddFor(null);
  }

  function startAdd(empId: string) {
    setAddFor(empId);
    setADatum(`${month}-01`);
    setFVon(''); setFBis(''); setFStunden(''); setFPause(''); setFNotiz('');
    setEditId(null);
  }

  function resetForm() {
    setEditId(null); setAddFor(null);
    setFVon(''); setFBis(''); setFStunden(''); setFPause(''); setFNotiz('');
  }

  // Von/Bis (lokal eingegeben) → ISO für die API
  function toISO(datum: string, hhmm: string): string | null {
    if (!hhmm) return null;
    return new Date(`${datum}T${hhmm}:00`).toISOString();
  }

  // ─── Speichern: Korrektur ───
  async function saveEdit(e: Entry) {
    setSaving(true); setMsg('');
    try {
      const body: any = { id: e.id };
      if (fVon && fBis) {
        body.start_time = toISO(e.work_date, fVon);
        body.end_time = toISO(e.work_date, fBis);
      } else if (fStunden) {
        body.hours = parseFloat(fStunden.replace(',', '.'));
        body.break_minutes = fPause ? parseInt(fPause, 10) : 0;
      } else {
        throw new Error('Entweder Von+Bis oder Stunden angeben.');
      }
      body.note = fNotiz || null;

      const res = await fetch('/api/zeiterfassung', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg('✅ Eintrag korrigiert.');
      resetForm();
      load();
    } catch (err: any) {
      setMsg('Fehler: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── Speichern: Nachtragen ───
  async function saveAdd(empId: string) {
    setSaving(true); setMsg('');
    try {
      if (!aDatum) throw new Error('Datum fehlt.');
      const body: any = { employee_id: empId, work_date: aDatum, note: fNotiz || null };
      if (fVon && fBis) {
        body.start_time = toISO(aDatum, fVon);
        body.end_time = toISO(aDatum, fBis);
      } else if (fStunden) {
        body.hours = parseFloat(fStunden.replace(',', '.'));
        if (fPause) body.break_minutes = parseInt(fPause, 10);
      } else {
        throw new Error('Entweder Von+Bis oder Stunden angeben.');
      }

      const res = await fetch('/api/zeiterfassung', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg('✅ Eintrag nachgetragen.');
      resetForm();
      load();
    } catch (err: any) {
      setMsg('Fehler: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  // ─── CSV-Export (Excel: ; getrennt, Komma-Dezimal, BOM) ───
  function exportCSV() {
    const zq = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    const zahl = (n: number) => String(n).replace('.', ',');
    const lines: string[] = ['Mitarbeiter;Datum;Von;Bis;Pause (min);Stunden;Notiz'];

    for (const emp of employees) {
      const es = entriesBy[emp.id] || [];
      if (es.length === 0) continue;
      const name = `${emp.last_name}, ${emp.first_name}`;
      for (const e of es) {
        lines.push([
          zq(name), fmtDate(e.work_date), fmtTime(e.start_time), fmtTime(e.end_time),
          e.break_minutes || 0,
          e.hours !== null ? zahl(e.hours) : 'läuft',
          zq(e.note || ''),
        ].join(';'));
      }
      const s = summary[emp.id];
      if (s) {
        const soll = sollFor(emp);
        lines.push(`${zq(name + ' – SUMME')};;; ${s.pause_minutes} ;${zahl(s.ist_hours)};`);
        lines.push(`${zq(name + ' – SOLL')};;;;;${zahl(soll)};`);
        lines.push(`${zq(name + ' – DIFFERENZ')};;;;;${zahl(Math.round((s.ist_hours - soll) * 100) / 100)};`);
      }
    }

    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zeiterfassung_${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ─── Formular (Korrektur + Nachtragen, gleiche Felder) ───
  function formular(onSave: () => void, datum?: string) {
    const input = 'bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-amber-400';
    return (
      <div className="bg-[#0f172a] border border-amber-500/40 rounded-lg p-3 mt-2 space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>
            <label className="text-xs text-slate-400">Von</label>
            <input type="time" value={fVon} onChange={e => setFVon(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Bis</label>
            <input type="time" value={fBis} onChange={e => setFBis(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-xs text-slate-400">oder Stunden (Netto)</label>
            <input inputMode="decimal" placeholder="z. B. 7,5" value={fStunden} onChange={e => setFStunden(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-xs text-slate-400">Pause (min)</label>
            <input inputMode="numeric" placeholder="0" value={fPause} onChange={e => setFPause(e.target.value)} className={input} />
          </div>
        </div>
        <input placeholder="Notiz (optional)" value={fNotiz} onChange={e => setFNotiz(e.target.value)} className={input} />
        <p className="text-xs text-slate-500">
          Von+Bis → Pause automatisch ({BREAK_RULE_TEXT}). Nur Stunden → gilt als Netto.
        </p>
        <div className="flex gap-2">
          <button onClick={onSave} disabled={saving}
            className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Check className="w-4 h-4" /> {saving ? 'Speichert …' : 'Speichern'}
          </button>
          <button onClick={resetForm}
            className="inline-flex items-center gap-1.5 border border-slate-600 text-slate-300 text-sm px-4 py-2 rounded-lg hover:border-slate-400 transition-colors">
            <X className="w-4 h-4" /> Abbrechen
          </button>
        </div>
      </div>
    );
  }

  const gesamtIst = employees.reduce((s, e) => s + (summary[e.id]?.ist_hours || 0), 0);
  const gesamtSoll = employees
    .filter(e => (summary[e.id]?.ist_hours || 0) > 0)
    .reduce((s, e) => s + sollFor(e), 0);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto text-white">
      {/* Kopf */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Clock className="w-7 h-7 text-amber-400" />
        <h1 className="text-2xl font-bold">Zeiterfassung</h1>
        <div className="flex items-center gap-3 ml-auto">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400" />
          <select value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}
            className="bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400">
            <option value="">Alle Mitarbeiter</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.last_name}, {e.first_name}</option>
            ))}
          </select>
          <button onClick={exportCSV}
            className="inline-flex items-center gap-1.5 border border-slate-600 hover:border-amber-400 text-slate-300 hover:text-amber-400 text-sm px-4 py-2 rounded-lg transition-colors">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {msg && (
        <div className={`rounded-lg p-3 text-sm mb-4 ${msg.startsWith('✅') ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-200' : 'bg-red-900/40 border border-red-700 text-red-200'}`}>
          {msg}
        </div>
      )}
      {error && (
        <div className="rounded-lg p-3 text-sm mb-4 bg-red-900/40 border border-red-700 text-red-200">{error}</div>
      )}

      {/* Summen-Karten */}
      {!loading && !error && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4">
            <p className="text-xs text-slate-400">Ist-Stunden</p>
            <p className="text-2xl font-bold text-amber-400">{fmtH(Math.round(gesamtIst * 100) / 100)}</p>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4">
            <p className="text-xs text-slate-400">Soll (aktive MA mit Stunden)</p>
            <p className="text-2xl font-bold">{fmtH(Math.round(gesamtSoll * 100) / 100)}</p>
          </div>
          <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4">
            <p className="text-xs text-slate-400">Differenz</p>
            <p className={`text-2xl font-bold ${gesamtIst - gesamtSoll >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {gesamtIst - gesamtSoll >= 0 ? '+' : ''}{fmtH(Math.round((gesamtIst - gesamtSoll) * 100) / 100)}
            </p>
          </div>
        </div>
      )}

      {loading && <p className="text-slate-400">Lade Monatsdaten …</p>}

      {/* Mitarbeiter-Tabelle */}
      {!loading && !error && employees.map(emp => {
        const s = summary[emp.id] || { ist_hours: 0, pause_minutes: 0, days: 0 };
        const es = entriesBy[emp.id] || [];
        const soll = sollFor(emp);
        const diff = Math.round((s.ist_hours - soll) * 100) / 100;
        const isOpen = open === emp.id;
        if (employeeFilter === '' && es.length === 0) return null; // ohne Einträge ausblenden (bei „Alle")

        return (
          <div key={emp.id} className="bg-[#1e293b] border border-[#334155] rounded-xl mb-3 overflow-hidden">
            <button onClick={() => setOpen(isOpen ? null : emp.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700/30 transition-colors text-left">
              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <span className="font-semibold">{emp.last_name}, {emp.first_name}</span>
              {emp.status !== 'active' && <span className="text-xs text-slate-500">({emp.status})</span>}
              <span className="ml-auto text-sm text-slate-400">{s.days} Tage</span>
              <span className="text-sm text-slate-400 w-28 text-right">Pause {s.pause_minutes} min</span>
              <span className="text-sm font-semibold text-amber-400 w-20 text-right">{fmtH(s.ist_hours)} h</span>
              <span className="text-sm text-slate-400 w-20 text-right">/ {fmtH(soll)} h</span>
              <span className={`text-sm font-semibold w-20 text-right ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {diff >= 0 ? '+' : ''}{fmtH(diff)}
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-[#334155] px-4 py-3">
                {es.length === 0 && <p className="text-sm text-slate-500">Keine Einträge in diesem Monat.</p>}
                {es.map(e => (
                  <div key={e.id} className="py-2 border-b border-slate-700/50 last:border-0">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="text-slate-400 w-14">{fmtDate(e.work_date)}</span>
                      <span>{fmtTime(e.start_time)} – {fmtTime(e.end_time)}</span>
                      <span className="text-slate-400">
                        {e.hours !== null ? `${fmtH(e.hours)} h` : 'läuft'}
                        {e.break_minutes ? ` · Pause ${e.break_minutes} min` : ''}
                      </span>
                      {e.note && <span className="text-slate-500">· {e.note}</span>}
                      {canEdit && editId !== e.id && (
                        <button onClick={() => startEdit(e)}
                          className="ml-auto inline-flex items-center gap-1 text-xs border border-slate-600 hover:border-amber-400 text-slate-300 hover:text-amber-400 px-2.5 py-1 rounded-md transition-colors">
                          <Pencil className="w-3 h-3" /> Bearbeiten
                        </button>
                      )}
                    </div>
                    {canEdit && editId === e.id && formular(() => saveEdit(e))}
                  </div>
                ))}

                {canEdit && addFor !== emp.id && (
                  <button onClick={() => startAdd(emp.id)}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm border border-slate-600 hover:border-amber-400 text-slate-300 hover:text-amber-400 px-3 py-1.5 rounded-lg transition-colors">
                    <Plus className="w-4 h-4" /> Tag nachtragen
                  </button>
                )}
                {canEdit && addFor === emp.id && (
                  <div className="mt-3">
                    <label className="text-xs text-slate-400">Datum</label>
                    <input type="date" value={aDatum} onChange={e => setADatum(e.target.value)}
                      min={`${month}-01`} max={`${month}-31`}
                      className="block bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-sm text-white mb-1 focus:outline-none focus:border-amber-400" />
                    {formular(() => saveAdd(emp.id))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!loading && !error && (
        <p className="text-xs text-slate-500 mt-4">
          Soll = Wochenstunden ÷ 5 × Arbeitstage (Mo–Fr, ohne Feiertage).
          Beim laufenden Monat zählt das Soll nur bis heute. Pause: {BREAK_RULE_TEXT} (automatisch beim Ausstempeln).
        </p>
      )}
    </div>
  );
}
