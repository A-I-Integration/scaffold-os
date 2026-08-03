'use client';

import { useState, useCallback, useEffect } from 'react';
import { uploadProjectMedia, getProjectMedia, deleteProjectMedia, ProjectMedia } from '@/lib/actions/media';

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
    getProjectMedia(sessionId)
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
        const fd = new FormData();
        fd.append('file', file);
        const result = await uploadProjectMedia(fd, sessionId);
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
      await deleteProjectMedia(media.id, media.file_path);
      setPhotos((prev) => prev.filter((p) => p.id !== media.id));
    } catch (err: any) {
      alert(err.message);
    }
  }, []);

  const getPublicUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/project-media/${path}`;

  if (!sessionId) return <div className="text-yellow-300 text-sm">⚠️ Session-ID fehlt</div>;

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
          className="w-full rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/50 py-6 text-center hover:border-blue-500 hover:bg-slate-800 disabled:opacity-50"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2 text-slate-300">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              Wird hochgeladen...
            </span>
          ) : (
            <span className="text-slate-300">
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
        <p className="text-center text-sm text-slate-500">Noch keine Fotos</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg bg-slate-800">
              <img
                src={getPublicUrl(p.file_path)}
                alt={p.file_name}
                className="h-full w-full object-cover cursor-pointer"
                onClick={() => setPreview(getPublicUrl(p.file_path))}
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
          <img src={preview} alt="Vorschau" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}