-- Phase 8: Storage-Bucket "project-media" für Aufmaß-Fotos & LiDAR-Scans
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar)

-- 1) Bucket anlegen bzw. auf "public" setzen
--    (public nötig, damit hochgeladene Fotos per URL im Browser angezeigt werden)
insert into storage.buckets (id, name, public)
values ('project-media', 'project-media', true)
on conflict (id) do update set public = true;

-- 2) Zugriffsrechte: eingeloggte Nutzer (admin, bauleiter, ...) dürfen
--    Dateien in diesem Bucket lesen, hochladen, überschreiben und löschen
drop policy if exists "project_media_select" on storage.objects;
create policy "project_media_select"
on storage.objects for select to authenticated
using (bucket_id = 'project-media');

drop policy if exists "project_media_insert" on storage.objects;
create policy "project_media_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'project-media');

drop policy if exists "project_media_update" on storage.objects;
create policy "project_media_update"
on storage.objects for update to authenticated
using (bucket_id = 'project-media');

drop policy if exists "project_media_delete" on storage.objects;
create policy "project_media_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'project-media');

-- 3) Tabelle project_media: Fotos werden jetzt direkt vom Browser hochgeladen,
--    deshalb brauchen eingeloggte Nutzer auch hier Lese-/Schreibrechte.
--    (Service Role umgeht RLS weiterhin automatisch – API-Routen bleiben unverändert.)
alter table project_media enable row level security;

drop policy if exists "project_media_table_select" on project_media;
create policy "project_media_table_select"
on project_media for select to authenticated
using (true);

drop policy if exists "project_media_table_insert" on project_media;
create policy "project_media_table_insert"
on project_media for insert to authenticated
with check (true);

drop policy if exists "project_media_table_update" on project_media;
create policy "project_media_table_update"
on project_media for update to authenticated
using (true);

drop policy if exists "project_media_table_delete" on project_media;
create policy "project_media_table_delete"
on project_media for delete to authenticated
using (true);
