'use client';

import { uploadVertragsdokument } from '@/lib/vertrag-upload-client';

// ============================================================
// SCAFFOLD OS – Aufmaßblatt am Projekt ablegen
//
// Das erzeugte Aufmaßblatt (PDF) wird zusätzlich zum Download in der
// bestehenden Dokumentenablage des Projekts gespeichert (Bucket
// "project-media", Tabelle project_media, metadata.kind = 'dokument').
// Es erscheint damit unter "Dokumente" beim Projekt/Kunden.
// Jede Erzeugung ist ein eigenes Dokument (Datum/Uhrzeit im Namen) –
// so bleibt nachvollziehbar, welcher Stand unterschrieben wurde.
// ============================================================

export function aufmassblattDateiname(kunde: string, jetzt: Date = new Date()): string {
  const sauber = String(kunde || 'Projekt').replace(/[^\wäöüÄÖÜß-]+/g, '_');
  const p = (n: number) => String(n).padStart(2, '0');
  const stempel = `${jetzt.getFullYear()}-${p(jetzt.getMonth() + 1)}-${p(jetzt.getDate())}_${p(jetzt.getHours())}${p(jetzt.getMinutes())}`;
  return `Aufmass_${sauber}_${stempel}.pdf`;
}

export async function legeAufmassblattAmProjektAb(pdf: Blob, projectId: string, dateiname: string, unterschrieben: boolean): Promise<void> {
  const file = new File([pdf], dateiname, { type: 'application/pdf' });
  const up = await uploadVertragsdokument(file, projectId, 'aufmassblaetter');
  const jetzt = new Date();
  const res = await fetch('/api/project-media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      storage_path: up.storage_path,
      file_name: up.file_name,
      file_type: up.file_type,
      metadata: {
        kind: 'dokument',
        bezeichnung: `Aufmaßblatt vom ${jetzt.toLocaleDateString('de-DE')} ${jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}${unterschrieben ? ' (unterschrieben)' : ''}`,
        quelle: 'aufmassblatt',
      },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) throw new Error(json?.error || 'Eintrag am Projekt fehlgeschlagen');
}
