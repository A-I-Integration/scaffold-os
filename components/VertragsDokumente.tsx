'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileArchive, Upload, Download } from 'lucide-react';
import { uploadVertragsdokument } from '@/lib/vertrag-upload-client';

// ============================================================
// SCAFFOLD OS – Vertragsdokument-Ablage (Phase 28)
//
// Angebot/AGB/unterschriebener Vertrag existierten bisher nur als
// generierte PDFs beim Versand, nicht als abgelegtes Dokument pro
// Auftrag. Nutzt den bestehenden project-media-Bucket, mit
// metadata.kind = 'vertrag' zur Unterscheidung von Aufmaß-Fotos.
// ============================================================

interface Dokument { id: string; file_name: string; url: string; created_at: string; metadata?: { kind?: string; bezeichnung?: string } }

export default function VertragsDokumente({ projectId }: { projectId: string }) {
  const [dokumente, setDokumente] = useState<Dokument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const lade = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/project-media?project_id=${projectId}`);
      const json = await res.json();
      if (json.success) setDokumente((json.media || []).filter((m: Dokument) => m.metadata?.kind === 'vertrag'));
    } catch { /* still */ }
    setLoading(false);
  }, [projectId]);
  useEffect(() => { lade(); }, [lade]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const bezeichnung = prompt('Bezeichnung für dieses Dokument (z.B. "Unterschriebenes Angebot", "AGB"):', file.name);
    if (bezeichnung === null) { e.target.value = ''; return; }
    setUploading(true);
    try {
      const hochgeladen = await uploadVertragsdokument(file, projectId);
      const res = await fetch('/api/project-media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId, storage_path: hochgeladen.storage_path,
          file_name: hochgeladen.file_name, file_type: hochgeladen.file_type,
          metadata: { kind: 'vertrag', bezeichnung: bezeichnung || file.name },
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      lade();
    } catch (err: any) {
      alert('❌ Upload fehlgeschlagen: ' + err.message);
    }
    setUploading(false);
    e.target.value = '';
  }

  return (
    <div className="mt-3 pt-3 border-t border-black/5">
      <p className="text-xs font-semibold text-[#1d1d1f] flex items-center gap-1.5 mb-2"><FileArchive className="h-3.5 w-3.5 text-[#e8590c]" /> Vertragsdokumente</p>
      {loading ? <p className="text-xs text-[#86868b]">Lade…</p> : dokumente.length === 0 ? (
        <p className="text-xs text-[#86868b] mb-2">Noch keine Vertragsdokumente abgelegt (z.B. unterschriebenes Angebot, AGB).</p>
      ) : (
        <ul className="space-y-1.5 mb-2">
          {dokumente.map(d => (
            <li key={d.id} className="flex items-center justify-between text-xs bg-[#f5f5f7] rounded-lg px-3 py-2">
              <span>{d.metadata?.bezeichnung || d.file_name} <span className="text-[#86868b]">· {new Date(d.created_at).toLocaleDateString('de-DE')}</span></span>
              <a href={d.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#e8590c] hover:underline"><Download className="h-3 w-3" /> Öffnen</a>
            </li>
          ))}
        </ul>
      )}
      <label className="inline-flex items-center gap-1.5 text-xs text-[#e8590c] font-semibold hover:underline cursor-pointer">
        <Upload className="h-3.5 w-3.5" /> {uploading ? 'Lädt hoch…' : 'Dokument hochladen (PDF, Bild, …)'}
        <input type="file" onChange={handleUpload} disabled={uploading} className="hidden" />
      </label>
    </div>
  );
}
