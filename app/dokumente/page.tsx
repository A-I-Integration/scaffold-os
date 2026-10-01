'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Search, Loader2, ExternalLink } from 'lucide-react';
import { filtereDokumente, DokumentArt, DokumentZeile } from '@/lib/dokumente';

// ============================================================
// SCAFFOLD OS – Dokumente (zentrale Übersicht, nur lesend)
// Alle Verträge, Dokumente und Grundrisse über alle Projekte hinweg,
// mit Suche und Filter nach Art. Hochgeladen wird weiterhin pro
// Kunde/Projekt (Reiter „Dokumente"); diese Seite zeigt nur den Überblick.
// ============================================================

const ARTEN: { key: DokumentArt | 'alle'; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'vertrag', label: 'Verträge' },
  { key: 'dokument', label: 'Dokumente' },
  { key: 'grundriss', label: 'Grundrisse' },
  { key: 'sonstiges', label: 'Sonstiges' },
];

function datumDe(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '–' : d.toLocaleDateString('de-DE');
}

export default function DokumentePage() {
  const [liste, setListe] = useState<DokumentZeile[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [abgeschnitten, setAbgeschnitten] = useState(false);
  const [suche, setSuche] = useState('');
  const [art, setArt] = useState<DokumentArt | 'alle'>('alle');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/dokumente', { cache: 'no-store' });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Dokumente konnten nicht geladen werden.');
        setListe(json.dokumente || []);
        setAbgeschnitten(!!json.abgeschnitten);
      } catch (e: any) {
        setFehler(e.message || 'Dokumente konnten nicht geladen werden.');
      } finally {
        setLaedt(false);
      }
    })();
  }, []);

  const sichtbar = useMemo(() => filtereDokumente(liste, suche, art), [liste, suche, art]);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-[#1d1d1f] mb-1">
        <FileText className="w-6 h-6 text-[#E8590C]" /> Dokumente
      </h1>
      <p className="text-sm text-[#86868b] mb-4">
        Alle Verträge, Dokumente und Grundrisse über alle Projekte. Hochladen können Sie weiterhin beim jeweiligen Kunden im Reiter „Dokumente".
      </p>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#86868b] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Suchen: Dateiname, Kunde, Projekt …"
            className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {ARTEN.map((a) => (
            <button
              key={a.key}
              onClick={() => setArt(a.key)}
              className={`px-3 py-2 rounded-xl text-sm border ${art === a.key ? 'bg-[#E8590C] text-white border-[#E8590C]' : 'bg-white text-[#1d1d1f] border-[#e5e5ea]'}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {laedt && <p className="flex items-center gap-2 text-sm text-[#86868b]"><Loader2 className="w-4 h-4 animate-spin" /> Lädt …</p>}
      {fehler && <p className="text-sm text-red-600">{fehler}</p>}
      {abgeschnitten && <p className="text-xs text-amber-700 mb-2">Es werden nur die 2.000 neuesten Dateien angezeigt.</p>}

      {!laedt && !fehler && (
        <div className="space-y-2">
          {sichtbar.length === 0 && <p className="text-sm text-[#86868b]">Keine Dokumente gefunden.</p>}
          {sichtbar.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-[#e5e5ea] bg-white">
              <div className="min-w-0">
                <p className="font-medium text-[#1d1d1f] truncate">{d.bezeichnung || d.name}</p>
                <p className="text-xs text-[#86868b] truncate">
                  {d.kunde}{d.projekt !== d.kunde ? ` · ${d.projekt}` : ''} · {ARTEN.find((a) => a.key === d.art)?.label} · {datumDe(d.datum)}
                  {d.bezeichnung ? ` · ${d.name}` : ''}
                </p>
              </div>
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="shrink-0 flex items-center gap-1 text-sm text-[#E8590C]">
                Öffnen <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
