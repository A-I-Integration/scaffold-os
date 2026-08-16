'use client';

import { useState, useCallback, useEffect } from 'react';
import KiHinweis from '@/components/KiHinweis';

interface Props {
  sessionId: string;
}

export default function FotoAnalyse({ sessionId }: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Gespeichertes Ergebnis wiederherstellen (z.B. nach Zurück-Navigation)
  useEffect(() => {
    const saved = localStorage.getItem('scaffold_foto_analyse');
    if (saved) setResult(saved);
  }, []);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/foto-analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Analyse fehlgeschlagen');

      setResult(json.analysis);
      localStorage.setItem('scaffold_foto_analyse', json.analysis);
    } catch (err: any) {
      alert('KI-Analyse fehlgeschlagen: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  }, [sessionId]);

  return (
    <div className="space-y-3">
      <button
        onClick={handleAnalyze}
        disabled={analyzing}
        className="w-full rounded-xl border border-purple-500/50 bg-purple-600/20 py-3 text-sm font-medium text-purple-300 hover:bg-purple-600/30 disabled:opacity-50 transition"
      >
        {analyzing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
            KI analysiert Fotos...
          </span>
        ) : (
          <span>🔮 KI-Foto-Analyse starten (Fassade, Hindernisse, Hinweise)</span>
        )}
      </button>
      <KiHinweis text="KI-gestützte Foto-Analyse – erkannte Merkmale bitte vor Ort gegenprüfen." />

      {result && (
        <div className="rounded-xl bg-purple-900/20 border border-purple-500/30 p-4 animate-in fade-in slide-in-from-top-2">
          <p className="text-xs text-purple-300 font-medium mb-2">🔮 KI-Analyse</p>
          <p className="text-sm text-[#1d1d1f] whitespace-pre-line">{result}</p>
          <p className="text-[10px] text-[#86868b] mt-3">
            Hinweis: Die Analyse wird mit dem Projekt gespeichert. Exakte Maße bitte per LiDAR-Scan oder manuell erfassen.
          </p>
        </div>
      )}
    </div>
  );
}
