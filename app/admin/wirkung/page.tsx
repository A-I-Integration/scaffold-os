'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, TrendingUp } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Pilot-Cockpit „Wirkung" (nur Master-Instanz)
//
// Aggregierte Kennzahlen aller aktiven Pilotbetriebe:
// Rechnungen, Umsatz, Projekte, Marge, Touren, Stunden.
// Grundlage für Investor- und Vertriebsgespräche:
// „Was bringt SCAFFOLD OS einem Betrieb in Euro und Stunden?"
// Daten: /api/admin/wirkung (aggregiert über alle Tenants).
// ============================================================

interface Kunde {
  firma: string;
  subdomain: string | null;
  rechnungen?: number;
  umsatz_eur?: number;
  projekte?: number;
  projekte_abgeschlossen?: number;
  marge_prozent?: number | null;
  touren?: number;
  stunden?: number;
  impact_events?: number;
  fehler?: boolean;
}

interface Gesamt {
  betriebe: number;
  rechnungen: number;
  umsatz_eur: number;
  projekte: number;
  projekte_abgeschlossen: number;
  marge_prozent: number | null;
  touren: number;
  stunden: number;
  impact_events: number;
}

function eur(v: number) {
  return v.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €';
}

export default function WirkungPage() {
  const [gesamt, setGesamt] = useState<Gesamt | null>(null);
  const [kunden, setKunden] = useState<Kunde[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function laden() {
    setError('');
    try {
      const res = await fetch(`/api/admin/wirkung?t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Fehler');
      setGesamt(json.gesamt);
      setKunden(json.kunden || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { laden(); }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fbfbfd] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#e8590c]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f] p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <TrendingUp className="w-7 h-7 text-[#e8590c]" /> Pilot-Wirkung
            </h1>
            <p className="text-[#86868b] text-sm mt-1">
              Echte Kennzahlen aller aktiven Pilotbetriebe – Basis für Vertrieb und Investorengespräche.
            </p>
          </div>
          <button onClick={laden}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-black/10 hover:border-[#e8590c] rounded-full text-sm transition-colors">
            <RefreshCw className="w-4 h-4" /> Aktualisieren
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 text-red-700">Fehler: {error}</div>
        )}

        {gesamt && (
          <>
            {/* ─── Gesamt-Kennzahlen ─── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <KPI label="Aktive Pilotbetriebe" value={gesamt.betriebe} />
              <KPI label="Fakturierter Umsatz" value={eur(gesamt.umsatz_eur)} accent />
              <KPI label="Rechnungen gesamt" value={gesamt.rechnungen} />
              <KPI label="Ø Marge (alle Projekte)" value={gesamt.marge_prozent != null ? gesamt.marge_prozent + ' %' : '–'} accent />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              <KPI label="Projekte gesamt" value={gesamt.projekte} />
              <KPI label="Davon abgeschlossen" value={gesamt.projekte_abgeschlossen} />
              <KPI label="Touren gefahren" value={gesamt.touren} />
              <KPI label="Erfasste Arbeitsstunden" value={gesamt.stunden.toLocaleString('de-DE')} />
            </div>

            {/* ─── Pro Betrieb ─── */}
            <h2 className="text-lg font-semibold mb-3">Pro Betrieb</h2>
            <div className="bg-white border border-black/5 shadow-sm rounded-2xl overflow-x-auto">
              <table className="w-full text-left min-w-[760px] text-sm">
                <thead className="bg-[#f5f5f7] text-[#86868b] text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3">Betrieb</th>
                    <th className="px-4 py-3">Umsatz</th>
                    <th className="px-4 py-3">Rechnungen</th>
                    <th className="px-4 py-3">Projekte</th>
                    <th className="px-4 py-3">Ø Marge</th>
                    <th className="px-4 py-3">Touren</th>
                    <th className="px-4 py-3">Stunden</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {kunden.map((k, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 font-medium">
                        {k.firma}
                        {k.subdomain && <span className="block text-xs text-[#86868b] font-normal">{k.subdomain}</span>}
                      </td>
                      {k.fehler ? (
                        <td className="px-4 py-3 text-[#86868b]" colSpan={6}>Instanz gerade nicht erreichbar</td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-emerald-600 font-medium">{eur(k.umsatz_eur || 0)}</td>
                          <td className="px-4 py-3">{k.rechnungen}</td>
                          <td className="px-4 py-3">{k.projekte} <span className="text-[#86868b]">({k.projekte_abgeschlossen} fertig)</span></td>
                          <td className="px-4 py-3">{k.marge_prozent != null ? k.marge_prozent + ' %' : '–'}</td>
                          <td className="px-4 py-3">{k.touren}</td>
                          <td className="px-4 py-3">{k.stunden?.toLocaleString('de-DE')}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {kunden.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-[#86868b]">
                      Noch keine aktiven Pilotbetriebe – sobald der erste live ist, erscheinen hier seine Zahlen.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-[#86868b] mt-4">
              Nur aggregierte Betriebsdaten (Zähler und Summen), keine Einzeldaten der Kunden.
              Stornierte Rechnungen sind ausgenommen.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-white border border-black/5 shadow-sm rounded-2xl p-5">
      <p className="text-[#86868b] text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${accent ? 'text-[#e8590c]' : 'text-[#1d1d1f]'}`}>{value}</p>
    </div>
  );
}
