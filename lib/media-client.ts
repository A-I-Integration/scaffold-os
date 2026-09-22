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

// FIX (Bug-Report, "Daten/Datei weg beim Wiederöffnen"): Alle Upload-
// Funktionen hier liefen bisher AUSSCHLIESSLICH über sessionId – eine rein
// browserlokale, projektunabhängige ID. Beim ersten Speichern eines
// Projekts wurden die Dateien zwar per project_id verknüpft (siehe
// /api/attach-photos), danach aber die sessionId aus dem Browser gelöscht.
// Wurde ein GESPEICHERTES Projekt später erneut geöffnet, entstand eine
// NEUE sessionId – die Upload-Widgets suchten dann weiter nur nach dieser
// neuen (leeren) sessionId und fanden die längst vorhandenen, dem Projekt
// zugeordneten Dateien nie wieder (obwohl sie in der Datenbank unverändert
// vorhanden waren). Jetzt: sobald eine projectId bekannt ist (Projekt
// existiert bereits), läuft Upload/Abruf DIREKT über project_id – keine
// Zwischenstation über session_id mehr nötig, Dateien bleiben dauerhaft
// sichtbar. Ohne projectId (neues, noch nicht gespeichertes Aufmaß) bleibt
// exakt das bisherige Verhalten über session_id erhalten.
function speicherPfad(bereich: 'fotos' | 'grundrisse' | 'drohnen' | 'scans', fileName: string, sessionId: string, projectId?: string | null) {
  const teilpfad = bereich === 'fotos' ? '' : `${bereich}/`;
  return projectId
    ? `projects/${projectId}/${teilpfad}${fileName}`
    : `temp/${sessionId}/${teilpfad}${fileName}`;
}

