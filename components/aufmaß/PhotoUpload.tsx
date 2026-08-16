'use client';

import { useState, useCallback, useEffect } from 'react';
import { uploadProjectMediaClient, getProjectMediaClient, deleteProjectMediaClient, ProjectMedia } from '@/lib/media-client';

interface Props {
  sessionId: string;
}

export default function PhotoUpload({ sessionId }: Props) {
  const [photos, setPhotos] = useState<ProjectMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    getProjectMediaClient(sessionId)
      .then(setPhotos)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) { alert(`${file.name} ist kein Bild.`); continue; }
      if (file.size > 10 * 1024 * 1024) { alert(`${file.name} zu groß (max. 10MB).`); continue; }

      try {
        const result = await uploadProjectMediaClient(file, sessionId);
        setPhotos((prev) => [result, ...prev]);
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
      setPhotos((prev) => prev.filter((p) => p.id !== media.id));
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
          capture="environment"
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
              <span className="text-2xl">📷</span>
              <br />
              <span className="text-sm font-medium">Foto aufnehmen oder auswählen</span>
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : photos.length === 0 ? (
        <p className="text-center text-sm text-[#86868b]">Noch keine Fotos</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
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
          <button className="absolute right-4 top-4 text-[#1d1d1f] text-2xl">✕</button>
          <img src={preview} alt="Vorschau" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>
  );
}