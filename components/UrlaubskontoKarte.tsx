'use client';

import { useEffect, useState } from 'react';
import type { Urlaubskonto, Vorschau } from '@/lib/urlaubskonto';

// ============================================================
// SCAFFOLD OS – Urlaubskonto eines Mitarbeiters (Mitarbeiter-Login, Dispo, Chef)
// Zeigt den aktuellen Urlaubsanspruch und, bei gewähltem Zeitraum, wie viele Tage bezahlt bzw. unbezahlt wären.
// ============================================================

const tage = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

export default function UrlaubskontoKarte({ employeeId, von, bis }: { employeeId: string; von?: string; bis?: string }) {
  const [konto, setKonto] = useState<Urlaubskonto | null>(null);
  const [vorschau, setVorschau] = useState<Vorschau | null>(null);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    if (!employeeId) { setKonto(null); return; }
    let aktuell = true;
    const q = von && bis && bis >= von ? `&von=${von}&bis=${bis}` : '';
    fetch(`/api/urlaubskonto?employee_id=${employeeId}${q}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!aktuell) return;
        if (j.success) { setKonto(j.konto); setVorschau(j.vorschau || null); setFehler(''); }
        else setFehler(j.error || 'Urlaubskonto konnte nicht geladen werden.');
      })
      .catch(() => aktuell && setFehler('Urlaubskonto konnte nicht geladen werden.'));
    return () => { aktuell = false; };
  }, [employeeId, von, bis]);

  if (!employeeId) return null;
  if (fehler) return <p className="text-sm text-red-600" data-testid="urlaubskonto-fehler">{fehler}</p>;
  if (!konto) return <p className="text-sm text-[#86868b]">Urlaubskonto wird geladen …</p>;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2 text-sm" data-testid="urlaubskonto-karte">
      <p>
        <span className="text-[#424245]">Aktueller Urlaubsanspruch ({konto.jahr}):</span>{' '}
        <strong className="text-lg" data-testid="urlaubskonto-rest">{tage(konto.restBisHeute)} {konto.restBisHeute === 1 ? 'Tag' : 'Tage'}</strong>
      </p>
      <p className="text-xs text-[#424245]" data-testid="urlaubskonto-details">
        Bis zum Ende dieses Monats zustehend: {tage(konto.anspruchBisHeute)} · genehmigt: {tage(konto.genommenBezahlt)} · beantragt: {tage(konto.beantragtBezahlt)}
        {konto.betriebsferien > 0 ? ` · Betriebsferien (fest abgezogen): ${tage(konto.betriebsferien)}` : ''}{konto.unbezahlt > 0 ? ` · unbezahlt: ${tage(konto.unbezahlt)}` : ''} · Anspruch im ganzen Jahr: {tage(konto.anspruchJahr)}
      </p>
      {konto.hinweise.map(h => <p key={h} className="text-xs text-amber-700">{h}</p>)}
      {vorschau && (
        <p className={`rounded-lg px-3 py-2 ${vorschau.unbezahlt > 0 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-white text-[#1d1d1f] border border-blue-100'}`} data-testid="urlaubskonto-vorschau">
          {vorschau.unbezahlt > 0 ? '⚠️ ' : ''}{vorschau.hinweis}
        </p>
      )}
    </div>
  );
}
