'use server';

import { createClient } from '@/lib/supabase/server';

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

export async function uploadProjectMedia(
  formData: FormData,
  sessionId: string
): Promise<ProjectMedia> {
  const supabase = await createClient();

  const file = formData.get('file') as File;
  if (!file) throw new Error('Keine Datei übergeben');

  if (!file.type.startsWith('image/')) throw new Error('Nur Bilder erlaubt');
  if (file.size > 10 * 1024 * 1024) throw new Error('Datei zu groß (max. 10MB)');

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const filePath = `temp/${sessionId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('project-media')
    .upload(filePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`);

  const { data: media, error: dbError } = await supabase
    .from('project_media')
    .insert({
      session_id: sessionId,
      file_name: file.name,
      storage_path: filePath,
      file_type: file.type,
      uploaded_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      metadata: { size: file.size, bucket: 'project-media' },
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from('project-media').remove([filePath]);
    throw new Error(`DB-Fehler: ${dbError.message}`);
  }

  return media as ProjectMedia;
}

export async function getProjectMedia(sessionId: string): Promise<ProjectMedia[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('project_media')
    .select('*')
    .eq('session_id', sessionId)
    .is('project_id', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Fehler beim Laden: ${error.message}`);
  return (data || []) as ProjectMedia[];
}

export async function deleteProjectMedia(mediaId: string, filePath: string): Promise<void> {
  const supabase = await createClient();

  await supabase.storage.from('project-media').remove([filePath]);

  const { error } = await supabase
    .from('project_media')
    .delete()
    .eq('id', mediaId);

  if (error) throw new Error(`Löschen fehlgeschlagen: ${error.message}`);
}

export async function attachPhotosToProject(
  sessionId: string,
  projectId: string
): Promise<{ success: boolean; count: number }> {
  const supabase = await createClient();

  if (!sessionId || !projectId) throw new Error('sessionId und projectId erforderlich');

  const { data, error } = await supabase
    .from('project_media')
    .update({
      project_id: projectId,
      session_id: null,
    })
    .eq('session_id', sessionId)
    .is('project_id', null)
    .select();

  if (error) throw new Error(`Verknüpfung fehlgeschlagen: ${error.message}`);
  return { success: true, count: data?.length || 0 };
}