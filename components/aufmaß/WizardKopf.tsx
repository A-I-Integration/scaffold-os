'use client';

import type { LucideIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

// Gemeinsamer Kopf der Aufmaß-Schritte: Titel mit Icon und klickbare Schrittleiste über alle sechs Schritte.
const SCHRITTE = ['Projekt', 'Gebäude', 'Gerüst', 'Sicherheit', 'Material', 'Planung'];

type Props = {
  schritt: number;
  titel: string;
  icon: LucideIcon;
  /** Sichert den aktuellen Stand still (ohne Pflichtfeld-Prüfung), bevor zu einem anderen Schritt gewechselt wird. */
  vorWechsel?: () => void;
};

export default function WizardKopf({ schritt, titel, icon: Icon, vorWechsel }: Props) {
  const router = useRouter();
  const projectId = useSearchParams().get('id');

  function gehe(nr: number) {
    if (nr === schritt) return;
    try { vorWechsel?.(); } catch { /* Sichern ist best-effort */ }
    if (!projectId && nr > schritt) {
      // Neues, noch nicht gespeichertes Aufmaß: vorwärts erst, wenn Kunde und Adresse in Schritt 1 stehen.
      let ok = false;
      try {
        const s1 = JSON.parse(localStorage.getItem('scaffold_step1') || '{}');
        ok = !!String(s1?.name || '').trim() && !!String(s1?.adresse || '').trim();
      } catch { /* ignore */ }
      if (!ok) { alert('Bitte zuerst in Schritt 1 Kunde und Adresse eingeben.'); return; }
    }
    router.push(projectId ? `/aufmass/schritt${nr}?id=${projectId}` : `/aufmass/schritt${nr}`);
  }

  return (
    <>
      <h1 className="flex items-center gap-2 text-2xl font-semibold mb-1">
        <Icon className="w-6 h-6 text-[#e8590c]" aria-hidden="true" /> {titel}
      </h1>
      <p className="text-[#86868b] text-sm mb-4">Baustelle · Schritt {schritt} von {SCHRITTE.length} · Schritt anklicken zum Springen</p>
      <ol className="mb-6 grid grid-cols-6 gap-1.5" aria-label="Schritte im Aufmaß">
        {SCHRITTE.map((name, i) => {
          const nr = i + 1;
          const aktiv = nr === schritt;
          return (
            <li key={name} aria-current={aktiv ? 'step' : undefined}>
              <button type="button" onClick={() => gehe(nr)} disabled={aktiv} title={`Zu Schritt ${nr}: ${name}`}
                className={`group w-full text-left rounded-md py-1 ${aktiv ? 'cursor-default' : 'cursor-pointer hover:bg-black/5'}`}>
                <div className={`h-1.5 rounded-full ${nr < schritt ? 'bg-[#e8590c]' : aktiv ? 'bg-[#e8590c]/60' : 'bg-black/10 group-hover:bg-black/20'}`} />
                <div className={`mt-1 truncate text-[11px] ${aktiv ? 'font-semibold text-[#1d1d1f]' : 'text-[#86868b] group-hover:text-[#1d1d1f]'}`}>
                  <span className="sm:hidden">{aktiv ? `${nr}. ${name}` : nr}</span>
                  <span className="hidden sm:inline">{nr}. {name}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}
