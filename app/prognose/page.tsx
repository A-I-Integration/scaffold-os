'use client';

import { useState, useEffect, useCallback } from 'react';
import KiHinweis from '@/components/KiHinweis';

// ============================================================
// SCAFFOLD OS – Lager-Prognose (Nr. 4)
// Verbrauchs-basierte Vorhersage pro Artikel:
// „Reicht noch X Tage" + Ampel + Bestellvorschlag.
// Optional: KI-Einschätzung als Text (wenn KI_API_KEY gesetzt).
// Für CEO, Dispo, Lager.
// ============================================================

interface Row {
  id: string; name: string; unit: string;
  quantity: number; min_stock: number; unit_price: number;
  pending_out: number; effective_stock: number;
  usage_30d: number; daily_rate: number;
  days_left: number | null;
  status: 'critical' | 'warning' | 'ok' | 'idle';
  suggested_order: number; order_value: number;
}

interface Kpis { critical: number; warning: number; idle: number; totalOrderValue: number; totalItems: number; }

const AMPEL: Record<string, { label: string; cls: string }> = {
  critical: { label: '🔴 Kritisch', cls: 'bg-red-900/50 text-red-200 border border-red-700' },
  warning:  { label: '🟡 Knapp',    cls: 'bg-amber-900/50 text-amber-200 border border-amber-700' },
  ok:       { label: '🟢 OK',       cls: 'bg-emerald-900/50 text-emerald-200 border border-emerald-700' },
  idle:     { label: '⚪ Kein Verbrauch', cls: 'bg-slate-800 text-slate-400 border border-slate-700' },
};

export default function PrognosePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // KI-Einschätzung
  const [kiLoading, setKiLoading] = useState(false);
  const [kiText, setKiText] = useState('');
  const [kiError, setKiError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/prognose?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setRows(json.rows || []);
      setKpis(json.kpis || null);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function askKi() {
    setKiLoading(true); setKiError(''); setKiText('');
    try {
      const res = await fetch('/api/prognose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, kpis }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setKiText(json.summary);
    } catch (e: any) { setKiError(e.message); }
    setKiLoading(false);
  }

  const fmtEuro = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">📈 Lager-Prognose</h1>
            <p className="text-slate-400 mt-1">
              Verbrauchs-basierte Vorhersage aus den gelieferten Transporten der letzten 30 Tage.
            </p>
          </div>
          <button
            onClick={askKi}
            disabled={kiLoading || loading || rows.length === 0}
            className="rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 px-5 py-2.5 font-semibold transition"
          >
            {kiLoading ? '⏳ KI denkt…' : '🤖 KI-Einschätzung'}
          </button>
          <KiHinweis text="KI-gestützte Einschätzung zum Lagerbestand – bitte vor Bestellungen prüfen." />
        </header>

        {error && <div className="bg-red-900/40 border border-red-700 rounded-xl p-4 text-red-200">{error}</div>}

        {/* KI-Ergebnis */}
        {kiText && (
          <div className="bg-purple-950/50 border border-purple-700 rounded-2xl p-5 whitespace-pre-line text-sm leading-relaxed">
            <div className="font-semibold text-purple-300 mb-2">🤖 KI-Einschätzung</div>
            {kiText}
          </div>
        )}
        {kiError && (
          <div className="bg-amber-900/30 border border-amber-700 rounded-xl p-4 text-amber-200 text-sm">
            ⚠️ {kiError}
          </div>
        )}

        {/* KPI-Kacheln */}
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs mb-1">Kritische Artikel</div>
              <div className={`text-2xl font-bold ${kpis.critical > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{kpis.critical}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs mb-1">Warnungen</div>
              <div className={`text-2xl font-bold ${kpis.warning > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{kpis.warning}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs mb-1">Empfohlener Bestellwert</div>
              <div className="text-2xl font-bold text-blue-400">{fmtEuro(kpis.totalOrderValue)}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs mb-1">Ohne Bewegung (Kapitalbinder)</div>
              <div className="text-2xl font-bold text-slate-300">{kpis.idle}</div>
            </div>
          </div>
        )}

        {/* Tabelle */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 overflow-x-auto">
          {loading ? (
            <p className="text-slate-400">Lade…</p>
          ) : rows.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">Keine aktiven Lager-Artikel gefunden.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="py-2 pr-4">Artikel</th>
                  <th className="py-2 pr-4 text-right">Bestand</th>
                  <th className="py-2 pr-4 text-right">Eingeplant</th>
                  <th className="py-2 pr-4 text-right">Ø Verbrauch/Tag</th>
                  <th className="py-2 pr-4 text-right">Reicht noch</th>
                  <th className="py-2 pr-4">Ampel</th>
                  <th className="py-2 pr-4 text-right">Bestellvorschlag</th>
                  <th className="py-2 text-right">Wert</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b border-slate-800/60">
                    <td className="py-2.5 pr-4 font-medium">{r.name}</td>
                    <td className="py-2.5 pr-4 text-right">{r.quantity} {r.unit}</td>
                    <td className="py-2.5 pr-4 text-right text-slate-400">
                      {r.pending_out > 0 ? `−${r.pending_out}` : '–'}
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      {r.daily_rate > 0 ? `${r.daily_rate.toLocaleString('de-DE')} ${r.unit}` : '–'}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-semibold">
                      {r.days_left === null ? '∞' : (
                        <span className={r.days_left < 7 ? 'text-red-400' : r.days_left < 14 ? 'text-amber-400' : ''}>
                          {r.days_left} Tage
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${AMPEL[r.status].cls}`}>
                        {AMPEL[r.status].label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-right font-semibold text-blue-300">
                      {r.suggested_order > 0 ? `${r.suggested_order} ${r.unit}` : '–'}
                    </td>
                    <td className="py-2.5 text-right text-slate-400">
                      {r.suggested_order > 0 ? fmtEuro(r.order_value) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="text-slate-500 text-xs">
          💡 „Eingeplant" = offene/unterwegs Transporte, die den Bestand schon belasten.
          „Reicht noch" = (Bestand − eingeplant) ÷ Ø Tagesverbrauch. Bestellvorschlag füllt auf 30 Tage + Mindestbestand auf.
        </p>
      </div>
    </div>
  );
}
