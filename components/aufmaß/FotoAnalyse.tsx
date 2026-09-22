'use client';

import { useState, useCallback, useEffect } from 'react';
import KiHinweis from '@/components/KiHinweis';

interface Props {
  sessionId: string;
  // FIX (Bug-Report): bei bereits gespeichertem Projekt sucht die Analyse
  // die Fotos über project_id statt über die browserlokale sessionId.
  projectId?: string | null;
}

// Phase 66: Die Analyse läuft jetzt über die Queue (POST legt einen
// ki_jobs-Eintrag an und antwortet SOFORT, GET pollt den Status).
// Vorteil: kein Vercel-Timeout mehr, die Analyse kann auch länger
// dauern; mehrere Uploads stauen sich nicht mehr gegenseitig auf.
// Das Endergebnis ist identisch zum alten synchronen Aufruf.

const POLL_INTERVAL_MS = 3000;
const POLL_MAX = 200; // 200 × 3 s = max. 10 Minuten Wartezeit

export default function FotoAnalyse({ sessionId, projectId }: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Gespeichertes Ergebnis wiederherstellen (z.B. nach Zurück-Navigation).
  // Phase 66c: Session-scoped Key — vorher lag die Analyse GLOBAL im
  // Browser und wurde bei JEDEM Aufmaß gezeigt, egal welche Baustelle.
  const storageKey = `scaffold_foto_analyse_${sessionId}`;
  useEffect(() => {
    setResult(localStorage.getItem(storageKey));
  }, [storageKey]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      // 1) Job anlegen — antwortet sofort mit { jobId, status: 'queued' }
      const res = await fetch('/api/foto-analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, projectId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Analyse fehlgeschlagen');
      const jobId = json.jobId as string;

      // 2) Pollen bis der Worker fertig ist
      let data: any = null;
      for (let i = 0; i < POLL_MAX; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const pollRes = await fetch(`/api/foto-analyse?jobId=${jobId}`);
        data = await pollRes.json();
        if (!pollRes.ok && pollRes.status !== 500) throw new Error(data.error || 'Polling fehlgeschlagen');
        if (data.status === 'done' || data.status === 'error') break;
      }

      if (!data || data.status !== 'done') {
        throw new Error(data?.error || 'Die Analyse dauert zu lange. Bitte später erneut versuchen.');
      }

      setResult(data.analysis);
      localStorage.setItem(storageKey, data.analysis);
    } catch (err: any) {
      alert('KI-Analyse fehlgeschlagen: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  }, [sessionId, projectId]);

  return (
    <div className="space-y-3">
      <button
        onClick={handleAnalyze}
        disabled={analyzing}
        className="w-full rounded-xl border border-purple-300 bg-purple-50 py-3 text-sm font-medium text-purple-700 hover:bg-purple-100 disabled:opacity-50 transition"
      >
        {analyzing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
            KI analysiert Fotos (läuft im Hintergrund)...
          </span>
        ) : (
          <span>🔮 KI-Foto-Analyse starten (Fassade, Hindernisse, Hinweise)</span>
        )}
      </button>
      <KiHinweis text="KI-gestützte Foto-Analyse – erkannte Merkmale bitte vor Ort gegenprüfen." />

      {result && (
        <div className="rounded-xl bg-purple-50 border border-purple-200 p-4 animate-in fade-in slide-in-from-top-2">
          <p className="text-xs text-purple-700 font-medium mb-2">🔮 KI-Analyse</p>
          <p className="text-sm text-[#1d1d1f] whitespace-pre-line">{result}</p>
          <p className="text-[10px] text-[#86868b] mt-3">
            Hinweis: Die Analyse wird mit dem Projekt gespeichert. Exakte Maße bitte per LiDAR-Scan oder manuell erfassen.
          </p>
        </div>
      )}
    </div>
  );
}
