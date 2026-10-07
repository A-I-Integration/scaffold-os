import type { LucideIcon } from 'lucide-react';

// Gemeinsamer Kopf der Aufmaß-Schritte: Titel mit Icon und Fortschrittsleiste über alle sechs Schritte.
const SCHRITTE = ['Projekt', 'Gebäude', 'Gerüst', 'Sicherheit', 'Material', 'Planung'];

export default function WizardKopf({ schritt, titel, icon: Icon }: { schritt: number; titel: string; icon: LucideIcon }) {
  return (
    <>
      <h1 className="flex items-center gap-2 text-2xl font-semibold mb-1">
        <Icon className="w-6 h-6 text-[#e8590c]" aria-hidden="true" /> {titel}
      </h1>
      <p className="text-[#86868b] text-sm mb-4">Baustelle · Schritt {schritt} von {SCHRITTE.length}</p>
      <ol className="mb-6 grid grid-cols-6 gap-1.5" aria-label="Fortschritt im Aufmaß">
        {SCHRITTE.map((name, i) => {
          const nr = i + 1;
          const aktiv = nr === schritt;
          return (
            <li key={name} aria-current={aktiv ? 'step' : undefined}>
              <div className={`h-1.5 rounded-full ${nr < schritt ? 'bg-[#e8590c]' : aktiv ? 'bg-[#e8590c]/60' : 'bg-black/10'}`} />
              <div className={`mt-1 truncate text-[11px] ${aktiv ? 'font-semibold text-[#1d1d1f]' : 'text-[#86868b]'} ${aktiv ? '' : 'hidden sm:block'}`}>
                {nr}. {name}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
