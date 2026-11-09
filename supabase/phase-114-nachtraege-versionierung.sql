-- Phase 114: Nachträge ohne Überschreiben (gleichzeitiges Speichern)
-- Bisher: Browser liest alle Nachträge, ändert, schreibt die ganze Liste zurück. Zwei Personen gleichzeitig → eine Änderung geht verloren.
-- Jetzt: der Server liest die Liste samt Versionsnummer, ändert und schreibt NUR dann, wenn die Version noch stimmt
-- (sonst neu lesen und nochmal). Geschrieben wird ausschließlich der Schlüssel "nachtraege" – übrige Projektdaten bleiben unberührt.
-- Die Nachträge liegen weiter in projects.data.nachtraege, alle Lese-Stellen bleiben unverändert. Mehrfach ausführbar.
alter table public.projects add column if not exists nachtraege_version integer not null default 0;

create or replace function public.nachtraege_setzen(p_project uuid, p_erwartet integer, p_neu jsonb)
returns boolean
language plpgsql
as $$
declare
  n integer;
begin
  update public.projects
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{nachtraege}', coalesce(p_neu, '[]'::jsonb), true),
         nachtraege_version = nachtraege_version + 1
   where id = p_project and nachtraege_version = p_erwartet;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

revoke all on function public.nachtraege_setzen(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.nachtraege_setzen(uuid, integer, jsonb) to service_role;
