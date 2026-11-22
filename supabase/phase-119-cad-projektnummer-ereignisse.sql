-- Phase 119: Projektnummer-Sperre nur bei tatsächlicher Verwendung im Dokument, jede externe Verwendung als eigenes Ereignis.
-- Voraussetzung: phase-117 und phase-118 sind ausgeführt.
--
--  * cad_projektnummer_verwendung ist jetzt das Ereignisprotokoll: EIN Eintrag je externer Verwendung (nicht mehr nur der erste).
--    Die erste Verwendung ist der älteste Eintrag mit ereignis = 'verwendung'.
--  * Gesperrt wird nur, wenn die Anwendung die Projektnummer meldet, die tatsächlich im Dokument steht. Weicht sie von der aktuellen
--    Nummer des Projekts ab (z. B. weil sie nach dem Erzeugen des Dokuments geändert wurde), wird nichts gesperrt und der Versand abgelehnt.
--  * Schlägt der Versand nach der Sperre fehl, wird das als eigenes Ereignis 'versand_fehlgeschlagen' festgehalten. Die Sperre bleibt bestehen
--    (keine automatische Freigabe); eine Aufhebung geht nur über die Admin-Korrektur.
--  * Die Bereitstellung von Links (Angebot-Link, Auftragsstand, Rechnungs-Prüflink) sperrt nicht, solange deren Seiten die Projektnummer nicht anzeigen.

alter table public.cad_projektnummer_verwendung drop constraint if exists cad_projektnummer_verwendung_cad_projekt_id_key;
alter table public.cad_projektnummer_verwendung add column if not exists ereignis text not null default 'verwendung';
alter table public.cad_projektnummer_verwendung add column if not exists bezug_id uuid;
alter table public.cad_projektnummer_verwendung add column if not exists fehler text;
do $$ begin
  alter table public.cad_projektnummer_verwendung add constraint cad_projektnummer_verwendung_ereignis_check check (ereignis in ('verwendung','versand_fehlgeschlagen'));
exception when duplicate_object then null; end $$;
create index if not exists idx_cad_projektnummer_verwendung_projekt on public.cad_projektnummer_verwendung (cad_projekt_id, created_at);

-- Vor jedem externen Versand aufrufen, mit der Projektnummer, die im Dokument steht. Gibt die Ereignis-ID zurück (null = nichts zu sperren:
-- keine Nummer gemeldet oder kein CAD-Projekt mit dem Kundenprojekt verknüpft).
drop function if exists public.cad_projektnummer_extern_verwenden(uuid, text, text, uuid);
create or replace function public.cad_projektnummer_extern_verwenden(p_project_id uuid, p_typ text, p_dokument_id text, p_user uuid, p_projektnummer text)
returns uuid language plpgsql as $$
declare r record; v_id uuid; v_anzahl integer; v_nr text := btrim(coalesce(p_projektnummer, ''));
begin
  if v_nr = '' then return null; end if;
  select id, projektnummer, projektnummer_gesperrt_am into r from public.cad_projekte where project_id = p_project_id and projektnummer = v_nr for update;
  if not found then
    select count(*) into v_anzahl from public.cad_projekte where project_id = p_project_id;
    if v_anzahl > 0 then
      raise exception 'projektnummer_abweichend: Die Projektnummer im Dokument stimmt nicht mehr mit dem Projekt überein.' using errcode = 'P0001';
    end if;
    return null;
  end if;
  if r.projektnummer_gesperrt_am is null then
    update public.cad_projekte set projektnummer_gesperrt_am = now() where id = r.id;
    insert into public.cad_projektnummer_log (cad_projekt_id, art, alt, neu, geaendert_von) values (r.id, 'sperre', r.projektnummer, r.projektnummer, p_user);
  end if;
  insert into public.cad_projektnummer_verwendung (cad_projekt_id, projektnummer, dokumenttyp, dokument_id, verwendet_von, ereignis)
    values (r.id, r.projektnummer, p_typ, p_dokument_id, p_user, 'verwendung') returning id into v_id;
  return v_id;
end $$;

-- Versand nach erfolgter Sperre fehlgeschlagen: als eigenes Ereignis festhalten (Sperre bleibt).
create or replace function public.cad_projektnummer_versand_fehlgeschlagen(p_ereignis_id uuid, p_fehler text)
returns uuid language plpgsql as $$
declare r record; v_id uuid;
begin
  select * into r from public.cad_projektnummer_verwendung where id = p_ereignis_id and ereignis = 'verwendung';
  if not found then return null; end if;
  insert into public.cad_projektnummer_verwendung (cad_projekt_id, projektnummer, dokumenttyp, dokument_id, verwendet_von, ereignis, bezug_id, fehler)
    values (r.cad_projekt_id, r.projektnummer, r.dokumenttyp, r.dokument_id, r.verwendet_von, 'versand_fehlgeschlagen', r.id, left(coalesce(p_fehler, 'unbekannt'), 500))
    returning id into v_id;
  return v_id;
end $$;

revoke all on function public.cad_projektnummer_extern_verwenden(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.cad_projektnummer_versand_fehlgeschlagen(uuid, text) from public, anon, authenticated;
grant execute on function public.cad_projektnummer_extern_verwenden(uuid, text, text, uuid, text) to service_role;
grant execute on function public.cad_projektnummer_versand_fehlgeschlagen(uuid, text) to service_role;
