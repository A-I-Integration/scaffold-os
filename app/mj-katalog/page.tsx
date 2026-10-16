'use client';

import { useMemo, useState } from 'react';
import { alleMjArtikel, sucheMjArtikel, MJ_LISTEN, MJ_OPTI_BEAM, MJ_WEITERE_ZULASSUNGEN, type MjListe } from '@/lib/mj-katalog';

// ============================================================
// SCAFFOLD OS – MJ-Katalog (Nachschlagewerk, nur lesen)
// Artikel aus den MJ-Gerüst-Preislisten OPTIMA / OPTIMA TOP / OPTIMA metric / UNI-CONNECT / COMBI / COMBI metric+TOP / UNI 70/100 / UNI TOP 65.
// Verändert keine Lagerbestände und keine Preise.
// ============================================================

const MAX_ZEILEN = 150;
const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const detail = (a: Record<string, string | number>) =>
  Object.entries(a).map(([k, v]) => `${k.replace(/ \(Stk\.\)$/, '')}: ${typeof v === 'number' ? v.toLocaleString('de-DE') : v}`).join(' · ');

export default function MjKatalogPage() {
  const [suche, setSuche] = useState('');
  const [liste, setListe] = useState<MjListe | 'alle'>('alle');
  const treffer = useMemo(() => sucheMjArtikel(suche, liste), [suche, liste]);
  const gesamt = alleMjArtikel().length;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-[#1d1d1f]">MJ-Katalog</h1>
        <p className="text-sm text-[#86868b]">{gesamt} Artikelzeilen aus den MJ-Gerüst-Preislisten (Stand 04.2025). Zum Nachschlagen – verändert weder Lager noch Kalkulation.</p>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
        <p><b>Wichtig:</b> Preise sind MJ-Listenpreise netto (zzgl. MwSt.), keine Verkaufspreise. Maß- und Gewichtsangaben sind laut MJ unverbindliche Richtwerte.</p>
        <p>Die Tabellen wurden automatisch ausgelesen. Die Bereichsnamen sind automatisch zugeordnet und können bei einzelnen Artikeln ungenau sein. Hinweise der Preisliste wie „Nettopreis, nicht rabattfähig“ oder „Lieferzeit auf Anfrage“ sind hier nicht enthalten – im Zweifel gilt die Original-Preisliste.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {Object.values(MJ_LISTEN).map((l) => (
          <div key={l.key} className="rounded-xl border border-black/10 bg-white p-3 text-xs space-y-0.5">
            <p className="text-sm font-semibold text-[#1d1d1f]">{l.name}</p>
            <p>Preisliste {l.preislisteVersion}, Stand {l.preislisteStand}</p>
            {l.zulassungen.map((z) => (
              <p key={z.nummer}>Zulassung <b>{z.nummer}</b>{l.zulassungen.length > 1 ? ` (${z.gegenstand.replace('MJ UNI-CONNECT ', '')})` : ''}, Bescheid {z.bescheidVom}, gültig bis <b>{z.gueltigBis}</b></p>
            ))}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-3 text-xs space-y-0.5">
        <p className="text-sm font-semibold text-[#1d1d1f]">Weitere Zulassungen (ohne hinterlegte Preisliste)</p>
        {MJ_WEITERE_ZULASSUNGEN.map((z) => (
          <p key={z.nummer}><b>{z.nummer}</b> – {z.gegenstand}, Bescheid {z.bescheidVom}, gültig bis <b>{z.gueltigBis}</b></p>
        ))}
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-3 text-xs space-y-1">
        <p className="text-sm font-semibold text-[#1d1d1f]">{MJ_OPTI_BEAM.name} (Aluminium-Kastenträger)</p>
        <p>{MJ_OPTI_BEAM.beschreibung}</p>
        <ul className="list-disc pl-5">{MJ_OPTI_BEAM.einsatz.map((e) => <li key={e}>{e}</li>)}</ul>
        <p className="text-[#86868b]">{MJ_OPTI_BEAM.hinweis}</p>
        <p className="text-[#86868b]">In den hinterlegten Preislisten ist der OPTI-BEAM nicht enthalten, daher hier keine Artikelnummern oder Preise.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Suchen: Artikelnummer oder Name, z. B. „Riegel“ oder „013535“"
          className="flex-1 min-w-[220px] rounded-lg border border-black/10 px-3 py-2 text-sm" />
        <select value={liste} onChange={(e) => setListe(e.target.value as MjListe | 'alle')} className="rounded-lg border border-black/10 px-3 py-2 text-sm bg-white">
          <option value="alle">Alle Preislisten</option>
          {Object.values(MJ_LISTEN).map((l) => <option key={l.key} value={l.key}>{l.name}</option>)}
        </select>
      </div>

      <p className="text-xs text-[#86868b]">{treffer.length} Treffer{treffer.length > MAX_ZEILEN ? ` – es werden die ersten ${MAX_ZEILEN} gezeigt, bitte Suche eingrenzen` : ''}</p>

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-[#f5f5f7] text-left text-[#424245]">
            <tr><th className="p-2">Art.-Nr.</th><th className="p-2">Preisliste</th><th className="p-2">Bereich</th><th className="p-2">Angaben</th><th className="p-2 text-right">Preis netto</th></tr>
          </thead>
          <tbody>
            {treffer.slice(0, MAX_ZEILEN).map((a, i) => (
              <tr key={`${a.liste}-${a.nr}-${i}`} className="border-t border-black/5 align-top">
                <td className="p-2 font-mono">{a.nr}</td>
                <td className="p-2 whitespace-nowrap">{MJ_LISTEN[a.liste].name}</td>
                <td className="p-2">{a.gruppe}{a.untertitel && a.untertitel !== a.gruppe ? <span className="block text-[#86868b]">{a.untertitel}</span> : null}</td>
                <td className="p-2 text-[#424245]">{detail(a.attribute)}</td>
                <td className="p-2 text-right whitespace-nowrap">{eur(a.preis)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
