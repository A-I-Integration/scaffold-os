'use client';

import { createClient } from '@/lib/supabase/client';

export interface ProjectMedia {
  id: string;
  project_id: string | null;
  session_id: string | null;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  storage_bucket: string;
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

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const filePath = `temp/${sessionId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('project-media')
    .upload(filePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

  const { data: media, error: dbError } = await supabase
    .from('project_media')
    .insert({
      session_id: sessionId,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type,
      file_size: file.size,
      storage_bucket: 'project-media',
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from('project-media').remove([filePath]);
    throw new Error(`Datenbank: ${dbError.message}`);
  }

  return media as ProjectMedia;
}

export async function getProjectMediaClient(sessionId: string): Promise<ProjectMedia[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('project_media')
    .select('*')
    .eq('session_id', sessionId)
    .is('project_id', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Fehler beim Laden: ${error.message}`);
  return (data || []) as ProjectMedia[];
}

export async function deleteProjectMediaClient(mediaId: string, filePath: string): Promise<void> {
  const supabase = createClient();

  await supabase.storage.from('project-media').remove([filePath]);

  const { error } = await supabase
    .from('project_media')
    .delete()
    .eq('id', mediaId);

  if (error) throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
}
