'use client';

import { useState, useEffect } from 'react';

interface PlanStopp { projekt: string; aktion: string; transport_order_ids?: string[] }
interface PlanTour { name: string; fahrzeug: string; fahrer: string; stopps: PlanStopp[]; begruendung?: string }
interface Umladung { von: string; nach: string; material: string; menge: string; grund?: string }
interface Plan {
  touren: PlanTour[];
  umladungen: Umladung[];
  leerfahrt_hinweise: string[];
  warnungen: string[];
}
interface Meta {
  date: string;
  ordersCount: number;
  geocoded: number;
  failedAddresses: string[];
  matrixOk: boolean;
  vehicles: { id: string; name: string }[];
  drivers: { id: string; name: string }[];
}
interface UmdispoVorschlag { tour: string; betroffen: string; ersatz: string; begruendung: string }
interface UmdispoResult { zusammenfassung: string; vorschlaege: UmdispoVorschlag[]; warnungen: string[] }

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function RoutenoptimierungPage() {
  const [date, setDate] = useState(tomorrowISO());
  const [depot, setDepot] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [created, setCreated] = useState<Set<string>>(new Set());

  const [umdispoLoading, setUmdispoLoading] = useState(false);
  const [umdispo, setUmdispo] = useState<UmdispoResult | null>(null);
  const [umdispoError, setUmdispoError] = useState<string | null>(null);

  useEffect(() => {
    // Phase 14: Depot kommt aus dem Firmenprofil (Einstellungen),
    // localStorage nur noch als persönlicher Fallback
    const saved = localStorage.getItem('scaffold_depot_address');
    if (saved) setDepot(saved);
    (async () => {
      try {
        const res = await fetch('/api/company');
        const json = await res.json();
        if (json.success && json.company?.depot_address) {
          setDepot((cur) => cur || json.company.depot_address);
        }
      } catch { /* optional */ }
    })();
  }, []);

  async function handlePlan() {
    setLoading(true);
    setError(null);
    setPlan(null);
    setCreated(new Set());
    localStorage.setItem('scaffold_depot_address', depot);
    try {
      const res = await fetch('/api/routen-ki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, depotAddress: depot || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Planung fehlgeschlagen');
      setPlan(json.plan);
      setMeta(json.meta);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTour(t: PlanTour) {
    if (!meta) return;
    setCreating(t.name);
    try {
      const vehicle = meta.vehicles.find((v) => v.name === t.fahrzeug);
      const driver = meta.drivers.find((d) => d.name === t.fahrer);
      if (!vehicle) throw new Error(`Fahrzeug "${t.fahrzeug}" nicht gefunden`);
      if (!driver) throw new Error(`Fahrer "${t.fahrer}" nicht gefunden`);

      const orderIds = (t.stopps || []).flatMap((s) => s.transport_order_ids || []);
      if (orderIds.length === 0) throw new Error('Keine Transportaufträge in dieser Tour');

      const res = await fetch('/api/tours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: t.name,
          vehicle_id: vehicle.id,
          driver_id: driver.id,
          planned_date: meta.date,
          transport_order_ids: orderIds,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Anlegen fehlgeschlagen');
      setCreated((prev) => new Set(prev).add(t.name));
    } catch (err: any) {
      alert(`Tour "${t.name}": ${err.message}`);
    } finally {
      setCreating(null);
    }
  }

  async function handleUmdispo() {
    setUmdispoLoading(true);
    setUmdispoError(null);
    setUmdispo(null);
    try {
      const res = await fetch('/api/umdisposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Umdisposition fehlgeschlagen');
      setUmdispo(json);
    } catch (err: any) {
      setUmdispoError(err.message);
    } finally {
      setUmdispoLoading(false);
    }
  }

  const input = 'bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400';

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        <div>
          <h1 className="text-2xl font-bold">🧭 Routenoptimierung</h1>
          <p className="text-sm text-slate-400 mt-1">
            KI-Tourenplan aus offenen Transporten, Baustellen-Beständen, Fahrzeugen und echten Fahrzeiten (OpenStreetMap).
          </p>
        </div>

        {/* ─── Einstellungen ─── */}
        <div className="bg-slate-800 rounded-xl p-5 flex flex-col sm:flex-row gap-4 sm:items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Datum</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-slate-400 mb-1">Lager-Adresse (Startpunkt)</label>
            <input
              type="text"
              value={depot}
              onChange={(e) => setDepot(e.target.value)}
              placeholder="z.B. Musterstraße 1, 12345 Berlin"
              className={input + ' w-full'}
            />
          </div>
          <button
            onClick={handlePlan}
            disabled={loading}
            className="px-5 py-2 bg-amber-500 text-slate-900 text-sm font-bold rounded-lg hover:bg-amber-400 disabled:opacity-50 transition"
          >
            {loading ? 'KI plant...' : '🚀 KI-Plan erstellen'}
          </button>
        </div>

        {loading && (
          <div className="rounded-lg bg-slate-800 border border-slate-700 p-4 text-sm text-slate-300 flex items-center gap-3">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            Adressen werden geocodiert und Fahrzeiten berechnet – das kann 20–40 Sekunden dauern...
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-900/20 border border-red-500/30 p-4 text-sm text-red-300">❌ {error}</div>
        )}

        {/* ─── Ergebnis ─── */}
        {plan && meta && (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-2">

            <div className="text-xs text-slate-500">
              {meta.ordersCount} offene Aufträge · {meta.geocoded} Adressen geocodiert
              {!meta.matrixOk && ' · ⚠️ Fahrzeit-Matrix nicht verfügbar (Reihenfolge ohne echte Fahrzeiten)'}
              {meta.failedAddresses.length > 0 && ` · ⚠️ nicht gefunden: ${meta.failedAddresses.join(', ')}`}
            </div>

            {plan.warnungen?.length > 0 && (
              <div className="rounded-lg bg-yellow-900/20 border border-yellow-500/30 p-4">
                <p className="text-xs font-bold text-yellow-300 uppercase mb-2">⚠️ Warnungen</p>
                <ul className="text-sm text-yellow-200 space-y-1 list-disc list-inside">
                  {plan.warnungen.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Touren */}
            <div className="grid gap-4 md:grid-cols-2">
              {(plan.touren || []).map((t) => (
                <div key={t.name} className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-lg">{t.name}</h3>
                      <p className="text-sm text-slate-400">🚚 {t.fahrzeug} · 👷 {t.fahrer}</p>
                    </div>
                    {created.has(t.name) ? (
                      <span className="text-xs font-bold text-green-400 bg-green-900/30 rounded px-2 py-1">✅ angelegt</span>
                    ) : (
                      <button
                        onClick={() => handleCreateTour(t)}
                        disabled={creating === t.name}
                        className="text-xs font-bold bg-green-600 hover:bg-green-500 text-white rounded px-3 py-1.5 disabled:opacity-50 transition"
                      >
                        {creating === t.name ? '...' : 'Tour anlegen'}
                      </button>
                    )}
                  </div>
                  <ol className="space-y-2">
                    {(t.stopps || []).map((s, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="flex-shrink-0 h-6 w-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <div>
                          <p className="text-white font-medium">{s.projekt}</p>
                          <p className="text-slate-400 text-xs">{s.aktion}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {t.begruendung && <p className="text-[11px] text-slate-500 border-t border-slate-700 pt-2">{t.begruendung}</p>}
                </div>
              ))}
            </div>

            {/* Umladungen */}
            {plan.umladungen?.length > 0 && (
              <div className="rounded-xl bg-slate-800 border border-slate-700 p-5">
                <h3 className="font-bold mb-3">🔄 Umladungen Baustelle → Baustelle</h3>
                <div className="space-y-2">
                  {plan.umladungen.map((u, i) => (
                    <div key={i} className="text-sm flex flex-wrap gap-x-2">
                      <span className="text-slate-300">{u.von}</span>
                      <span className="text-slate-500">→</span>
                      <span className="text-slate-300">{u.nach}:</span>
                      <span className="text-white font-medium">{u.menge} {u.material}</span>
                      {u.grund && <span className="text-slate-500">({u.grund})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Leerfahrt-Hinweise */}
            {plan.leerfahrt_hinweise?.length > 0 && (
              <div className="rounded-xl bg-green-900/10 border border-green-500/20 p-5">
                <h3 className="font-bold mb-2 text-green-300">⛽ Leerfahrten vermieden</h3>
                <ul className="text-sm text-green-200 space-y-1 list-disc list-inside">
                  {plan.leerfahrt_hinweise.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ─── Umdisposition bei Ausfällen ─── */}
        <div className="border-t border-slate-700 pt-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">🤒 Umdisposition bei Ausfällen</h2>
              <p className="text-sm text-slate-400 mt-1">
                KI prüft für das gewählte Datum ({date}), welche Touren von Abwesenheiten betroffen sind, und schlägt Ersatzfahrer vor.
              </p>
            </div>
            <button
              onClick={handleUmdispo}
              disabled={umdispoLoading}
              className="px-5 py-2 bg-purple-600 text-white text-sm font-bold rounded-lg hover:bg-purple-500 disabled:opacity-50 transition"
            >
              {umdispoLoading ? 'KI prüft...' : '🔮 KI-Umdisposition'}
            </button>
          </div>

          {umdispoError && (
            <div className="rounded-lg bg-red-900/20 border border-red-500/30 p-4 text-sm text-red-300">❌ {umdispoError}</div>
          )}

          {umdispo && (
            <div className="rounded-xl bg-slate-800 border border-slate-700 p-5 space-y-4 animate-in fade-in slide-in-from-top-2">
              <p className="text-sm text-slate-300">{umdispo.zusammenfassung}</p>
              {umdispo.vorschlaege.length > 0 && (
                <div className="space-y-2">
                  {umdispo.vorschlaege.map((v, i) => (
                    <div key={i} className="rounded-lg bg-slate-900/50 border border-slate-700 p-3 text-sm">
                      <p className="text-white font-medium">{v.tour}</p>
                      <p className="text-slate-400 text-xs mt-1">
                        ❌ {v.betroffen} → ✅ <span className="text-green-300">{v.ersatz}</span>
                      </p>
                      <p className="text-slate-500 text-[11px] mt-1">{v.begruendung}</p>
                    </div>
                  ))}
                </div>
              )}
              {umdispo.warnungen.length > 0 && (
                <ul className="text-sm text-yellow-300 space-y-1 list-disc list-inside">
                  {umdispo.warnungen.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              <p className="text-[10px] text-slate-500">Vorschlag der KI – die Entscheidung trifft die Disposition.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
