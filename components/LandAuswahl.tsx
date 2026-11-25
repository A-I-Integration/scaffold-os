'use client';

import { useState } from 'react';
import { LAENDER_VORSCHLAG, STANDARD_LAND, landOderStandard } from '@/lib/land';

// Auswahl des Landes (Kunde, Baustelle). Leer = Deutschland. Für ein anderes Land gibt es „Anderes Land …“ mit Freitext.
const ANDERES = '__anderes__';

export default function LandAuswahl({ value, onChange, className = '', label, disabled, testId = 'land-auswahl' }: {
  value: string | null | undefined; onChange: (land: string) => void; className?: string; label?: string; disabled?: boolean; testId?: string;
}) {
  const aktuell = landOderStandard(value);
  const bekannt = LAENDER_VORSCHLAG.includes(aktuell);
  const [frei, setFrei] = useState(!bekannt);
  return (
    <div className="space-y-1">
      {label && <label className="block text-xs text-[#86868b] mb-1">{label}</label>}
      <select
        data-testid={testId} aria-label={label || 'Land'} disabled={disabled} className={className}
        value={frei ? ANDERES : aktuell}
        onChange={(e) => { if (e.target.value === ANDERES) { setFrei(true); } else { setFrei(false); onChange(e.target.value); } }}
      >
        {LAENDER_VORSCHLAG.map((l) => <option key={l} value={l}>{l}</option>)}
        <option value={ANDERES}>Anderes Land …</option>
      </select>
      {frei && (
        <input data-testid={`${testId}-frei`} aria-label="Land eintragen" disabled={disabled} className={className} placeholder={STANDARD_LAND}
          value={bekannt ? '' : aktuell} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
