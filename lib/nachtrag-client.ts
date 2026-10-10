'use client';

import { uploadVertragsdokument } from '@/lib/vertrag-upload-client';
import { ladeBildVerkleinert } from '@/lib/aufmassblatt-fotos';
import type { NachtragFoto } from '@/lib/nachtrag';

// Browser-Helfer für Nachträge: Fotos verkleinern + hochladen, PDF am Projekt ablegen.

/** Verkleinert ein Foto (längste Seite 1600 px, JPEG) – Fallback: Originaldatei. */
async function verkleinere(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const faktor = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const b = Math.max(1, Math.round(bmp.width * faktor));
    const h = Math.max(1, Math.round(bmp.height * faktor));
    const canvas = document.createElement('canvas');
    canvas.width = b; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, b, h); ctx.drawImage(bmp, 0, 0, b, h);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export async function ladeNachtragFotosHoch(dateien: File[], projectId: string): Promise<NachtragFoto[]> {
  const ergebnis: NachtragFoto[] = [];
  for (const d of dateien) {
    if (!d.type.startsWith('image/')) continue;
    const klein = await verkleinere(d);
    const up = await uploadVertragsdokument(klein, projectId, 'nachtraege');
    ergebnis.push({ url: up.url, file_name: d.name });
  }
  return ergebnis;
}

export async function ladeFotosFuerPdf(fotos: NachtragFoto[], max = 6) {
  const liste = [];
  for (const f of fotos.slice(0, max)) {
    const b = await ladeBildVerkleinert(f.url, 900);
    if (b) liste.push(b);
  }
  return liste;
}

/** Legt das Nachtrags-PDF unter "Dokumente" des Projekts ab. */
export async function legeNachtragPdfAmProjektAb(pdf: Blob, projectId: string, dateiname: string, bezeichnung: string): Promise<void> {
  const file = new File([pdf], dateiname, { type: 'application/pdf' });
  const up = await uploadVertragsdokument(file, projectId, 'nachtraege');
  const res = await fetch('/api/project-media', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId, storage_path: up.storage_path, file_name: up.file_name, file_type: up.file_type,
      metadata: { kind: 'dokument', bezeichnung, quelle: 'nachtrag' },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) throw new Error(json?.error || 'Eintrag am Projekt fehlgeschlagen');
}
