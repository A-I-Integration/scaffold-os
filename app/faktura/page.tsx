'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WIN } from '@/components/win/Win';
import { BEREICHE, bereichAusAdresse, fakturaUrl } from '@/lib/faktura-bereiche';
import type { FakturaReiter } from '@/lib/faktura-kennzahlen';
import { useFakturaDaten } from '@/components/faktura/daten';
import FakturaUebersicht from '@/components/faktura/FakturaUebersicht';
import FakturaRechnungen from '@/components/faktura/FakturaRechnungen';
import FakturaAufmass from '@/components/faktura/FakturaAufmass';
import FakturaZahlungen from '@/components/faktura/FakturaZahlungen';
import FakturaEinstellungen from '@/components/faktura/FakturaEinstellungen';

// ============================================================
// SCAFFOLD OS – Faktura: fünf Bereiche in einem Arbeitsbereich
// Übersicht · Rechnungen · Aufmaß & Abrechnung · Zahlungseingänge · Einstellungen
// Alle Bereiche lesen dieselben Daten (ein Laden). Anlegen, Bearbeiten und Versand laufen unverändert über die bestehenden Seiten.
// Der Bereich steht in der Adresse (?bereich=…), damit Links und „Zurück“ funktionieren.
// ============================================================

const REITER_AUS_ADRESSE: FakturaReiter[] = ['alle', 'rechnungen', 'abschlag', 'schluss', 'gutschriften', 'entwuerfe'];

function FakturaInhalt() {
  const router = useRouter();
  const params = useSearchParams();
  const bereich = bereichAusAdresse(params.get('bereich'));
  const reiterParam = params.get('reiter') as FakturaReiter | null;
  const startReiter: FakturaReiter = reiterParam && REITER_AUS_ADRESSE.includes(reiterParam) ? reiterParam : 'alle';
  const daten = useFakturaDaten();

  return (
    <div className="min-h-full" style={{ background: WIN.grund }}>
      <div className="bg-white border-b" style={{ borderColor: WIN.rand }}>
        <div className="px-4 pt-3">
          <h1 className="text-lg font-bold" style={{ color: WIN.text }}>Faktura</h1>
          <p className="text-[13px]" style={{ color: WIN.textGedaempft }}>Rechnungen, Abschläge und Zahlungen im Blick</p>
        </div>
        <nav className="flex flex-wrap gap-1 px-3 mt-1" role="tablist" aria-label="Faktura-Bereiche">
          {BEREICHE.map((b) => (
            <button key={b.key} role="tab" aria-selected={bereich === b.key} onClick={() => router.replace(fakturaUrl(b.key))}
              className="px-3 py-2.5 text-[14px] -mb-px border-b-2"
              style={{ borderColor: bereich === b.key ? WIN.akzent : 'transparent', color: bereich === b.key ? WIN.akzent : WIN.text, fontWeight: bereich === b.key ? 600 : 400 }}>
              {b.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-4 space-y-4 max-w-[1400px]">
        {daten.fehler && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">❌ {daten.fehler}</p>}
        {bereich === 'uebersicht' && <FakturaUebersicht daten={daten} />}
        {bereich === 'rechnungen' && <FakturaRechnungen daten={daten} startReiter={startReiter} />}
        {bereich === 'aufmass' && <FakturaAufmass daten={daten} />}
        {bereich === 'zahlungen' && <FakturaZahlungen daten={daten} />}
        {bereich === 'einstellungen' && <FakturaEinstellungen />}
      </div>
    </div>
  );
}

export default function FakturaPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm" style={{ color: WIN.textGedaempft }}>Lade …</div>}>
      <FakturaInhalt />
    </Suspense>
  );
}
