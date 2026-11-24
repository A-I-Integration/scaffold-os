'use client';

import type { Urlaubskonto } from '@/lib/urlaubskonto';

// SCAFFOLD OS – Urlaubsübersicht aller aktiven Mitarbeiter (Dispo und Chef), Reiter „Abwesenheiten“ der Planung

export interface KontoZeile { employee_id: string; name: string; konto: Urlaubskonto }
const z = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

export default function UrlaubsUebersicht({ konten }: { konten: KontoZeile[] }) {
  if (konten.length === 0) return null;
  return (
    <div className="mb-4 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" data-testid="urlaubsuebersicht">
      <div className="px-6 py-3 bg-gray-100 font-semibold text-gray-800 text-sm">Urlaubskonto {konten[0].konto.jahr}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-900">
          <thead className="text-xs text-gray-500"><tr>
            <th className="px-6 py-2 font-normal">Mitarbeiter</th><th className="px-3 py-2 font-normal text-right">zustehend bis heute</th>
            <th className="px-3 py-2 font-normal text-right">genehmigt</th><th className="px-3 py-2 font-normal text-right">beantragt</th>
            <th className="px-3 py-2 font-normal text-right">unbezahlt</th><th className="px-6 py-2 font-normal text-right">aktueller Anspruch</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {konten.map(({ employee_id, name, konto: k }) => (
              <tr key={employee_id} data-testid="urlaubsuebersicht-zeile">
                <td className="px-6 py-2 font-medium">{name}{k.hinweise.length > 0 && <span title={k.hinweise.join(' ')} className="ml-1 text-amber-600">⚠</span>}</td>
                <td className="px-3 py-2 text-right">{z(k.anspruchBisHeute)}</td>
                <td className="px-3 py-2 text-right">{z(k.genommenBezahlt)}</td>
                <td className="px-3 py-2 text-right">{z(k.beantragtBezahlt)}</td>
                <td className={`px-3 py-2 text-right ${k.unbezahlt > 0 ? 'text-amber-700 font-semibold' : ''}`}>{z(k.unbezahlt)}</td>
                <td className="px-6 py-2 text-right font-semibold">{z(k.restBisHeute)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
