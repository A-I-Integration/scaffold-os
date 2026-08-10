-- Phase 9: project_media.project_id darf leer sein
-- Grund: Fotos/LiDAR werden während des Aufmaßes hochgeladen, BEVOR das Projekt
-- existiert. Die Verknüpfung erfolgt später (Schritt 6) über session_id -> project_id.
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen.

alter table project_media alter column project_id drop not null;
