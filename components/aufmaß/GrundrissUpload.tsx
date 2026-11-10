'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  uploadGrundrissClient,
  getGrundrisseClient,
  deleteProjectMediaClient,
  ProjectMedia,
} from '@/lib/media-client';
import KiHinweis from '@/components/KiHinweis';
import { planLesen, ruecksprunge, type PlanImport } from '@/lib/cad/plan-import';

// ============================================================
// SCAFFOLD OS – Grundriss-Upload + KI-Analyse
// Nimmt Grundrisse/Baupläne als Bild (JPG/PNG) oder PDF entgegen.
// Die KI extrahiert Maße & Gebäudedaten → Schritt 2 wird damit
// vorbefüllt (localStorage: scaffold_grundriss_daten / _analyse).
// ============================================================

interface Props {
  sessionId: string;
  // FIX (Bug-Report): Ist bereits ein gespeichertes Projekt geöffnet
  // (?id=... in der URL), läuft der Upload/Abruf direkt über project_id –
  // sonst verschwinden bereits hochgeladene Grundrisse beim Wiederöffnen
  // eines Projekts (neue sessionId pro Browser-Besuch, siehe media-client.ts).
  projectId?: string | null;
}

export default function GrundrissUpload({ sessionId, projectId }: Props) {
  const [files, setFiles] = useState<ProjectMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [structured, setStructured] = useState<Record<string, any> | null>(null);
  const [discarded, setDiscarded] = useState<string[]>([]);
  // Maße direkt aus den Zeichenlinien eines Vektor-Plans (genauer als die KI) – siehe lib/cad/plan-import.ts
  const [plan, setPlan] = useState<PlanImport | null>(null);
  const [planLiest, setPlanLiest] = useState(false);

  // Gespeicherte Ergebnisse wiederherstellen (z. B. nach Zurück-Navigation)
  useEffect(() => {
    const saved = localStorage.getItem('scaffold_grundriss_analyse');
    if (saved) setResult(saved);
    const savedP = localStorage.getItem('scaffold_plan_import');
    if (savedP) {
      try { setPlan(JSON.parse(savedP)); } catch { /* ignore */ }
    }
    const savedS = localStorage.getItem('scaffold_grundriss_daten');
    if (savedS) {
      try { setStructured(JSON.parse(savedS)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    getGrundrisseClient(sessionId, projectId)
      .then(setFiles)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId, projectId]);

  // Plan-Maße in die Grundriss-Daten schreiben (Länge/Breite des Hauptgeschosses). Danach gelten sie als frisch analysiert.
  const planUebernehmen = useCallback((p: PlanImport) => {
    const haupt = p.geschosse.find((g) => g.ebene === p.hauptEbene);
    if (!haupt) return;
    let alt: Record<string, unknown> = {};
    try { alt = JSON.parse(localStorage.getItem('scaffold_grundriss_daten') || '{}') || {}; } catch { /* ignore */ }
    const neu = { ...alt, laenge: haupt.laengeM, breite: haupt.breiteM, ...(p.dachform ? { dachform: p.dachform } : {}), ...(p.firstKoteM ? { hoehe: p.firstKoteM } : {}), ...(p.traufKoteM ? { traufhoehe: p.traufKoteM } : {}) };
    localStorage.setItem('scaffold_plan_import', JSON.stringify(p));
    localStorage.setItem('scaffold_grundriss_daten', JSON.stringify(neu));
    ['scaffold_step2', 'scaffold_step3', 'scaffold_step4', 'scaffold_step5',
     'scaffold_foto_daten', 'scaffold_foto_analyse', 'scaffold_lidar_measurements',
    ].forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('scaffold_grundriss_fresh', '1');
    setPlan(p);
    setStructured(neu);
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected?.length) return;
    setUploading(true);

    for (const file of Array.from(selected)) {
      const ok = file.type.startsWith('image/') || file.type === 'application/pdf';
      if (!ok) { alert(`${file.name}: Nur Bilder (JPG/PNG) oder PDF erlaubt.`); continue; }
      if (file.size > 15 * 1024 * 1024) { alert(`${file.name} zu groß (max. 15MB).`); continue; }

      try {
        const media = await uploadGrundrissClient(file, sessionId, projectId);
        setFiles((prev) => [media, ...prev]);
        if (file.type === 'application/pdf') {
          setPlanLiest(true);
          try {
            const p = await planLesen(file);
            if (p) planUebernehmen(p);
          } catch { /* kein lesbarer Vektor-Plan: die KI-Analyse bleibt der Weg */ }
          finally { setPlanLiest(false); }
        }
      } catch (err: any) {
        alert(`Upload fehlgeschlagen: ${err.message}`);
      }
    }
    setUploading(false);
    e.target.value = '';
  }, [sessionId, projectId, planUebernehmen]);

  const handleDelete = useCallback(async (media: ProjectMedia) => {
    if (!confirm(`"${media.file_name}" löschen?`)) return;
    try {
      await deleteProjectMediaClient(media.id, media.storage_path);
      setFiles((prev) => prev.filter((p) => p.id !== media.id));
    } catch (err: any) {
      alert(err.message);
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/grundriss-analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, projectId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Analyse fehlgeschlagen');

      // Maße aus den Zeichenlinien des Plans schlagen die Werte der KI (die mischt gern Geschosse)
      let strukt = json.structured || null;
      try {
        const pl: PlanImport | null = JSON.parse(localStorage.getItem('scaffold_plan_import') || 'null');
        const haupt = pl?.geschosse.find((g) => g.ebene === pl.hauptEbene);
        if (haupt && pl) strukt = { ...(strukt || {}), laenge: haupt.laengeM, breite: haupt.breiteM, ...(pl.dachform ? { dachform: pl.dachform } : {}), ...(pl.firstKoteM ? { hoehe: pl.firstKoteM } : {}), ...(pl.traufKoteM ? { traufhoehe: pl.traufKoteM } : {}) };
      } catch { /* ignore */ }
      json.structured = strukt;
      setResult(json.analysis);
      setStructured(strukt);
      setDiscarded(json.verworfen || []);
      localStorage.setItem('scaffold_grundriss_analyse', json.analysis);
      localStorage.setItem('scaffold_grundriss_daten', JSON.stringify(json.structured || {}));
      // Neue Analyse = frischer Start: alte Wizard-Eingaben und Vorbefüllungen
      // (Foto/LiDAR) verwerfen, damit keine Alt-Werte die Grundriss-Werte
      // blockieren oder vermischen. Schritt 1 (Projekt/Adresse) bleibt erhalten.
      ['scaffold_step2', 'scaffold_step3', 'scaffold_step4', 'scaffold_step5',
       'scaffold_foto_daten', 'scaffold_foto_analyse', 'scaffold_lidar_measurements',
      ].forEach((k) => localStorage.removeItem(k));
      localStorage.setItem('scaffold_grundriss_fresh', '1');
      if (json.pdfErrors?.length) {
        alert('⚠️ Hinweis: ' + json.pdfErrors.join(' | '));
      }
    } catch (err: any) {
      alert('KI-Grundriss-Analyse fehlgeschlagen: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  }, [sessionId, projectId]);

  const getPublicUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/project-media/${path}`;

  if (!sessionId) return <div className="text-amber-700 text-sm">⚠️ Session-ID fehlt</div>;

  const masse: [string, string][] = [];
  if (structured) {
    const zeilen: [string, any, string][] = [
      ['Länge', structured.laenge, 'm'],
      ['Breite', structured.breite, 'm'],
      ['Höhe', structured.hoehe, 'm'],
      ['Traufhöhe', structured.traufhoehe, 'm'],
      ['Höhe (Schätzung)', structured.hoehe == null ? structured.hoehe_geschaetzt : null, 'm'],
      ['Geschosse', structured.geschosse, ''],
    ];
    for (const [k, v, u] of zeilen) {
      if (v !== null && v !== undefined && v !== '') {
        masse.push([k, u ? `${v} ${u}` : `${v}`]);
      }
    }
  }

  return (
    <div className="space-y-4">
      {/* ─── Upload ─── */}
      <div className="relative">
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          onChange={handleFileSelect}
          disabled={uploading}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <button
          disabled={uploading}
          className="w-full rounded-xl border-2 border-dashed border-black/10 bg-black/5 py-6 text-center hover:border-blue-500 hover:bg-[#f5f5f7] disabled:opacity-50"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2 text-[#424245]">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              Wird hochgeladen...
            </span>
          ) : (
            <span className="text-[#424245]">
              <span className="text-2xl">📋</span>
              <br />
              <span className="text-sm font-medium">Grundriss auswählen (Bild oder PDF)</span>
            </span>
          )}
        </button>
      </div>

      {planLiest && <p className="text-center text-xs text-[#86868b]">Plan wird gelesen …</p>}
      {plan && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900 space-y-1">
          <p className="font-medium">📐 Maße aus dem Plan gelesen (Maßstab 1:{plan.massstab})</p>
          {plan.geschosse.map((g) => (
            <p key={g.titel}>
              {g.titel}: {String(g.laengeM).replace('.', ',')} × {String(g.breiteM).replace('.', ',')} m{g.fenster !== undefined && g.tueren !== undefined ? `, ${g.fenster} Fenster, ${g.tueren} Türen` : ''}{g.ebene === plan.hauptEbene ? ' ← als Länge und Breite eingetragen' : ''}{g.vorbauten?.length ? ` (ohne ${g.vorbauten.length} Vorbau${g.vorbauten.length > 1 ? 'ten' : ''}, zusammen ca. ${String(Math.round(g.vorbauten.reduce((a, v) => a + v.flaecheM2, 0) * 10) / 10).replace('.', ',')} m²)` : ''}
            </p>
          ))}
          {ruecksprunge(plan).length > 0 && (
            <p>Das {ruecksprunge(plan).map((g) => g.titel).join(', ')} ist kürzer als das Hauptgeschoss – in Schritt 2 bitte prüfen, ob es einen eigenen Abschnitt braucht.</p>
          )}
          {plan.dachform && <p>Dachform laut First-/Traufe-Beschriftung im Plan: {plan.dachform}</p>}
          {(plan.firstKoteM !== undefined || plan.traufKoteM !== undefined) && (
            <p>
              Höhen laut Schnitt (±0,00 = Erdgeschoss-Fußboden): {plan.firstKoteM !== undefined && <>First +{String(plan.firstKoteM.toFixed(2)).replace('.', ',')} m</>}
              {plan.firstKoteM !== undefined && plan.traufKoteM !== undefined && ', '}
              {plan.traufKoteM !== undefined && <>Traufe +{String(plan.traufKoteM.toFixed(2)).replace('.', ',')} m</>}
              {plan.dachneigungGrad !== undefined && <> · Dachneigung ca. {String(plan.dachneigungGrad).replace('.', ',')}° (ohne Überstand gerechnet)</>}. Am Hang ist die Gerüsthöhe auf der Talseite größer.
            </p>
          )}
          {plan.gelaende && (
            <p>
              Gelände am Erdgeschoss laut Höhenpunkten im Grundriss: {plan.gelaende.minM.toFixed(2).replace('.', ',')} bis {plan.gelaende.maxM >= 0 ? '+' : ''}{plan.gelaende.maxM.toFixed(2).replace('.', ',')} m,
              {' '}Unterschied {String(plan.gelaende.unterschiedM).replace('.', ',')} m{plan.gelaende.unterschiedM >= 1 ? ' – Hanglage, die Gerüsthöhe ist je Seite verschieden.' : '.'}
            </p>
          )}
          <p className="text-violet-700">Bitte mit dem Plan vergleichen, bevor es weitergeht.</p>
        </div>
      )}

      {/* ─── Dateiliste ─── */}
      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-center text-sm text-[#86868b]">Noch keine Grundrisse</p>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 bg-[#f5f5f7] rounded-xl p-2">
              {f.file_type === 'application/pdf' ? (
                <div className="w-10 h-10 flex items-center justify-center rounded bg-red-500/20 text-lg">📄</div>
              ) : (
                <img src={getPublicUrl(f.storage_path)} alt={f.file_name} className="w-10 h-10 rounded object-cover" />
              )}
              <span className="flex-1 text-sm text-[#424245] truncate">{f.file_name}</span>
              <button
                onClick={() => handleDelete(f)}
                className="rounded-full bg-red-500/80 px-2 py-0.5 text-white text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ─── KI-Analyse ─── */}
      {files.length > 0 && (
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="w-full rounded-xl border border-teal-300 bg-teal-50 py-3 text-sm font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-50 transition"
        >
          {analyzing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
              KI analysiert Grundrisse...
            </span>
          ) : (
            <span>📐 KI-Grundriss-Analyse starten (Maße & Gebäudedaten)</span>
          )}
        </button>
      )}
      <KiHinweis text="KI-gestützte Grundriss-Analyse – extrahierte Maße bitte nachmessen, bevor sie ins Aufmaß übernommen werden." />

      {/* ─── Ergebnis ─── */}
      {result && (
        <div className="rounded-xl bg-teal-50 border border-teal-200 p-4 animate-in fade-in slide-in-from-top-2">
          <p className="text-xs text-teal-700 font-medium mb-2">📐 KI-Grundriss-Analyse</p>

          {masse.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {masse.map(([k, v]) => (
                <span key={k} className="rounded-full bg-white border border-teal-300 px-3 py-1 text-xs text-teal-800">
                  {k}: <strong>{v}</strong>
                </span>
              ))}
            </div>
          )}

          {discarded.length > 0 && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 mb-3">
              <p className="text-xs text-red-700 font-medium mb-1">⚠️ Nicht belegte / unplausible KI-Werte verworfen:</p>
              {discarded.map((d, i) => (
                <p key={i} className="text-xs text-red-700">• {d}</p>
              ))}
            </div>
          )}

          <p className="text-sm text-[#1d1d1f] whitespace-pre-line">{result}</p>
          <p className="text-[10px] text-[#86868b] mt-3">
            ✅ Erkannte Werte werden in Schritt 2 automatisch eingetragen (alte Eingaben wurden zurückgesetzt). Geschätzte Höhe ist als „Schätzung" markiert – bitte in Schritt 2 prüfen.
          </p>
        </div>
      )}
    </div>
  );
}
