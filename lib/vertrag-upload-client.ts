'use client';

import { createClient } from '@/lib/supabase/client';

// ============================================================
// SCAFFOLD OS – Vertragsdokument-Upload (Phase 28)
//
// Gleiches Muster wie lib/project-events-client.ts, aber für
// beliebige Dokumente (PDF, Word, o.ä.) statt nur Fotos – für die
// Ablage von Angebot/AGB/unterschriebenem Vertrag pro Auftrag.
// Landet im bestehenden Bucket "project-media" (kein neues Bucket
// nötig), Unterordner projects/{projectId}/vertraege/.
// ============================================================

export interface HochgeladeneDatei {
  storage_path: string;
  url: string;
  file_name: string;
  file_type: string;
}

export async function uploadVertragsdokument(file: File, projectId: string): Promise<HochgeladeneDatei> {
  const supabase = createClient();

  if (file.size > 20 * 1024 * 1024) throw new Error('Datei zu groß (max. 20MB)');

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'pdf';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const storagePath = `projects/${projectId}/vertraege/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('project-media')
    .upload(storagePath, file, { contentType: file.type || 'application/octet-stream', upsert: false });

  if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/project-media/${storagePath}`;

  return { storage_path: storagePath, url: publicUrl, file_name: file.name, file_type: file.type || 'application/octet-stream' };
}
