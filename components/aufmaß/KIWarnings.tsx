// ============================================================
// components/aufmaß/KIWarnings.tsx
// SCAFFOLD OS – KI-Warnungs-Anzeige
// ============================================================

'use client';

import { KIRulesetResult, KIRuleResult } from '@/types/scaffold';

interface Props {
  ruleset: KIRulesetResult | null;
  onAutoFix?: (correction: KIRuleResult) => void;
}

export default function KIWarnings({ ruleset, onAutoFix }: Props) {
  if (!ruleset || ruleset.results.length === 0) return null;

  const severityConfig = {
    critical: {
      border: 'border-red-500/50',
      bg: 'bg-red-500/10',
      icon: '⛔',
      titleColor: 'text-red-400',
      textColor: 'text-red-200',
    },
    warning: {
      border: 'border-amber-500/50',
      bg: 'bg-amber-500/10',
      icon: '⚠️',
      titleColor: 'text-amber-400',
      textColor: 'text-amber-200',
    },
    info: {
      border: 'border-blue-500/50',
      bg: 'bg-blue-500/10',
      icon: 'ℹ️',
      titleColor: 'text-blue-400',
      textColor: 'text-blue-200',
    },
    tip: {
      border: 'border-emerald-500/50',
      bg: 'bg-emerald-500/10',
      icon: '💡',
      titleColor: 'text-emerald-400',
      textColor: 'text-emerald-200',
    },
  };

  return (
    <div className="mt-6 space-y-3">
      {/* Zusammenfassung */}
      <div className="flex items-center justify-between rounded-lg bg-slate-800 p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🤖</span>
          <div>
            <p className="font-semibold text-white">KI-Analyse</p>
            <p className="text-sm text-slate-400">
              {ruleset.results.length} Erkenntnis
              {ruleset.results.length !== 1 ? 'se' : ''} gefunden
              {ruleset.hasCritical && ' – Kritische Punkte beachten!'}
            </p>
          </div>
        </div>
        {ruleset.totalCostImpact !== 0 && (
          <div
            className={`text-right ${
              ruleset.totalCostImpact > 0 ? 'text-red-400' : 'text-emerald-400'
            }`}
          >
            <p className="text-sm">Kosten-Impact</p>
            <p className="text-xl font-bold">
              {ruleset.totalCostImpact > 0 ? '+' : ''}
              {ruleset.totalCostImpact.toLocaleString('de-DE', {
                style: 'currency',
                currency: 'EUR',
              })}
            </p>
          </div>
        )}
      </div>

      {/* Einzelne Regeln */}
      {ruleset.results.map((rule) => {
        const config = severityConfig[rule.severity];

        return (
          <div
            key={rule.id}
            className={`rounded-lg border ${config.border} ${config.bg} p-4 transition-all hover:brightness-110`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-xl">{config.icon}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className={`font-bold ${config.titleColor}`}>
                    {rule.title}
                  </h4>
                  {rule.costImpact !== undefined && rule.costImpact !== 0 && (
                    <span
                      className={`text-sm font-mono font-bold ${
                        rule.costImpact > 0 ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {rule.costImpact > 0 ? '+' : ''}
                      {rule.costImpact.toLocaleString('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </span>
                  )}
                </div>

                <p className={`mt-1 text-sm ${config.textColor}`}>
                  {rule.message}
                </p>

                {rule.suggestedAction && (
                  <div className="mt-2 rounded bg-slate-900/50 p-2">
                    <p className="text-xs font-semibold text-slate-400">
                      Empfohlene Maßnahme:
                    </p>
                    <p className="text-sm text-white">{rule.suggestedAction}</p>
                  </div>
                )}

                {rule.alternative && (
                  <p className="mt-1 text-xs text-slate-500">
                    Alternative: {rule.alternative}
                  </p>
                )}

                {rule.autoApply && onAutoFix && (
                  <button
                    onClick={() => onAutoFix(rule)}
                    className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
                  >
                    Automatisch korrigieren
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}