-- Phase 118: Projektnummer eines CAD-Projekts wird bei der ersten externen Verwendung dauerhaft gesperrt.
-- Voraussetzung: phase-117-cad-projekt-stammdaten.sql ist ausgeführt. Im Supabase SQL Editor ausführen, BEVOR der neue Code live geht.
-- Mehrfach ausführbar. Verändert keine bestehenden Projektnummern.
--
-- Regeln (alle in der Datenbank, nicht in der Oberfläche):
--  * Externe Verwendung = Angebot versendet oder als Link bereitgestellt, Rechnung versendet oder zur Prüfung bereitgestellt, Mahnung versendet,
--    Auftragsstand-Link bereitgestellt. Ein intern gespeicherter Entwurf oder eine PDF-Vorschau sperrt nicht.
--  * Die Anwendung ruft cad_projektnummer_extern_verwenden() VOR dem Versand bzw. der Bereitstellung auf. Die Funktion sperrt in einer Transaktion
--    (Zeilensperre, kein Wettlauf) und legt die erste Verwendung fest. Schlägt sie fehl, wird nichts versendet.
--  * Eine gesperrte Projektnummer lässt sich nicht mehr ändern (Trigger). Die Sperre selbst lässt sich nie wieder aufheben.
--  * Korrektur nur über cad_projektnummer_korrigieren() mit Begründung (mind. 10 Zeichen); sie wird vollständig protokolliert.
--    Bereits erzeugte Dokumente bleiben unverändert, weil die Nummer zum Zeitpunkt der Verwendung in cad_projektnummer_verwendung steht.
--  * Die Protokolle cad_projektnummer_log und cad_projektnummer_verwendung sind unveränderbar (kein Ändern, Löschen, Leeren) und hängen nicht mehr
--    per Fremdschlüssel am Projekt, damit sie auch beim Löschen des Projekts erhalten bleiben.

alter table public.cad_projekte add column if not exists projektnummer_gesperrt_am timestamptz;

-- Protokoll: Art und Begründung ergänzen, Fremdschlüssel entfernen (Protokoll überlebt das Projekt)
alter table public.cad_projektnummer_log add column if not exists art text not null default 'aenderung';
alter table public.cad_projektnummer_log add column if not exists grund text;
alter table public.cad_projektnummer_log alter column neu drop not null;
alter table public.cad_projektnummer_log drop constraint if exists cad_projektnummer_log_cad_projekt_id_fkey;
do $$ begin
  alter table public.cad_projektnummer_log add constraint cad_projektnummer_log_art_check check (art in ('aenderung','sperre','korrektur'));
exception when duplicate_object then null; end $$;

-- Erste externe Verwendung (genau eine Zeile je CAD-Projekt)
create table if not exists public.cad_projektnummer_verwendung (
  id uuid primary key default gen_random_uuid(),
  cad_projekt_id uuid not null unique,
  projektnummer text not null,
  dokumenttyp text not null check (dokumenttyp in ('angebot','angebot_link','auftragsbestaetigung','rechnung','rechnung_pruefung','mahnung','auftragsstand_link','sonstiges')),
  dokument_id text,
  verwendet_von uuid,
  created_at timestamptz not null default now()
);
alter table public.cad_projektnummer_verwendung enable row level security;

-- Unveränderbar: kein Ändern, Löschen oder Leeren, auch nicht mit dem Service-Schlüssel
create or replace function public.cad_protokoll_unveraenderbar() returns trigger language plpgsql as $$
begin
  raise exception 'protokoll_unveraenderbar: % auf % ist nicht erlaubt', tg_op, tg_table_name using errcode = 'P0001';
end $$;
drop trigger if exists trg_cad_log_unveraenderbar on public.cad_projektnummer_log;
create trigger trg_cad_log_unveraenderbar before update or delete on public.cad_projektnummer_log for each row execute function public.cad_protokoll_unveraenderbar();
drop trigger if exists trg_cad_log_leeren on public.cad_projektnummer_log;
create trigger trg_cad_log_leeren before truncate on public.cad_projektnummer_log for each statement execute function public.cad_protokoll_unveraenderbar();
drop trigger if exists trg_cad_verwendung_unveraenderbar on public.cad_projektnummer_verwendung;
create trigger trg_cad_verwendung_unveraenderbar before update or delete on public.cad_projektnummer_verwendung for each row execute function public.cad_protokoll_unveraenderbar();
drop trigger if exists trg_cad_verwendung_leeren on public.cad_projektnummer_verwendung;
create trigger trg_cad_verwendung_leeren before truncate on public.cad_projektnummer_verwendung for each statement execute function public.cad_protokoll_unveraenderbar();

