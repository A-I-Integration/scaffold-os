// ============================================================
// components/aufmaß/DispositionResult.tsx
// SCAFFOLD OS – Dispositions-Ergebnis-Anzeige
// ============================================================

'use client';

import { DispositionResult as DispositionData, DispositionSuggestion } from '@/lib/calculations/disposition';

interface Props {
result: DispositionData | null;
  loading?: boolean;
}

export default function DispositionResult({ result, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
        <p className="text-lg font-semibold text-[#1d1d1f]">Optimiere Transporte...</p>
        <p className="text-sm text-[#86868b]">Prüfe Lager, Baustellen und Routen</p>
      </div>
    );
  }

  if (!result) return null;

  const sourceColors: Record<string, string> = {
    site_direct: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    site_via_central: 'bg-amber-500/20 text-[#e8590c] border-amber-500/30',
    central: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    order_new: 'bg-red-500/20 text-red-300 border-red-500/30',
  };

  const sourceLabels: Record<string, string> = {
    site_direct: 'Direkt von Baustelle',
    site_via_central: 'Teilweise Baustelle + Lager',
    central: 'Zentrallager',
    order_new: 'Neu bestellen',
  };

  return (
    <div className="space-y-6">
      {/* Kopf */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">🚛</span>
          <div>
            <h2 className="text-2xl font-bold text-[#1d1d1f]">KI-Disposition</h2>
            <p className="text-[#86868b]">Optimale Materialbeschaffung & Transport</p>
          </div>
        </div>
        <p className="text-emerald-700">{result.summaryText}</p>
      </div>

      {/* Einsparungen */}
      {result.totalSavings > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl bg-[#f5f5f7] border border-emerald-500/30 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">
              {result.totalSavings.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </p>
            <p className="text-xs text-[#86868b] mt-1">Einsparung</p>
          </div>
          <div className="rounded-xl bg-[#f5f5f7] border border-emerald-500/30 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{result.totalSavedKm} km</p>
            <p className="text-xs text-[#86868b] mt-1">gesparte Strecke</p>
          </div>
          <div className="rounded-xl bg-[#f5f5f7] border border-emerald-500/30 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{result.totalSavedDiesel} L</p>
            <p className="text-xs text-[#86868b] mt-1">Diesel gespart</p>
          </div>
          <div className="rounded-xl bg-[#f5f5f7] border border-emerald-500/30 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{result.totalSavedHours} h</p>
            <p className="text-xs text-[#86868b] mt-1">Zeit gespart</p>
          </div>
        </div>
      )}

      {/* Optimierte Routen */}
      {result.routes.length > 0 && (
        <div className="rounded-xl border border-black/10 bg-[#f5f5f7] p-6">
          <h3 className="text-lg font-bold text-[#1d1d1f] mb-4">🗺️ Optimierte Routen</h3>
          <div className="space-y-3">
            {result.routes.map((route, i) => (
              <div key={i} className="rounded-xl bg-black/10/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📍</span>
                    <span className="font-bold text-[#1d1d1f]">{route.from}</span>
                    <span className="text-[#86868b]">→</span>
                    <span className="font-bold text-[#1d1d1f]">{route.to}</span>
                  </div>
                  <span className="text-emerald-600 font-bold">
                    +{route.savingsVsCentral.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} gespart
                  </span>
                </div>
                <p className="text-sm text-[#86868b] mb-2">
                  Artikel: {route.articles.join(', ')}
                </p>
                <div className="flex gap-4 text-xs text-[#86868b]">
                  <span>{route.distanceKm} km</span>
                  <span>{route.dieselLiters.toFixed(1)} L Diesel</span>
                  <span>{route.timeHours.toFixed(1)} h Fahrtzeit</span>
                  <span>{route.co2Kg.toFixed(1)} kg CO₂</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Einzelpositionen */}
      <div className="rounded-xl border border-black/10 bg-[#f5f5f7]">
        <div className="border-b border-black/10 p-4">
          <h3 className="text-lg font-bold text-[#1d1d1f]">Positionen im Detail</h3>
        </div>
        <div className="divide-y divide-black/5">
          {result.suggestions.map((s, i) => (
            <div key={i} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-bold border ${sourceColors[s.source]}`}>
                    {sourceLabels[s.source]}
                  </span>
                  <span className="font-semibold text-[#1d1d1f]">{s.articleName}</span>
                  <span className="text-[#86868b] text-sm">({s.articleNumber})</span>
                </div>
                <span className="text-[#1d1d1f] font-bold">{s.needed} {s.needed === 1 ? 'Stk' : 'Stk'}</span>
              </div>
              
              <p className="text-sm text-[#86868b] mb-2">{s.reason}</p>
              
              {s.savings > 0 && (
                <p className="text-sm text-emerald-600 font-medium">
                  💰 Einsparung: {s.savings.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </p>
              )}
              
              {s.missingQuantity > 0 && (
                <p className="text-sm text-red-600">
                  ⚠️ {s.missingQuantity} Stk fehlen – muss nachbestellt werden
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Aktionen */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 font-semibold text-white transition-colors">
          🚛 Transportaufträge erstellen
        </button>
        <button className="flex-1 rounded-xl bg-black/10 hover:bg-black/15 py-3 font-semibold text-[#1d1d1f] transition-colors">
          📋 Als Dispositionsplan speichern
        </button>
      </div>
    </div>
  );
}