'use client';

import { useState } from 'react';
import KiHinweis from '@/components/KiHinweis';

// ============================================================
// DIN EN 12811 KI-Check – Button + Ergebnisliste (Phase 18)
// Selbstständige Komponente: prüft per /api/din-check und
// zeigt die 8 Prüfpunkte mit Status an.
// WICHTIG: KI-Hinweis, keine Statik – Entscheidung beim Menschen.
// ============================================================

interface Check {
  regel: string;
  norm?: string;
  status: 'ok' | 'warnung' | 'kritisch' | 'unbekannt';
  hinweis: string;
}

interface DinCheckErgebnis {
  geprueft_am: string;
  checks: Check[];
  zusammenfassung: string;
}

const STATUS_STYLE: Record<string, { icon: string; cls: string; label: string }> = {
  ok:        { icon: '✓',  cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'OK' },
  warnung:   { icon: '⚠',  cls: 'bg-amber-50 text-amber-800 border-amber-200',       label: 'Prüfen' },
  kritisch:  { icon: '✕',  cls: 'bg-red-50 text-red-700 border-red-200',             label: 'Kritisch' },
  unbekannt: { icon: '?',  cls: 'bg-[#f5f5f7] text-[#86868b] border-black/10',       label: 'Keine Daten' },
};

export default function DinCheck({ projektId }: { projektId: string | null }) {
  const [loading, setLoading] = useState(false);
  const [ergebnis, setErgebnis] = useState<DinCheckErgebnis | null>(null);
  const [fehler, setFehler] = useState('');

  async function pruefen() {
    if (!projektId) { setFehler('Bitte zuerst das Projekt speichern (Schritt 6 → Speichern).'); return; }
    setLoading(true);
    setFehler('');
    try {
      const res = await fetch('/api/din-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projekt_id: projektId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Prüfung fehlgeschlagen');
      setErgebnis(json.dinCheck);
    } catch (e: any) {
      setFehler(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pt-2 border-t border-black/10">
      <button
        onClick={pruefen}
        disabled={loading}
        className="w-full rounded-xl bg-[#1d1d1f] hover:bg-black disabled:opacity-50 py-3 font-semibold text-white transition-colors"
      >
        {loading ? '⏳ KI prüft gegen DIN EN 12811/12810 & TRBS 2121-1 …' : ergebnis ? '🛡️ Normen-Check erneut durchführen' : '🛡️ Gegen DIN EN 12811/12810 & TRBS 2121-1 prüfen'}
      </button>

      {fehler && <p className="mt-2 text-sm text-red-600">{fehler}</p>}

      {ergebnis && (
        <div className="mt-3 space-y-2">
          {ergebnis.checks.map((c, i) => {
            const st = STATUS_STYLE[c.status] || STATUS_STYLE.unbekannt;
            return (
              <div key={i} className={`rounded-xl border px-3 py-2.5 ${st.cls}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{st.icon} {c.regel}</span>
                  <span className="text-[10px] uppercase tracking-wide shrink-0">{st.label}</span>
                </div>
                {c.norm && <span className="text-[10px] text-current opacity-60">{c.norm}</span>}
                <p className="text-xs mt-1 opacity-80">{c.hinweis}</p>
              </div>
            );
          })}
          {ergebnis.zusammenfassung && (
            <p className="text-sm text-[#424245] pt-1">{ergebnis.zusammenfassung}</p>
          )}
          <p className="text-[10px] text-[#86868b]">
            Geprüft am {new Date(ergebnis.geprueft_am).toLocaleString('de-DE')}
          </p>
        </div>
      )}

      <KiHinweis text="🤖 KI-Hinweis nach DIN EN 12811 – ersetzt keine Statik und keine Abnahme. Prüfung und Verantwortung bleiben beim Fachbetrieb." />
    </div>
  );
}
