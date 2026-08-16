'use client';

import { useState, useCallback, useEffect } from 'react';
import { uploadDrohneClient, getDrohnenClient, deleteProjectMediaClient, ProjectMedia } from '@/lib/media-client';

interface Props {
  sessionId: string;
}

// Drohnen-Aufnahmen: eigener Bereich für Luftbilder der Baustelle.
// Läuft getrennt von den Baustellen-Fotos (eigener Storage-Pfad /drohnen/).
export default function DrohnenUpload({ sessionId }: Props) {
  const [aufnahmen, setAufnahmen] = useState<ProjectMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    getDrohnenClient(sessionId)
      .then(setAufnahmen)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) { alert(`${file.name} ist kein Bild.`); continue; }
      if (file.size > 20 * 1024 * 1024) { alert(`${file.name} zu groß (max. 20MB).`); continue; }

      try {
        const result = await uploadDrohneClient(file, sessionId);
        setAufnahmen((prev) => [result, ...prev]);
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
      setAufnahmen((prev) => prev.filter((p) => p.id !== media.id));
    } catch (err: any) {
      alert(err.message);
    }
  }, []);

  const getPublicUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/project-media/${path}`;

  if (!sessionId) return <div className="text-amber-700 text-sm">⚠️ Session-ID fehlt</div>;

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          disabled={uploading}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <button
          disabled={uploading}
          className="w-full rounded-xl border-2 border-dashed border-black/10 bg-black/5 py-6 text-center hover:border-[#e8590c] hover:bg-[#f5f5f7] disabled:opacity-50"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2 text-[#424245]">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#e8590c] border-t-transparent" />
              Wird hochgeladen...
            </span>
          ) : (
            <span className="text-[#424245]">
              <span className="text-2xl">🚁</span>
              <br />
              <span className="text-sm font-medium">Drohnen-Fotos auswählen</span>
              <br />
              <span className="text-xs text-[#86868b]">JPG/PNG, max. 20MB pro Bild – direkt vom Tablet/Handy der Drohne</span>
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#e8590c] border-t-transparent" />
        </div>
      ) : aufnahmen.length === 0 ? (
        <p className="text-center text-sm text-[#86868b]">Noch keine Drohnen-Aufnahmen</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {aufnahmen.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-[#f5f5f7]">
              <img
                src={getPublicUrl(p.storage_path)}
                alt={p.file_name}
                className="h-full w-full object-cover cursor-pointer"
                onClick={() => setPreview(getPublicUrl(p.storage_path))}
              />
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                className="absolute right-1 top-1 rounded-full bg-red-500/80 p-1 text-white opacity-0 group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setPreview(null)}>
          <button className="absolute right-4 top-4 text-white text-2xl">✕</button>
          <img src={preview} alt="Vorschau" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>
  );
}
