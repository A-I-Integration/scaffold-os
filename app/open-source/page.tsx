import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import lizenzen from '@/lib/data/open-source-lizenzen.json';

export const metadata = { title: 'Verwendete Open-Source-Software – SCAFFOLD OS' };

type Eintrag = { paket: string; version: string; lizenz: string; repo: string };

export default function OpenSourcePage() {
  const liste = lizenzen as Eintrag[];
  const nachLizenz = new Map<string, Eintrag[]>();
  for (const e of liste) nachLizenz.set(e.lizenz, [...(nachLizenz.get(e.lizenz) ?? []), e]);
  const gruppen = [...nachLizenz.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="min-h-screen bg-[#fbfbfd] text-[#1d1d1f]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm text-[#86868b] transition-colors hover:text-[#e8590c]">
          <ArrowLeft className="h-4 w-4" /> Zurück zur Startseite
        </Link>
        <h1 className="text-2xl font-semibold">Verwendete Open-Source-Software</h1>
        <p className="mt-3 text-sm text-[#424245]">
          SCAFFOLD OS nutzt freie Software-Bausteine. Wir danken den Autorinnen und Autoren. Diese Liste nennt die Bausteine der
          Webanwendung mit Version, Lizenz und Quelle. Die jeweiligen Lizenztexte stehen in den verlinkten Projekten.
        </p>
        <p className="mt-2 text-sm text-[#86868b]">{liste.length} Bausteine, Stand der Auswertung: November 2026.</p>

        <div className="mt-6 space-y-2">
          {gruppen.map(([lizenz, eintraege]) => (
            <details key={lizenz} className="rounded-xl border border-black/10 bg-white">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
                <span className="min-w-0 break-words">{lizenz}</span>
                <span className="shrink-0 text-xs text-[#86868b]">{eintraege.length}</span>
              </summary>
              <ul className="divide-y divide-black/5 border-t border-black/5 text-sm">
                {eintraege.map((e) => (
                  <li key={`${e.paket}@${e.version}`} className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2">
                    <span className="min-w-0 break-all">{e.paket} <span className="text-[#86868b]">{e.version}</span></span>
                    {e.repo && (
                      <a href={e.repo} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-[#e8590c] hover:underline">Quelle</a>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
