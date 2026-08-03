'use client';

import { useState, useCallback } from 'react';

interface Measurements {
  lengthM: number;
  widthM: number;
  heightM: number;
  vertexCount: number;
  fileType: string;
}

interface Props {
  sessionId: string;
  onMeasurements?: (m: Measurements) => void;
}

export default function LiDARUpload({ sessionId, onMeasurements }: Props) {
  const [uploading, setUploading] = useState(false);
  const [scan, setScan] = useState<{ m: Measurements; name: string } | null>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('sessionId', sessionId);

      const res = await fetch('/api/lidar-upload', { method: 'POST', body: fd });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || 'Upload fehlgeschlagen');

      setScan({ m: json.measurements, name: json.fileName });
      onMeasurements?.(json.measurements);
    } catch (err: any) {
      alert('LiDAR-Fehler: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [sessionId, onMeasurements]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="file"
          accept=".obj,.ply"
          onChange={handleFile}
          disabled={uploading}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <button
          disabled={uploading}
          className="w-full rounded-lg border border-dashed border-slate-500 bg-slate-800/50 py-4 text-sm text-slate-300 hover:border-purple-500 hover:bg-slate-800 disabled:opacity-50 transition"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              3D-Scan wird analysiert...
            </span>
          ) : (
            <span>
              <span className="text-lg">📱</span> <span className="font-medium">LiDAR-Scan hochladen</span>
              <br />
              <span className="text-[11px] text-slate-500">.obj oder .ply aus Polycam / Scaniverse / RoomPlan</span>
            </span>
          )}
        </button>
      </div>

      {scan && (
        <div className="rounded-lg bg-purple-900/20 border border-purple-500/30 p-4 animate-in fade-in slide-in-from-top-2">
          <p className="text-xs text-purple-300 font-medium mb-3">
            ✅ Maße extrahiert aus <span className="text-white">{scan.name}</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded bg-slate-800 p-2 text-center">
              <p className="text-[10px] text-slate-400 uppercase">Länge</p>
              <p className="text-lg font-bold text-white">{scan.m.lengthM.toFixed(2)} m</p>
            </div>
            <div className="rounded bg-slate-800 p-2 text-center">
              <p className="text-[10px] text-slate-400 uppercase">Breite</p>
              <p className="text-lg font-bold text-white">{scan.m.widthM.toFixed(2)} m</p>
            </div>
            <div className="rounded bg-slate-800 p-2 text-center">
              <p className="text-[10px] text-slate-400 uppercase">Höhe</p>
              <p className="text-lg font-bold text-white">{scan.m.heightM.toFixed(2)} m</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 text-center">
            {scan.m.vertexCount.toLocaleString()} Vertices · {scan.m.fileType.toUpperCase()}
          </p>
        </div>
      )}
    </div>
  );
}