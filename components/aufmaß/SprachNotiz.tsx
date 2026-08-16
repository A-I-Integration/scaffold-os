'use client';

import { useRef, useState } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import KiHinweis from '@/components/KiHinweis';

// ============================================================
// Sprachnotiz (Phase 18) – Aufnehmen am Handy, KI transkribiert,
// Text wird ans Notizfeld angehängt.
// Die Audiodatei wird nicht gespeichert – nur der Text.
// ============================================================

export default function SprachNotiz({ onText }: { onText: (text: string) => void }) {
  const [aufnahme, setAufnahme] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState('');
  const [vorschau, setVorschau] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function starten() {
    setFehler('');
    setVorschau('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        await transkribieren(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setAufnahme(true);
    } catch {
      setFehler('Kein Mikrofon-Zugriff – bitte im Browser erlauben.');
    }
  }

  function stoppen() {
    recorderRef.current?.stop();
    setAufnahme(false);
  }

  async function transkribieren(blob: Blob) {
    setLaedt(true);
    setFehler('');
    try {
      const form = new FormData();
      form.append('audio', blob, 'notiz.webm');
      const res = await fetch('/api/sprachnotiz', { method: 'POST', body: form });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Transkription fehlgeschlagen');
      setVorschau(json.text);
    } catch (e: any) {
      setFehler(e.message);
    } finally {
      setLaedt(false);
    }
  }

  return (
    <div className="mt-3">
      {!aufnahme && !laedt && (
        <button
          type="button"
          onClick={starten}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/10 hover:bg-black/15 text-[#424245] text-sm font-medium transition-colors"
        >
          <Mic className="w-4 h-4 text-[#e8590c]" /> Sprachnotiz aufnehmen
        </button>
      )}
      {aufnahme && (
        <button
          type="button"
          onClick={stoppen}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
        >
          <Square className="w-4 h-4" /> Aufnahme stoppen
        </button>
      )}
      {laedt && (
        <p className="inline-flex items-center gap-2 text-sm text-[#86868b]">
          <Loader2 className="w-4 h-4 animate-spin" /> KI schreibt mit …
        </p>
      )}

      {fehler && <p className="mt-2 text-sm text-red-600">{fehler}</p>}

      {vorschau && (
        <div className="mt-3 bg-[#f5f5f7] rounded-xl p-3">
          <p className="text-sm text-[#1d1d1f]">„{vorschau}"</p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => { onText(vorschau); setVorschau(''); }}
              className="px-3 py-1.5 rounded-full bg-[#e8590c] hover:bg-[#d9480f] text-white text-xs font-semibold transition-colors"
            >
              An Notizen anhängen
            </button>
            <button
              type="button"
              onClick={() => setVorschau('')}
              className="px-3 py-1.5 rounded-full bg-black/10 hover:bg-black/15 text-[#424245] text-xs transition-colors"
            >
              Verwerfen
            </button>
          </div>
        </div>
      )}

      <KiHinweis text="🤖 KI-Transkription – Text bitte kurz prüfen. Die Audioaufnahme wird nicht gespeichert." />
    </div>
  );
}