-- Sperre durchsetzen: gesperrte Nummer nicht änderbar (außer im Korrekturprozess), Sperre nie aufhebbar
create or replace function public.cad_projektnummer_sperre_pruefen() returns trigger language plpgsql as $$
begin
  if old.projektnummer_gesperrt_am is not null and new.projektnummer_gesperrt_am is distinct from old.projektnummer_gesperrt_am then
    raise exception 'sperre_nicht_aufhebbar: Die Sperre der Projektnummer kann nicht aufgehoben werden.' using errcode = 'P0001';
  end if;
  if old.projektnummer_gesperrt_am is not null and new.projektnummer is distinct from old.projektnummer
     and coalesce(current_setting('scaffold.projektnummer_korrektur', true), '') <> 'ja' then
    raise exception 'projektnummer_gesperrt: Die Projektnummer wurde bereits in einem externen Dokument verwendet.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_cad_projektnummer_sperre on public.cad_projekte;
create trigger trg_cad_projektnummer_sperre before update on public.cad_projekte for each row execute function public.cad_projektnummer_sperre_pruefen();

-- Änderungsprotokoll: im Korrekturprozess schreibt die Korrektur-Funktion selbst (mit Begründung)
create or replace function public.cad_projektnummer_protokoll() returns trigger language plpgsql as $$
begin
  if old.projektnummer is distinct from new.projektnummer and coalesce(current_setting('scaffold.projektnummer_korrektur', true), '') <> 'ja' then
    insert into public.cad_projektnummer_log (cad_projekt_id, art, alt, neu, geaendert_von) values (new.id, 'aenderung', old.projektnummer, new.projektnummer, new.geaendert_von);
  end if;
  return new;
end $$;

-- Vor jedem externen Versand bzw. jeder Bereitstellung aufrufen. Gibt zurück, wie viele Projektnummern dabei neu gesperrt wurden.
create or replace function public.cad_projektnummer_extern_verwenden(p_project_id uuid, p_typ text, p_dokument_id text, p_user uuid)
returns integer language plpgsql as $$
declare r record; n integer := 0;
begin
  for r in select id, projektnummer from public.cad_projekte where project_id = p_project_id and projektnummer_gesperrt_am is null for update loop
    update public.cad_projekte set projektnummer_gesperrt_am = now() where id = r.id;
    insert into public.cad_projektnummer_verwendung (cad_projekt_id, projektnummer, dokumenttyp, dokument_id, verwendet_von) values (r.id, r.projektnummer, p_typ, p_dokument_id, p_user);
    insert into public.cad_projektnummer_log (cad_projekt_id, art, alt, neu, geaendert_von) values (r.id, 'sperre', r.projektnummer, r.projektnummer, p_user);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Gesonderter Korrekturprozess für eine bereits gesperrte Nummer (nur über die Admin-Route der Anwendung)
create or replace function public.cad_projektnummer_korrigieren(p_cad_projekt_id uuid, p_neu text, p_grund text, p_user uuid)
returns text language plpgsql as $$
declare r record;
begin
  if p_grund is null or char_length(btrim(p_grund)) < 10 then
    raise exception 'grund_fehlt: Bitte eine Begründung mit mindestens 10 Zeichen angeben.' using errcode = 'P0001';
  end if;
  select id, projektnummer, projektnummer_gesperrt_am into r from public.cad_projekte where id = p_cad_projekt_id for update;
  if not found then raise exception 'nicht_gefunden: Projekt nicht gefunden.' using errcode = 'P0001'; end if;
  if r.projektnummer_gesperrt_am is null then raise exception 'nicht_gesperrt: Die Projektnummer ist nicht gesperrt und kann normal geändert werden.' using errcode = 'P0001'; end if;
  perform set_config('scaffold.projektnummer_korrektur', 'ja', true);
  update public.cad_projekte set projektnummer = btrim(p_neu), geaendert_von = p_user, updated_at = now() where id = p_cad_projekt_id;
  insert into public.cad_projektnummer_log (cad_projekt_id, art, alt, neu, grund, geaendert_von) values (p_cad_projekt_id, 'korrektur', r.projektnummer, btrim(p_neu), btrim(p_grund), p_user);
  perform set_config('scaffold.projektnummer_korrektur', '', true);
  return btrim(p_neu);
end $$;

-- Nur der Server (Service-Rolle) darf die Funktionen aufrufen
revoke all on function public.cad_projektnummer_extern_verwenden(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.cad_projektnummer_korrigieren(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.cad_projektnummer_extern_verwenden(uuid, text, text, uuid) to service_role;
grant execute on function public.cad_projektnummer_korrigieren(uuid, text, text, uuid) to service_role;

-- Ein Projekt mit extern verwendeter Projektnummer wird nicht gelöscht (die Nummer steht auf ausgegebenen Dokumenten); stattdessen archivieren.
create or replace function public.cad_projekt_loeschen_pruefen() returns trigger language plpgsql as $$
begin
  if old.projektnummer_gesperrt_am is not null then
    raise exception 'projekt_gesperrt_loeschen: Die Projektnummer wurde extern verwendet. Das Projekt kann nicht gelöscht werden, bitte archivieren.' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists trg_cad_projekt_loeschen on public.cad_projekte;
create trigger trg_cad_projekt_loeschen before delete on public.cad_projekte for each row execute function public.cad_projekt_loeschen_pruefen();
