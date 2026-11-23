-- Phase 127: Vorhalteabrechnung (Faktura F8) – berechnete Zeiträume atomar führen
-- Die Zeiträume stehen in projects.data.vorhaltePerioden (nur über diese Funktion änderbar, die Speicherroute sperrt sie).
-- reservieren (prüft Überschneidung und den erwarteten Stand) → Rechnung anlegen → abschliessen; bei Fehler freigeben;
-- freigeben_rechnung bei Storno/Löschen. Zeilensperre auf dem Projekt: zwei gleichzeitige Abrechnungen desselben Zeitraums sind unmöglich.
-- Voraussetzung: phase-126 (Spalte aufmass_version). Mehrfach ausführbar.
alter table public.projects add column if not exists aufmass_version integer not null default 0;

create or replace function public.vorhaltung_zuordnen(
  p_project uuid, p_aktion text,
  p_periode jsonb default null, p_erwartet_bis text default null, p_token text default null,
  p_invoice_id text default null, p_invoice_number text default null
) returns text
language plpgsql
as $$
declare
  d jsonb; arr jsonb; neu jsonb := '[]'::jsonb; e jsonb; gefunden boolean := false; maxbis text := null; n integer;
begin
  select data into d from public.projects where id = p_project for update;
  if not found then return 'projekt_fehlt'; end if;
  arr := coalesce(d -> 'vorhaltePerioden', '[]'::jsonb);
  if jsonb_typeof(arr) <> 'array' then arr := '[]'::jsonb; end if;

  -- abgelaufene, nie abgeschlossene Reservierungen (älter als 15 Minuten) verfallen
  for e in select * from jsonb_array_elements(arr) loop
    if e ? 'reserviertAm' and not (e ? 'rechnungId') and (e ->> 'reserviertAm')::timestamptz < now() - interval '15 minutes' then
      continue;
    end if;
    neu := neu || jsonb_build_array(e);
  end loop;
  arr := neu; neu := '[]'::jsonb;

  if p_aktion = 'reservieren' then
    for e in select * from jsonb_array_elements(arr) loop
      if (e ->> 'von') < (p_periode ->> 'bis') and (e ->> 'bis') > (p_periode ->> 'von') then
        return case when e ? 'rechnungId' then 'ueberschneidung' else 'reserviert' end;
      end if;
      if maxbis is null or (e ->> 'bis') > maxbis then maxbis := e ->> 'bis'; end if;
    end loop;
    if maxbis is distinct from p_erwartet_bis then return 'geaendert'; end if;
    arr := arr || jsonb_build_array(p_periode || jsonb_build_object('id', p_token, 'reserviertAm', to_jsonb(now()), 'erstelltAm', to_jsonb(now())));
  elsif p_aktion = 'abschliessen' then
    for e in select * from jsonb_array_elements(arr) loop
      if e ->> 'id' = p_token and e ? 'reserviertAm' then
        gefunden := true;
        e := (e - 'reserviertAm') || jsonb_build_object('rechnungId', p_invoice_id, 'rechnungNr', coalesce(p_invoice_number, ''));
      end if;
      neu := neu || jsonb_build_array(e);
    end loop;
    if not gefunden then return 'keine_reservierung'; end if;
    arr := neu;
  elsif p_aktion = 'freigeben' then
    for e in select * from jsonb_array_elements(arr) loop
      if e ->> 'id' = p_token and e ? 'reserviertAm' and not (e ? 'rechnungId') then gefunden := true; continue; end if;
      neu := neu || jsonb_build_array(e);
    end loop;
    if not gefunden then return 'keine_reservierung'; end if;
    arr := neu;
  elsif p_aktion = 'freigeben_rechnung' then
    for e in select * from jsonb_array_elements(arr) loop
      if e ->> 'rechnungId' = p_invoice_id then gefunden := true; continue; end if;
      neu := neu || jsonb_build_array(e);
    end loop;
    if not gefunden then return 'nicht_gefunden'; end if;
    arr := neu;
  else
    return 'aktion_unbekannt';
  end if;

  update public.projects
     set data = jsonb_set(d, '{vorhaltePerioden}', arr, true), aufmass_version = aufmass_version + 1
   where id = p_project;
  get diagnostics n = row_count;
  return case when n = 1 then 'ok' else 'fehler' end;
end;
$$;

revoke all on function public.vorhaltung_zuordnen(uuid, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.vorhaltung_zuordnen(uuid, text, jsonb, text, text, text, text) to service_role;
