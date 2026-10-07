import type { AufmassFoto } from './aufmassblatt-pdf';

// Hilfsfunktionen, um Projekt-Fotos für das Aufmaßblatt vorzubereiten.

export interface MedienEintrag {
  storage_path: string;
  file_name: string;
  file_type: string;
  created_at: string;
  metadata?: Record<string, any> | null;
}

/** Nur echte Fotos: Bilder, aber keine Unterschrift, kein Scan, kein Grundriss. Älteste zuerst. */
export function waehleFotos(medien: MedienEintrag[], max = 12): MedienEintrag[] {
  return medien
    .filter((m) => typeof m.file_type === 'string' && m.file_type.startsWith('image/'))
    .filter((m) => m.metadata?.type !== 'unterschrift' && m.metadata?.kind !== 'scan')
    .filter((m) => !/\/(grundrisse|scans)\//.test(m.storage_path) && !/unterschrift/i.test(m.file_name))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(0, Math.max(0, max));
}

/** Lädt ein Bild, verkleinert es (längste Seite maxPx) und liefert JPEG als Data-URL. Nur im Browser. */
export async function ladeBildVerkleinert(url: string, maxPx = 900): Promise<{ dataUrl: string; breitePx: number; hoehePx: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const faktor = Math.min(1, maxPx / Math.max(bmp.width, bmp.height));
    const b = Math.max(1, Math.round(bmp.width * faktor));
    const h = Math.max(1, Math.round(bmp.height * faktor));
    const canvas = document.createElement('canvas');
    canvas.width = b;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, b, h);
    ctx.drawImage(bmp, 0, 0, b, h);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.8), breitePx: b, hoehePx: h };
  } catch {
    return null;
  }
}

export async function ladeAufmassFotos(medien: MedienEintrag[], publicBaseUrl: string, max = 12): Promise<AufmassFoto[]> {
  const ausgewaehlt = waehleFotos(medien, max);
  const ergebnis: AufmassFoto[] = [];
  for (const m of ausgewaehlt) {
    const bild = await ladeBildVerkleinert(`${publicBaseUrl}/storage/v1/object/public/project-media/${m.storage_path}`);
    if (!bild) continue;
    const datum = m.created_at ? new Date(m.created_at).toLocaleDateString('de-DE') : '';
    ergebnis.push({ ...bild, beschriftung: [m.file_name, datum].filter(Boolean).join(' – ') });
  }
  return ergebnis;
}
