'use client';

import { createClient } from '@/lib/supabase/client';

// ============================================================
// SCAFFOLD OS – Foto-Upload für Projekt-Ereignisse (Phase 18)
//
// Gleiches Muster wie lib/media-client.ts, aber für Projekte, die
// bereits existieren (nach dem Aufmaß), statt für Aufmaß-Sessions.
// Fotos landen im bestehenden Bucket "project-media" unter
// projects/{projectId}/events/..., wie schon beim Unterschrift-
// Upload in app/api/attach-photos/route.ts.
//
// Es wird bewusst KEIN Eintrag in der Tabelle project_media
// angelegt (die bleibt unverändert) – der Storage-Pfad wird
// direkt im photos-Array von project_events gespeichert.
// ============================================================

export interface EventPhoto {
  path: string;
  url: string;
  file_name: string;
}

export async function uploadEventPhotoClient(file: File, projectId: string): Promise<EventPhoto> {
  const supabase = createClient();

  if (!file.type.startsWith('image/')) throw new Error('Nur Bilder erlaubt');
  if (file.size > 10 * 1024 * 1024) throw new Error('Datei zu groß (max. 10MB)');

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const storagePath = `projects/${projectId}/events/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('project-media')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/project-media/${storagePath}`;

  return { path: storagePath, url: publicUrl, file_name: file.name };
}

export async function deleteEventPhotoClient(storagePath: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage.from('project-media').remove([storagePath]);
  if (error) throw new Error(`Storage: ${error.message}`);
}
