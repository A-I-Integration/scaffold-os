'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// SCAFFOLD OS – Datenpflege (nur CEO/Admin)
// Alle Bereiche an einem Ort: ansehen, bearbeiten, löschen.
// Ideal, um Testdaten aufzuräumen und Tippfehler zu korrigieren.
// Bearbeiten: Zeile wird zum Formular. Löschen: mit Abfrage.
// ============================================================

type Row = Record<string, any>;

interface Col {
  key: string;
  label: string;
  edit?: boolean;          // darf bearbeitet werden?
  type?: 'text' | 'number' | 'date';
  render?: (r: Row) => string; // nur Anzeige (z.B. verknüpfte Namen)
}

interface Section {
  key: string;             // Schlüssel in den API-Daten
  table: string;           // Tabellenname für die API
  title: string;
  icon: string;
  columns: Col[];
}

const SECTIONS: Section[] = [
  {
    key: 'projects', table: 'projects', title: 'Projekte', icon: '🏗️',
    columns: [
      { key: 'name', label: 'Name', edit: true },
      { key: 'adresse', label: 'Adresse', edit: true },
      { key: 'status', label: 'Status', edit: true },
      { key: 'created_at', label: 'Erstellt', render: r => new Date(r.created_at).toLocaleDateString('de-DE') },
    ],
  },
  {
    key: 'inventory', table: 'inventory', title: 'Lager-Artikel', icon: '📦',
    columns: [
      { key: 'name', label: 'Artikel', edit: true },
      { key: 'quantity', label: 'Menge', edit: true, type: 'number' },
      { key: 'min_stock', label: 'Mindestbestand', edit: true, type: 'number' },
      { key: 'unit_price', label: 'Preis €', edit: true, type: 'number' },
      { key: 'is_active', label: 'Aktiv', render: r => (r.is_active ? '✅' : '❌') },
    ],
  },
  {
    key: 'transports', table: 'transport_orders', title: 'Transportaufträge', icon: '🚚',
    columns: [
      { key: 'inventory', label: 'Material', render: r => r.inventory?.name || '–' },
      { key: 'quantity', label: 'Menge', edit: true, type: 'number' },
      { key: 'to_project', label: 'Ziel', render: r => r.to_project?.name || '–' },
      { key: 'status', label: 'Status', edit: true },
      { key: 'priority', label: 'Priorität', edit: true, type: 'number' },
    ],
  },
  {
    key: 'tours', table: 'tours', title: 'Touren', icon: '🗺️',
    columns: [
      { key: 'name', label: 'Name', edit: true },
      { key: 'planned_date', label: 'Datum', edit: true, type: 'date' },
      { key: 'planned_start_time', label: 'Start', edit: true },
      { key: 'driver', label: 'Fahrer', render: r => r.driver?.name || '–' },
      { key: 'vehicle', label: 'Fahrzeug', render: r => r.vehicle?.name || '–' },
      { key: 'status', label: 'Status', edit: true },
    ],
  },
  {
    key: 'vehicles', table: 'vehicles', title: 'Fahrzeuge', icon: '🚛',
    columns: [
      { key: 'name', label: 'Name', edit: true },
      { key: 'license_plate', label: 'Kennzeichen', edit: true },
      { key: 'is_active', label: 'Aktiv', render: r => (r.is_active ? '✅' : '❌') },
    ],
  },
  {
    key: 'drivers', table: 'drivers', title: 'Fahrer', icon: '👷',
    columns: [
      { key: 'name', label: 'Name', edit: true },
      { key: 'employee', label: 'Verknüpft mit', render: r => r.employee ? `${r.employee.first_name} ${r.employee.last_name}` : '–' },
      { key: 'is_active', label: 'Aktiv', render: r => (r.is_active ? '✅' : '❌') },
    ],
  },
  {
    key: 'customers', table: 'customers', title: 'Kunden', icon: '🤝',
    columns: [
      { key: 'name', label: 'Name/Firma', edit: true },
      { key: 'contact_person', label: 'Ansprechpartner', edit: true },
      { key: 'email', label: 'E-Mail', edit: true },
      { key: 'phone', label: 'Telefon', edit: true },
      { key: 'zip', label: 'PLZ', edit: true },
      { key: 'city', label: 'Ort', edit: true },
      { key: 'is_active', label: 'Aktiv', render: r => (r.is_active ? '✅' : '❌') },
    ],
  },
];

