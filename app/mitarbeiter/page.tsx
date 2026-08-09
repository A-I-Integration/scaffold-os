'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// SCAFFOLD OS – Mitarbeiter & Zugänge (nur CEO + Dispo)
// Phase 6 / Stufe 2
// • Übersicht: welcher Mitarbeiter hat schon einen Login?
// • Neuer Mitarbeiter MIT Login anlegen
// • Bestehenden Mitarbeiter mit neuem Login verknüpfen
// ============================================================

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  status: string;
  user_id: string | null;
}

const ROLES = [
  { value: 'mitarbeiter', label: 'Mitarbeiter – Stempeln, eigene Fahrten, Krank/Urlaub' },
  { value: 'lager', label: 'Lager – Lager + Stempeln + Krank/Urlaub' },
  { value: 'bauleiter', label: 'Bauleiter – Aufmaß, Lager, Übersicht, Stempeln' },
  { value: 'disponent', label: 'Dispo – Mitarbeiter, Touren, Verwaltung' },
  { value: 'admin', label: 'CEO/Admin – alles' },
];

function randomPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let pw = '';
  for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

export default function MitarbeiterPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Formular
  const [linkExisting, setLinkExisting] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('mitarbeiter');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setEmployees(json.employees || []);
      else setError(json.error || 'Fehler beim Laden');
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const unlinked = employees.filter(e => !e.user_id);

  async function submit() {
    setMsg(null);
    if (!email.trim() || !password) { setMsg({ ok: false, text: 'E-Mail und Passwort sind Pflicht.' }); return; }
    if (!linkExisting && (!firstName.trim() || !lastName.trim())) {
      setMsg({ ok: false, text: 'Vor- und Nachname fehlen – oder oben einen bestehenden Mitarbeiter wählen.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          password,
          role,
          employee_id: linkExisting || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMsg({
        ok: true,
        text: `✅ Zugang angelegt! Bitte an den Mitarbeiter weitergeben:\nE-Mail: ${email.trim()}\nPasswort: ${password}`,
      });
      setFirstName(''); setLastName(''); setEmail(''); setPassword(''); setLinkExisting('');
      load();
    } catch (e: any) {
      setMsg({ ok: false, text: '❌ ' + e.message });
    }
    setSaving(false);
  }

  const inputCls = 'w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold">👥 Mitarbeiter & Zugänge</h1>
          <p className="text-slate-400 mt-1">Logins anlegen und Mitarbeiter verknüpfen – nur für CEO und Dispo.</p>
        </header>

        {error && <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 text-red-200">{error}</div>}

        {/* ─── Formular: Neuer Zugang ─── */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">🔑 Neuen Zugang anlegen</h2>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Bestehenden Mitarbeiter verknüpfen (optional)</label>
            <select value={linkExisting} onChange={e => setLinkExisting(e.target.value)} className={inputCls}>
              <option value="">– Neuer Mitarbeiter (unten Name eingeben) –</option>
              {unlinked.map(e => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
              ))}
            </select>
          </div>

          {!linkExisting && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Vorname *</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} className={inputCls} placeholder="Max" />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Nachname *</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} className={inputCls} placeholder="Mustermann" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">E-Mail (Login) *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="max@firma.de" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Passwort *</label>
              <div className="flex gap-2">
                <input value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="mind. 6 Zeichen" />
                <button type="button" onClick={() => setPassword(randomPassword())}
                  className="shrink-0 rounded-lg bg-slate-700 hover:bg-slate-600 px-3 text-sm transition">
                  🎲 Vorschlagen
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Rolle *</label>
            <select value={role} onChange={e => setRole(e.target.value)} className={inputCls}>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <button onClick={submit} disabled={saving}
            className="rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-5 py-2.5 font-semibold transition">
            {saving ? '⏳ Lege an…' : '🔑 Zugang anlegen'}
          </button>

          {msg && (
            <div className={`rounded-xl p-4 whitespace-pre-line ${msg.ok ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-200' : 'bg-red-900/40 border border-red-700 text-red-200'}`}>
              {msg.text}
            </div>
          )}
        </section>

        {/* ─── Tabelle: Übersicht ─── */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold mb-4">📋 Übersicht ({employees.length})</h2>
          {loading ? (
            <p className="text-slate-400">Lade…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-800">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">E-Mail</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Login</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(e => (
                    <tr key={e.id} className="border-b border-slate-800/60">
                      <td className="py-2.5 pr-4 font-medium">{e.first_name} {e.last_name}</td>
                      <td className="py-2.5 pr-4 text-slate-400">{e.email || '–'}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${e.status === 'active' ? 'bg-emerald-700/50 text-emerald-200' : 'bg-slate-700 text-slate-300'}`}>
                          {e.status === 'active' ? 'Aktiv' : e.status}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {e.user_id
                          ? <span className="text-emerald-400">✅ verknüpft</span>
                          : <span className="text-slate-500">❌ kein Login</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
