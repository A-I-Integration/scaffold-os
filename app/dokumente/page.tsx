'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Search, Loader2, ExternalLink, Upload, Link2 } from 'lucide-react';
import {
  filtereDokumente, projekteFuerKunde,
  DokumentArt, DokumentZeile, KundeOption, ProjektOption,
} from '@/lib/dokumente';
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client';

// ============================================================
// SCAFFOLD OS – Dokumente (zentrale Übersicht)
// Alle Verträge, Dokumente und Grundrisse über alle Projekte, mit
// Suche und Filter. Hier können Dokumente hochgeladen und – falls noch
// nicht geschehen – manuell einem Kunden/Projekt zugeordnet werden.
// Nach der Zuordnung liegt das Dokument im Reiter „Dokumente" des
// Kunden. Zuordnung = project_id der Datei; die Datei selbst bleibt
// unverändert.
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
  const [kunden, setKunden] = useState<KundeOption[]>([]);
  const [projekte, setProjekte] = useState<ProjektOption[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [abgeschnitten, setAbgeschnitten] = useState(false);
  const [suche, setSuche] = useState('');
  const [art, setArt] = useState<DokumentArt | 'alle'>('alle');
  const [nurOffen, setNurOffen] = useState(false);

  const [uploadLaeuft, setUploadLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  // Zuordnen-Panel (eine Zeile gleichzeitig)
  const [offenId, setOffenId] = useState<string | null>(null);
  const [kundenSuche, setKundenSuche] = useState('');
  const [kundeId, setKundeId] = useState('');
  const [projektId, setProjektId] = useState('');
  const [speichert, setSpeichert] = useState(false);

  async function lade() {
    try {
      const res = await fetch('/api/dokumente', { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Dokumente konnten nicht geladen werden.');
      setListe(json.dokumente || []);
      setKunden(json.kunden || []);
      setProjekte(json.projekte || []);
      setAbgeschnitten(!!json.abgeschnitten);
      setFehler(null);
    } catch (e: any) {
      setFehler(e.message || 'Dokumente konnten nicht geladen werden.');
    } finally {
      setLaedt(false);
    }
  }

  useEffect(() => { lade(); }, []);

  const sichtbar = useMemo(() => filtereDokumente(liste, suche, art, nurOffen), [liste, suche, art, nurOffen]);
  const anzahlOffen = useMemo(() => liste.filter((d) => !d.projektId).length, [liste]);

  const kundenGefiltert = useMemo(() => {
    const q = kundenSuche.trim().toLowerCase();
    return q ? kunden.filter((k) => k.name.toLowerCase().includes(q)) : kunden;
  }, [kunden, kundenSuche]);

  const kundeProjekte = useMemo(() => {
    const k = kunden.find((x) => x.id === kundeId);
    return k ? projekteFuerKunde(k, projekte) : [];
  }, [kunden, projekte, kundeId]);

  function panelOeffnen(d: DokumentZeile) {
    setMeldung(null);
    setOffenId(d.id === offenId ? null : d.id);
    setKundenSuche('');
    setKundeId('');
    setProjektId('');
  }

  function kundeWaehlen(id: string) {
    setKundeId(id);
    const k = kunden.find((x) => x.id === id);
    const ps = k ? projekteFuerKunde(k, projekte) : [];
    setProjektId(ps.length === 1 ? ps[0].id : '');
  }

  async function zuordnen(d: DokumentZeile, ziel: string | null) {
    setSpeichert(true);
    setMeldung(null);
    try {
      const res = await fetch('/api/dokumente', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id, project_id: ziel }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Zuordnung fehlgeschlagen.');
      setOffenId(null);
      setMeldung(ziel ? 'Dokument zugeordnet. Es liegt jetzt beim Kunden im Reiter „Dokumente".' : 'Zuordnung gelöst.');
      await lade();
    } catch (e: any) {
      setMeldung('Fehler: ' + (e.message || 'Zuordnung fehlgeschlagen.'));
    } finally {
      setSpeichert(false);
    }
  }

  async function hochladen(file: File) {
    setUploadLaeuft(true);
    setMeldung(null);
    try {
      const up = await uploadVertragsdokument(file, 'unzugeordnet', 'dokumente');
      const res = await fetch('/api/dokumente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_path: up.storage_path, file_name: up.file_name, file_type: up.file_type }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Eintrag fehlgeschlagen.');
      setNurOffen(true);
      setMeldung('Hochgeladen. Das Dokument ist noch keinem Kunden zugeordnet – bitte „Zuordnen" wählen.');
      await lade();
    } catch (e: any) {
      setMeldung('Fehler beim Hochladen: ' + (e.message || 'unbekannt'));
    } finally {
      setUploadLaeuft(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-[#1d1d1f]">
          <FileText className="w-6 h-6 text-[#E8590C]" /> Dokumente
        </h1>
        <label className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium cursor-pointer ${uploadLaeuft ? 'bg-[#e5e5ea] text-[#86868b]' : 'bg-[#E8590C] text-white'}`}>
          {uploadLaeuft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploadLaeuft ? 'Lädt hoch …' : 'Dokument hochladen'}
          <input
            type="file"
            accept="application/pdf,.pdf,.doc,.docx,image/*"
            className="hidden"
            disabled={uploadLaeuft}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) hochladen(f); e.target.value = ''; }}
          />
        </label>
      </div>
      <p className="text-sm text-[#86868b] mb-4">
        Alle Verträge, Dokumente und Grundrisse über alle Projekte. Dokumente ohne Zuordnung können Sie hier einem Kunden und Projekt zuweisen; danach erscheinen sie beim Kunden im Reiter „Dokumente".
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
          <button
            onClick={() => setNurOffen((v) => !v)}
            className={`px-3 py-2 rounded-xl text-sm border ${nurOffen ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-[#1d1d1f] border-[#e5e5ea]'}`}
          >
            Nicht zugeordnet ({anzahlOffen})
          </button>
        </div>
      </div>

      {meldung && <p className={`text-sm mb-3 ${meldung.startsWith('Fehler') ? 'text-red-600' : 'text-emerald-700'}`}>{meldung}</p>}
      {laedt && <p className="flex items-center gap-2 text-sm text-[#86868b]"><Loader2 className="w-4 h-4 animate-spin" /> Lädt …</p>}
      {fehler && <p className="text-sm text-red-600">{fehler}</p>}
      {abgeschnitten && <p className="text-xs text-amber-700 mb-2">Es werden nur die 2.000 neuesten Dateien angezeigt.</p>}

      {!laedt && !fehler && (
        <div className="space-y-2">
          {sichtbar.length === 0 && <p className="text-sm text-[#86868b]">Keine Dokumente gefunden.</p>}
          {sichtbar.map((d) => (
            <div key={d.id} className="p-3 rounded-2xl border border-[#e5e5ea] bg-white">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-[#1d1d1f] truncate">{d.bezeichnung || d.name}</p>
                  <p className="text-xs text-[#86868b] truncate">
                    {d.projektId
                      ? <>{d.kunde}{d.projekt !== d.kunde ? ` · ${d.projekt}` : ''}</>
                      : <span className="text-amber-700 font-medium">Nicht zugeordnet</span>}
                    {' · '}{ARTEN.find((a) => a.key === d.art)?.label} · {datumDe(d.datum)}
                    {d.bezeichnung ? ` · ${d.name}` : ''}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  <button onClick={() => panelOeffnen(d)} className="flex items-center gap-1 text-sm text-[#E8590C]">
                    <Link2 className="w-3.5 h-3.5" /> {d.projektId ? 'Ändern' : 'Zuordnen'}
                  </button>
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-[#E8590C]">
                    Öffnen <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {offenId === d.id && (
                <div className="mt-3 pt-3 border-t border-[#e5e5ea] space-y-2">
                  <input
                    value={kundenSuche}
                    onChange={(e) => setKundenSuche(e.target.value)}
                    placeholder="Kunde suchen …"
                    className="w-full px-3 py-2 border rounded-xl text-sm"
                  />
                  <select value={kundeId} onChange={(e) => kundeWaehlen(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm bg-white">
                    <option value="">Kunde wählen …</option>
                    {kundenGefiltert.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                  {kundeId && kundeProjekte.length === 0 && (
                    <p className="text-xs text-amber-700">
                      Dieser Kunde hat noch kein Projekt/Aufmaß. Das Dokument kann erst zugeordnet werden, wenn ein Projekt für ihn existiert.
                    </p>
                  )}
                  {kundeId && kundeProjekte.length > 0 && (
                    <select value={projektId} onChange={(e) => setProjektId(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm bg-white">
                      <option value="">Projekt wählen …</option>
                      {kundeProjekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                  <div className="flex gap-2">
                    <button
                      disabled={!projektId || speichert}
                      onClick={() => zuordnen(d, projektId)}
                      className="px-3 py-2 rounded-xl text-sm text-white bg-[#E8590C] disabled:bg-[#e5e5ea] disabled:text-[#86868b]"
                    >
                      {speichert ? 'Speichert …' : 'Zuordnen'}
                    </button>
                    {d.projektId && (
                      <button disabled={speichert} onClick={() => zuordnen(d, null)} className="px-3 py-2 rounded-xl text-sm border border-[#e5e5ea]">
                        Zuordnung lösen
                      </button>
                    )}
                    <button onClick={() => setOffenId(null)} className="px-3 py-2 rounded-xl text-sm border border-[#e5e5ea]">Abbrechen</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