// Upload direkt vom Browser zu Supabase Storage.
// Umgeht das Vercel-Body-Limit (~4,5MB) und zeigt echte Fehlermeldungen.
export async function uploadProjectMediaClient(
  file: File,
  sessionId: string,
  projectId?: string | null
): Promise<ProjectMedia> {
  const supabase = createClient();

  if (!file.type.startsWith('image/')) throw new Error('Nur Bilder erlaubt');
  if (file.size > 10 * 1024 * 1024) throw new Error('Datei zu groß (max. 10MB)');

  const { data: { user } } = await supabase.auth.getUser();

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const storagePath = speicherPfad('fotos', fileName, sessionId, projectId);

  const { error: uploadError } = await supabase.storage
    .from('project-media')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

  const { data: media, error: dbError } = await supabase
    .from('project_media')
    .insert({
      project_id: projectId || null,
      session_id: projectId ? null : sessionId,
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
  sessionId: string,
  projectId?: string | null
): Promise<ProjectMedia> {
  const supabase = createClient();

  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';
  if (!isImage && !isPdf) throw new Error('Nur Bilder (JPG/PNG) oder PDF erlaubt');
  if (file.size > 15 * 1024 * 1024) throw new Error('Datei zu groß (max. 15MB)');

  const { data: { user } } = await supabase.auth.getUser();

  const fileExt = file.name.split('.').pop()?.toLowerCase() || (isPdf ? 'pdf' : 'jpg');
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const storagePath = speicherPfad('grundrisse', fileName, sessionId, projectId);

  const { error: uploadError } = await supabase.storage
    .from('project-media')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

  const { data: media, error: dbError } = await supabase
    .from('project_media')
    .insert({
      project_id: projectId || null,
      session_id: projectId ? null : sessionId,
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

export async function getGrundrisseClient(sessionId: string, projectId?: string | null): Promise<ProjectMedia[]> {
  const supabase = createClient();

  let query = supabase.from('project_media').select('*');
  query = projectId ? query.eq('project_id', projectId) : query.eq('session_id', sessionId).is('project_id', null);

  const { data, error } = await query
    .like('storage_path', '%/grundrisse/%')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Fehler beim Laden: ${error.message}`);
  return (data || []) as ProjectMedia[];
}

export async function getProjectMediaClient(sessionId: string, projectId?: string | null): Promise<ProjectMedia[]> {
  const supabase = createClient();

  let query = supabase.from('project_media').select('*');
  query = projectId ? query.eq('project_id', projectId) : query.eq('session_id', sessionId).is('project_id', null);

  const { data, error } = await query
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
  sessionId: string,
  projectId?: string | null
): Promise<ProjectMedia> {
  const supabase = createClient();

  if (!file.type.startsWith('image/')) throw new Error('Nur Bilder erlaubt (JPG/PNG)');
  if (file.size > 20 * 1024 * 1024) throw new Error('Datei zu groß (max. 20MB)');

  const { data: { user } } = await supabase.auth.getUser();

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const storagePath = speicherPfad('drohnen', fileName, sessionId, projectId);

  const { error: uploadError } = await supabase.storage
    .from('project-media')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

  const { data: media, error: dbError } = await supabase
    .from('project_media')
    .insert({
      project_id: projectId || null,
      session_id: projectId ? null : sessionId,
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

export async function getDrohnenClient(sessionId: string, projectId?: string | null): Promise<ProjectMedia[]> {
  const supabase = createClient();

  let query = supabase.from('project_media').select('*');
  query = projectId ? query.eq('project_id', projectId) : query.eq('session_id', sessionId).is('project_id', null);

  const { data, error } = await query
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

// FIX (Bug-Report: "LiDAR wieder gelöscht" beim Wiederöffnen eines
// bestehenden Projekts): Anders als bei Fotos/Grundrissen/Drohnen (siehe
// getProjectMediaClient/getGrundrisseClient/getDrohnenClient) gab es für
// LiDAR-Scans bisher GAR KEINEN Abruf aus der Datenbank – die Anzeige in
// Schritt 1 kannte nur den Browser-Zwischenspeicher (localStorage) der
// aktuellen Sitzung. Beim erneuten Öffnen eines längst gespeicherten
// Projekts (neuer Browser-Tab/neue Sitzung) war der Scan dadurch scheinbar
// weg, obwohl Datei und Messwerte unverändert in project_media lagen.
// Scans laufen unter zwei Dateityp-Präfixen: "lidar/…" (kleine Scans,
// Direktweg über /api/lidar-upload) und "scan/…" (Großscans über den
// Punktwolken-Worker, siehe uploadScanClient unten) – beide hier
// zusammenfassen, neuester zuerst.
export async function getScanClient(sessionId: string, projectId?: string | null): Promise<ProjectMedia[]> {
  const supabase = createClient();

  let query = supabase.from('project_media').select('*');
  query = projectId ? query.eq('project_id', projectId) : query.eq('session_id', sessionId).is('project_id', null);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) throw new Error(`Fehler beim Laden: ${error.message}`);
  return ((data || []) as ProjectMedia[]).filter(
    (m) => m.file_type.startsWith('lidar/') || m.file_type.startsWith('scan/')
  );
}

// ─── Großscans (NEU: Direkt-Upload + Worker-Warteschlange) ───
// Dateien über dem Vercel-Limit (~4,5MB) gehen direkt vom Browser zu
// Supabase Storage. Der Punktwolken-Worker (Docker, Hetzner) holt sich
// Jobs mit status 'queued', rechnet die Analyse und schreibt das Ergebnis
// in metadata.measurements zurück.
export async function uploadScanClient(
  file: File,
  sessionId: string,
  ext: string,
  projectId?: string | null
): Promise<ProjectMedia> {
  const supabase = createClient();

  if (file.size > 500 * 1024 * 1024) throw new Error('Datei zu groß (max. 500MB)');

  const { data: { user } } = await supabase.auth.getUser();

  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const storagePath = speicherPfad('scans', fileName, sessionId, projectId);

  const { error: uploadError } = await supabase.storage
    .from('project-media')
    .upload(storagePath, file, { contentType: 'application/octet-stream', upsert: false });

  if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

  const { data: media, error: dbError } = await supabase
    .from('project_media')
    .insert({
      project_id: projectId || null,
      session_id: projectId ? null : sessionId,
      file_name: file.name,
      storage_path: storagePath,
      file_type: `scan/${ext}`,
      uploaded_by: user?.id ?? null,
      metadata: { size: file.size, bucket: 'project-media', kind: 'scan', status: 'queued' },
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from('project-media').remove([storagePath]);
    throw new Error(`Datenbank: ${dbError.message}`);
  }

  return media as ProjectMedia;
}

// Status eines Scan-Jobs lesen (für das Polling im Frontend)
export async function getScanStatusClient(
  mediaId: string
): Promise<{ status: string; measurements?: any; fehler?: string }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('project_media')
    .select('metadata')
    .eq('id', mediaId)
    .single();

  if (error) throw new Error(`Status-Abfrage fehlgeschlagen: ${error.message}`);
  const meta = (data?.metadata || {}) as Record<string, any>;
  return { status: meta.status || 'queued', measurements: meta.measurements, fehler: meta.fehler };
}