export default function DatenpflegePage() {
  const [data, setData] = useState<Record<string, Row[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [section, setSection] = useState<Section>(SECTIONS[0]);

  // Inline-Bearbeitung
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Row>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/data?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData({
        projects: json.projects, inventory: json.inventory, transports: json.transports,
        tours: json.tours, vehicles: json.vehicles, drivers: json.drivers,
      });
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(row: Row) {
    setEditingId(row.id);
    const values: Row = {};
    for (const col of section.columns) {
      if (col.edit) values[col.key] = row[col.key] ?? '';
    }
    setEditValues(values);
    setMsg('');
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(true); setMsg('');
    try {
      const updates: Row = {};
      for (const col of section.columns) {
        if (!col.edit) continue;
        let v = editValues[col.key];
        if (col.type === 'number') v = v === '' ? null : Number(v);
        updates[col.key] = v;
      }
      const res = await fetch('/api/admin/data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: section.table, id: editingId, updates }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg('✅ Gespeichert.');
      setEditingId(null);
      load();
    } catch (e: any) { setMsg('❌ ' + e.message); }
    setBusy(false);
  }

  async function remove(row: Row) {
    const label = row.name || row.inventory?.name || row.id;
    if (!window.confirm(`„${label}" wirklich endgültig löschen?\n\nDas kann nicht rückgängig gemacht werden.`)) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/admin/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: section.table, id: row.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg('✅ Gelöscht.');
      load();
    } catch (e: any) { setMsg('❌ ' + e.message); }
    setBusy(false);
  }

  const rows = data[section.key] || [];
  const inputCls = 'w-full rounded bg-[#f5f5f7] border border-black/10 px-2 py-1 text-sm text-[#1d1d1f] focus:border-[#e8590c] focus:outline-none';

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold">🗄️ Datenpflege</h1>
          <p className="text-[#86868b] mt-1">
            Alle Daten ansehen, korrigieren und löschen – nur für dich als CEO.
            Ideal, um Testdaten aufzuräumen.
          </p>
        </header>

        {/* Bereichs-Tabs */}
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map(s => (
            <button
              key={s.key}
              onClick={() => { setSection(s); setEditingId(null); setMsg(''); }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                section.key === s.key ? 'bg-amber-600 text-[#1d1d1f]' : 'bg-[#f5f5f7] text-[#424245] hover:bg-black/10'
              }`}
            >
              {s.icon} {s.title} ({(data[s.key] || []).length})
            </button>
          ))}
        </div>

        {error && <div className="bg-red-900/40 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>}
        {msg && <div className={`rounded-xl p-3 text-sm ${msg.startsWith('✅') ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>{msg}</div>}

        <section className="bg-white border border-black/5 rounded-2xl p-5 overflow-x-auto">
          {loading ? (
            <p className="text-[#86868b]">Lade…</p>
          ) : rows.length === 0 ? (
            <p className="text-[#86868b] text-sm py-4 text-center">Keine Einträge in „{section.title}".</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#86868b] border-b border-black/5">
                  {section.columns.map(c => <th key={c.key} className="py-2 pr-4 whitespace-nowrap">{c.label}</th>)}
                  <th className="py-2 text-right whitespace-nowrap">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const isEditing = editingId === row.id;
                  return (
                    <tr key={row.id} className="border-b border-black/5/60 align-top">
                      {section.columns.map(col => (
                        <td key={col.key} className="py-2.5 pr-4">
                          {isEditing && col.edit ? (
                            <input
                              type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text'}
                              step={col.type === 'number' ? 'any' : undefined}
                              value={editValues[col.key] ?? ''}
                              onChange={e => setEditValues({ ...editValues, [col.key]: e.target.value })}
                              className={inputCls}
                            />
                          ) : (
                            <span className="whitespace-nowrap">
                              {col.render ? col.render(row) : String(row[col.key] ?? '–')}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="py-2.5 text-right whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <button onClick={saveEdit} disabled={busy} className="text-emerald-600 hover:text-emerald-700 font-medium mr-3 disabled:opacity-40">
                              💾 Speichern
                            </button>
                            <button onClick={() => setEditingId(null)} className="text-[#86868b] hover:text-[#1d1d1f]">
                              ✖ Abbrechen
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(row)} disabled={busy} className="text-[#e8590c] hover:text-[#e8590c] font-medium mr-3 disabled:opacity-40">
                              ✏️ Bearbeiten
                            </button>
                            <button onClick={() => remove(row)} disabled={busy} className="text-red-600 hover:text-red-700 font-medium disabled:opacity-40">
                              🗑️ Löschen
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <p className="text-[#86868b] text-xs">
          💡 Hinweis: Einträge, die noch woanders benutzt werden (z.B. ein Projekt in einem Transport),
          lassen sich erst löschen, wenn die abhängigen Einträge weg sind – die App sagt dir dann Bescheid.
        </p>
      </div>
    </div>
  );
}
