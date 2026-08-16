// ============================================================
// components/dashboard/ProjectsTable.tsx
// SCAFFOLD OS – Aktive Projekte mit Marge
// ============================================================

'use client';

import { useRouter } from 'next/navigation';

interface Project {
  id: string;
  name: string;
  customer: string;
  margin: number | null;
  value: number | null;
  status: string;
  daysSinceUpdate: number;
}

interface Props {
  projects: Project[];
}

export default function ProjectsTable({ projects }: Props) {
  const router = useRouter();

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-black/10 bg-black/5 p-8 text-center">
        <p className="text-[#86868b]">Keine aktiven Projekte</p>
      </div>
    );
  }

  function marginColor(margin: number | null) {
    if (margin === null || margin === undefined) return 'text-[#86868b]';
    if (margin < 10) return 'text-red-600';
    if (margin < 20) return 'text-amber-600';
    return 'text-emerald-600';
  }

  return (
    <div className="rounded-xl border border-black/10 bg-[#f5f5f7] overflow-hidden">
      <div className="p-4 border-b border-black/10">
        <h3 className="text-lg font-bold text-[#1d1d1f]">Aktive Projekte</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[#86868b] border-b border-black/10">
              <th className="p-4 font-medium">Projekt</th>
              <th className="p-4 font-medium">Kunde</th>
              <th className="p-4 font-medium text-right">Wert</th>
              <th className="p-4 font-medium text-right">Marge</th>
              <th className="p-4 font-medium text-center">Status</th>
              <th className="p-4 font-medium text-right">Letzte Akt.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {projects.map((p) => (
              <tr
                key={p.id}
                onClick={() => router.push(`/aufmass/${p.id}`)}
                className="hover:bg-black/10/30 cursor-pointer transition-colors"
              >
                <td className="p-4 font-medium text-[#1d1d1f]">{p.name}</td>
                <td className="p-4 text-[#86868b]">{p.customer || '–'}</td>
                <td className="p-4 text-right text-[#424245]">
                  {(p.value || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </td>
                <td className={`p-4 text-right font-bold ${marginColor(p.margin)}`}>
                  {p.margin !== null ? `${p.margin}%` : '–'}
                </td>
                <td className="p-4 text-center">
                  <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-600">
                    Aktiv
                  </span>
                </td>
                <td className="p-4 text-right text-[#86868b]">
                  {p.daysSinceUpdate} Tage
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}