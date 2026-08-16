'use client';

import { createClient } from '@/lib/supabase/client';

// Spiegelbild der echten Live-Tabelle project_media:
// id, project_id (text), storage_path, file_name, file_type,
// created_at, uploaded_by, session_id, metadata (jsonb)
export interface ProjectMedia {
  id: string;
  project_id: string | null;
  session_id: string | null;
  file_name: string;
  storage_path: string;
  file_type: string;
  uploaded_by: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

// Upload direkt vom Browser zu Supabase Storage.
// Umgeht das Vercel-Body-Limit (~4,5MB) und zeigt echte Fehlermeldungen.
export async function uploadProjectMediaClient(
  file: File,
  sessionId: string
): Promise<ProjectMedia> {
  const supabase = createClient();

  if (!file.type.startsWith('image/')) throw new Error('Nur Bilder erlaubt');
  if (file.size > 10 * 1024 * 1024) throw new Error('Datei zu groß (max. 10MB)');

  const { data: { user } } = await supabase.auth.getUser();

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const storagePath = `temp/${sessionId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('project-media')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

  const { data: media, error: dbError } = await supabase
    .from('project_media')
    .insert({
      session_id: sessionId,
      file_name: file.name,
      storage_path: storagePath,
      file_type: file.type,
      uploaded_by: user?.id ?? null,
      metadata: { size: file.size, bucket: 'project-media' },
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from('project-media').remove([storagePath]);
    throw new Error(`Datenbank: ${dbError.message}`);
  }

  return media as ProjectMedia;
}

// ─── Grundrisse (NEU: eigener Upload-Pfad, Bilder + PDF) ───
// Grundrisse landen unter temp/{sessionId}/grundrisse/ und werden so
// von den Baustellen-Fotos getrennt – die KI-Foto-Analyse bleibt unberührt.
export async function uploadGrundrissClient(
  file: File,
  sessionId: string
): Promise<ProjectMedia> {
  const supabase = createClient();

  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';
  if (!isImage && !isPdf) throw new Error('Nur Bilder (JPG/PNG) oder PDF erlaubt');
  if (file.size > 15 * 1024 * 1024) throw new Error('Datei zu groß (max. 15MB)');

  const { data: { user } } = await supabase.auth.getUser();

  const fileExt = file.name.split('.').pop()?.toLowerCase() || (isPdf ? 'pdf' : 'jpg');
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const storagePath = `temp/${sessionId}/grundrisse/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('project-media')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

  const { data: media, error: dbError } = await supabase
    .from('project_media')
    .insert({
      session_id: sessionId,
      file_name: file.name,
      storage_path: storagePath,
      file_type: file.type,
      uploaded_by: user?.id ?? null,
      metadata: { size: file.size, bucket: 'project-media', kind: 'grundriss' },
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from('project-media').remove([storagePath]);
    throw new Error(`Datenbank: ${dbError.message}`);
  }

  return media as ProjectMedia;
}

export async function getGrundrisseClient(sessionId: string): Promise<ProjectMedia[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('project_media')
    .select('*')
    .eq('session_id', sessionId)
    .is('project_id', null)
    .like('storage_path', '%/grundrisse/%')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Fehler beim Laden: ${error.message}`);
  return (data || []) as ProjectMedia[];
}

export async function getProjectMediaClient(sessionId: string): Promise<ProjectMedia[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('project_media')
    .select('*')
    .eq('session_id', sessionId)
    .is('project_id', null)
    .not('storage_path', 'like', '%/grundrisse/%') // Grundrisse laufen getrennt
    .not('storage_path', 'like', '%/drohnen/%') // Drohnen-Aufnahmen laufen getrennt
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Fehler beim Laden: ${error.message}`);
  return (data || []) as ProjectMedia[];
}

// ─── Drohnen-Aufnahmen (NEU: eigener Upload-Pfad, nur Bilder) ───
// Drohnen-Fotos landen unter temp/{sessionId}/drohnen/ und werden so
// von den Baustellen-Fotos getrennt – die KI-Foto-Analyse bleibt unberührt.
export async function uploadDrohneClient(
  file: File,
  sessionId: string
): Promise<ProjectMedia> {
  const supabase = createClient();

  if (!file.type.startsWith('image/')) throw new Error('Nur Bilder erlaubt (JPG/PNG)');
  if (file.size > 20 * 1024 * 1024) throw new Error('Datei zu groß (max. 20MB)');

  const { data: { user } } = await supabase.auth.getUser();

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const storagePath = `temp/${sessionId}/drohnen/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('project-media')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

  const { data: media, error: dbError } = await supabase
    .from('project_media')
    .insert({
      session_id: sessionId,
      file_name: file.name,
      storage_path: storagePath,
      file_type: file.type,
      uploaded_by: user?.id ?? null,
      metadata: { size: file.size, bucket: 'project-media', kind: 'drohne' },
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from('project-media').remove([storagePath]);
    throw new Error(`Datenbank: ${dbError.message}`);
  }

  return media as ProjectMedia;
}

export async function getDrohnenClient(sessionId: string): Promise<ProjectMedia[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('project_media')
    .select('*')
    .eq('session_id', sessionId)
    .is('project_id', null)
    .like('storage_path', '%/drohnen/%')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Fehler beim Laden: ${error.message}`);
  return (data || []) as ProjectMedia[];
}

export async function deleteProjectMediaClient(mediaId: string, storagePath: string): Promise<void> {
  const supabase = createClient();

  await supabase.storage.from('project-media').remove([storagePath]);

  const { error } = await supabase
    .from('project_media')
    .delete()
    .eq('id', mediaId);

  if (error) throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
}
