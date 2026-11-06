import { lagerAutomatikZeilen } from '@/lib/lager-automatik-anzeige';

// ============================================================
// SCAFFOLD OS – Lager und Fahrt nach Angebots-Annahme
//
// Zeigt das Ergebnis der Automatik (lib/angebot-annahme.ts) an der Auftrags-Karte:
// was reserviert wurde und was von Hand nachgearbeitet werden muss.
// Ohne Ergebnis (Angebot noch nicht angenommen) erscheint nichts.
// ============================================================

const FARBE = { ok: 'text-green-700', warn: 'text-[#b45309]', fehler: 'text-red-700 font-semibold' } as const;

export default function LagerAutomatikHinweis({ ergebnis }: { ergebnis: unknown }) {
  const zeilen = lagerAutomatikZeilen(ergebnis);
  if (zeilen.length === 0) return null;
  return (
    <div className="px-5 pt-3 text-xs space-y-0.5">
      <p className="font-medium text-[#1d1d1f]">Lager und Fahrt nach Angebots-Annahme</p>
      {zeilen.map((z, i) => (
        <p key={i} className={FARBE[z.ton]}>{z.text}</p>
      ))}
    </div>
  );
}
