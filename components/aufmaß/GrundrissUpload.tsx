'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  uploadGrundrissClient,
  getGrundrisseClient,
  deleteProjectMediaClient,
  ProjectMedia,
} from '@/lib/media-client';

// ============================================================
// SCAFFOLD OS – Grundriss-Upload + KI-Analyse
// Nimmt Grundrisse/Baupläne als Bild (JPG/PNG) oder PDF entgegen.
// Die KI extrahiert Maße & Gebäudedaten → Schritt 2 wird damit
// vorbefüllt (localStorage: scaffold_grundriss_daten / _analyse).
// ============================================================

interface Props {
  sessionId: string;
}

export default function GrundrissUpload({ sessionId }: Props) {
  const [files, setFiles] = useState<ProjectMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [structured, setStructured] = useState<Record<string, any> | null>(null);

  // Gespeicherte Ergebnisse wiederherstellen (z. B. nach Zurück-Navigation)
  useEffect(() => {
    const saved = localStorage.getItem('scaffold_grundriss_analyse');
    if (saved) setResult(saved);
    const savedS = localStorage.getItem('scaffold_grundriss_daten');
    if (savedS) {
      try { setStructured(JSON.parse(savedS)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    getGrundrisseClient(sessionId)
      .then(setFiles)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected?.length) return;
    setUploading(true);

    for (const file of Array.from(selected)) {
      const ok = file.type.startsWith('image/') || file.type === 'application/pdf';
      if (!ok) { alert(`${file.name}: Nur Bilder (JPG/PNG) oder PDF erlaubt.`); continue; }
      if (file.size > 15 * 1024 * 1024) { alert(`${file.name} zu groß (max. 15MB).`); continue; }

      try {
        const media = await uploadGrundrissClient(file, sessionId);
        setFiles((prev) => [media, ...prev]);
      } catch (err: any) {
        alert(`Upload fehlgeschlagen: ${err.message}`);
      }
    }
    setUploading(false);
    e.target.value = '';
  }, [sessionId]);

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
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Analyse fehlgeschlagen');

      setResult(json.analysis);
      setStructured(json.structured || null);
      localStorage.setItem('scaffold_grundriss_analyse', json.analysis);
      localStorage.setItem('scaffold_grundriss_daten', JSON.stringify(json.structured || {}));
      if (json.pdfErrors?.length) {
        alert('⚠️ Hinweis: ' + json.pdfErrors.join(' | '));
      }
    } catch (err: any) {
      alert('KI-Grundriss-Analyse fehlgeschlagen: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  }, [sessionId]);

  const getPublicUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/project-media/${path}`;

  if (!sessionId) return <div className="text-yellow-300 text-sm">⚠️ Session-ID fehlt</div>;

  const masse: [string, string][] = structured
    ? ([
        ['Länge', structured.laenge],
        ['Breite', structured.breite],
        ['Höhe', structured.hoehe],
        ['Traufhöhe', structured.traufhoehe],
      ]
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => [k, `${v} m`] as [string, string]))
    : [];

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
          className="w-full rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/50 py-6 text-center hover:border-blue-500 hover:bg-slate-800 disabled:opacity-50"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2 text-slate-300">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              Wird hochgeladen...
            </span>
          ) : (
            <span className="text-slate-300">
              <span className="text-2xl">📋</span>
              <br />
              <span className="text-sm font-medium">Grundriss auswählen (Bild oder PDF)</span>
            </span>
          )}
        </button>
      </div>

      {/* ─── Dateiliste ─── */}
      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : files.length === 0 ? (
        <p className="text-center text-sm text-slate-500">Noch keine Grundrisse</p>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 bg-slate-800 rounded-lg p-2">
              {f.file_type === 'application/pdf' ? (
                <div className="w-10 h-10 flex items-center justify-center rounded bg-red-500/20 text-lg">📄</div>
              ) : (
                <img src={getPublicUrl(f.storage_path)} alt={f.file_name} className="w-10 h-10 rounded object-cover" />
              )}
              <span className="flex-1 text-sm text-slate-300 truncate">{f.file_name}</span>
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
          className="w-full rounded-lg border border-teal-500/50 bg-teal-600/20 py-3 text-sm font-medium text-teal-300 hover:bg-teal-600/30 disabled:opacity-50 transition"
        >
          {analyzing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
              KI analysiert Grundrisse...
            </span>
          ) : (
            <span>📐 KI-Grundriss-Analyse starten (Maße & Gebäudedaten)</span>
          )}
        </button>
      )}

      {/* ─── Ergebnis ─── */}
      {result && (
        <div className="rounded-lg bg-teal-900/20 border border-teal-500/30 p-4 animate-in fade-in slide-in-from-top-2">
          <p className="text-xs text-teal-300 font-medium mb-2">📐 KI-Grundriss-Analyse</p>

          {masse.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {masse.map(([k, v]) => (
                <span key={k} className="rounded-full bg-teal-500/20 border border-teal-500/40 px-3 py-1 text-xs text-teal-200">
                  {k}: <strong>{v}</strong>
                </span>
              ))}
            </div>
          )}

          <p className="text-sm text-slate-200 whitespace-pre-line">{result}</p>
          <p className="text-[10px] text-slate-500 mt-3">
            ✅ Erkannte Werte werden in Schritt 2 automatisch eingetragen – bitte dort prüfen. Nur im Plan vermaßte Werte werden übernommen, keine Schätzungen.
          </p>
        </div>
      )}
    </div>
  );
}
