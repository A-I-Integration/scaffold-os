// ============================================================
// components/aufmaß/KIMaterialResult.tsx
// SCAFFOLD OS – KI-Material-Ergebnis-Anzeige
// ============================================================

'use client';

import { useState } from 'react';
import { KIAnalysis, MaterialItem } from '@/types/scaffold';

interface Props {
  result: KIAnalysis | null;
  loading?: boolean;
  onSaveStueckliste?: () => void;
  onGeneratePDF?: () => void;
  onManualEdit?: () => void;
}

export default function KIMaterialResult({ result, loading, onSaveStueckliste, onGeneratePDF, onManualEdit }: Props) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-8 text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        <p className="text-lg font-semibold text-white">
          KI analysiert Aufmaß...
        </p>
        <p className="text-sm text-slate-400">
          Berechne Material, Kosten und Risiken
        </p>
      </div>
    );
  }

  if (!result) return null;

  const toggleCategory = (cat: string) => {
    const next = new Set(expandedCategories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    setExpandedCategories(next);
  };

  const byCategory = result.materialList.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, MaterialItem[]>
  );

  const riskColors = {
    green: 'bg-emerald-500 text-emerald-950',
    yellow: 'bg-amber-500 text-amber-950',
    red: 'bg-red-500 text-red-950',
  };

  const riskLabels = {
    green: 'Niedriges Risiko',
    yellow: 'Mittleres Risiko',
    red: 'Hohes Risiko – Prüfung erforderlich',
  };

  return (
    <div className="space-y-6">
      {/* --- RISIKO-AMPEL & KOPF --- */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">
              🤖 KI-Materialberechnung
            </h2>
            <p className="text-slate-400">
              Automatisch ermittelt aus Aufmaß-Daten
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${riskColors[result.riskLevel]}`}
          >
            <span className="h-2 w-2 rounded-full bg-current"></span>
            {riskLabels[result.riskLevel]}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-700/50 p-3">
            <p className="text-xs text-slate-400">Gerüstklasse</p>
            <p className="text-lg font-bold text-white">
              {result.scaffoldClass}
            </p>
          </div>
          <div className="rounded-lg bg-slate-700/50 p-3">
            <p className="text-xs text-slate-400">Gesamtgewicht</p>
            <p className="text-lg font-bold text-white">
              {result.totalWeightKg.toLocaleString('de-DE')} kg
            </p>
          </div>
          <div className="rounded-lg bg-slate-700/50 p-3">
            <p className="text-xs text-slate-400">Arbeitsstunden</p>
            <p className="text-lg font-bold text-white">
              {result.estimatedLaborHours} h
            </p>
          </div>
          <div className="rounded-lg bg-slate-700/50 p-3">
            <p className="text-xs text-slate-400">Anker erforderlich</p>
            <p className="text-lg font-bold text-white">
              {result.requiredAnchorCount} Stk
            </p>
          </div>
        </div>
      </div>

      {/* --- WARNUNGEN --- */}
      {result.warnings.length > 0 && (
        <div className="space-y-2">
          {result.warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4"
            >
              <span className="mt-0.5 text-lg">⚠️</span>
              <p className="text-sm font-medium text-amber-200">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* --- TIPPS --- */}
      {result.tips.length > 0 && (
        <div className="space-y-2">
          {result.tips.map((t, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4"
            >
              <span className="mt-0.5 text-lg">💡</span>
              <p className="text-sm font-medium text-blue-200">{t}</p>
            </div>
          ))}
        </div>
      )}

      {/* --- MATERIALLISTE --- */}
      <div className="rounded-xl border border-slate-700 bg-slate-800">
        <div className="border-b border-slate-700 p-4">
          <h3 className="text-lg font-bold text-white">Materialliste</h3>
          <p className="text-sm text-slate-400">
            {result.materialList.length} Positionen automatisch ermittelt
          </p>
        </div>

        <div className="divide-y divide-slate-700">
          {Object.entries(byCategory).map(([category, items]) => {
            const isOpen = expandedCategories.has(category);
            const categoryTotal = items.reduce((s, i) => s + i.totalPrice, 0);

            return (
              <div key={category}>
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-slate-700/30"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-sm transition-transform ${
                        isOpen ? 'rotate-90' : ''
                      }`}
                    >
                      ▶
                    </span>
                    <span className="font-semibold text-white">{category}</span>
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                      {items.length}
                    </span>
                  </div>
                  <span className="font-bold text-orange-400">
                    {categoryTotal.toLocaleString('de-DE', {
                      style: 'currency',
                      currency: 'EUR',
                    })}
                  </span>
                </button>

                {isOpen && (
                  <div className="bg-slate-900/50 px-4 pb-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-400">
                            <th className="pb-2 pt-2 font-medium">Art.-Nr.</th>
                            <th className="pb-2 pt-2 font-medium">
                              Bezeichnung
                            </th>
                            <th className="pb-2 pt-2 text-right font-medium">
                              Menge
                            </th>
                            <th className="pb-2 pt-2 text-right font-medium">
                              Einheit
                            </th>
                            <th className="pb-2 pt-2 text-right font-medium">
                              Einzel (€)
                            </th>
                            <th className="pb-2 pt-2 text-right font-medium">
                              Gesamt (€)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {items.map((item, idx) => (
                            <tr key={idx} className="group">
                              <td className="py-2 font-mono text-slate-500">
                                {item.articleNumber}
                              </td>
                              <td className="py-2">
                                <p className="font-medium text-white">
                                  {item.name}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {item.aiRecommendation}
                                </p>
                              </td>
                              <td className="py-2 text-right font-bold text-white">
                                {item.quantity}
                              </td>
                              <td className="py-2 text-right text-slate-400">
                                {item.unit}
                              </td>
                              <td className="py-2 text-right text-slate-400">
                                {item.unitPrice.toFixed(2)}
                              </td>
                              <td className="py-2 text-right font-bold text-orange-400">
                                {item.totalPrice.toLocaleString('de-DE', {
                                  style: 'currency',
                                  currency: 'EUR',
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- KOSTENÜBERSICHT --- */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <h3 className="mb-4 text-lg font-bold text-white">Kostenkalkulation</h3>

        <div className="space-y-3">
          <div className="flex justify-between text-slate-300">
            <span>Materialkosten</span>
            <span className="font-mono">
              {result.totalMaterialCost.toLocaleString('de-DE', {
                style: 'currency',
                currency: 'EUR',
              })}
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>
              Lohnkosten ({result.estimatedLaborHours} h × 65 €)
            </span>
            <span className="font-mono">
              {result.laborCost.toLocaleString('de-DE', {
                style: 'currency',
                currency: 'EUR',
              })}
            </span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Transport & Logistik</span>
            <span className="font-mono">
              {result.transportCost.toLocaleString('de-DE', {
                style: 'currency',
                currency: 'EUR',
              })}
            </span>
          </div>
          <div className="border-t border-slate-700 pt-3">
            <div className="flex justify-between text-lg font-bold text-white">
              <span>Gesamtkosten</span>
              <span className="font-mono text-orange-400">
                {result.totalCost.toLocaleString('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                })}
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-emerald-500/10 p-4">
            <div className="flex justify-between text-emerald-400">
              <span className="font-semibold">
                Empfohlener Verkaufspreis (25% Marge)
              </span>
              <span className="font-mono text-xl font-bold">
                {result.suggestedPrice.toLocaleString('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                })}
              </span>
            </div>
            <div className="mt-1 flex justify-between text-sm text-emerald-300/70">
              <span>Deckungsbeitrag</span>
              <span className="font-mono">
                {result.margin.toLocaleString('de-DE', {
                  style: 'currency',
                  currency: 'EUR',
                })}{' '}
                ({result.marginPercent}%)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* --- AKTIONEN --- */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button 
          onClick={onSaveStueckliste}
          className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          disabled={!onSaveStueckliste}
        >
          📋 Als Stückliste speichern
        </button>
        <button 
          onClick={onGeneratePDF}
          className="flex-1 rounded-lg bg-orange-600 py-3 font-semibold text-white transition-colors hover:bg-orange-500 disabled:opacity-50"
          disabled={!onGeneratePDF}
        >
          📄 Angebot als PDF
        </button>
        <button 
          onClick={onManualEdit}
          className="flex-1 rounded-lg bg-slate-700 py-3 font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
          disabled={!onManualEdit}
        >
          ✏️ Manuell bearbeiten
        </button>
      </div>
    </div>
  );
}