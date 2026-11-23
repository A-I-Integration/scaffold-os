-- Phase 128: Aufmaß- und Vorhalte-Zuordnung härten (Faktura F7/F8, Integritätsrunde)
-- Ersetzt aufmass_zuordnen (phase-126) und vorhaltung_zuordnen (phase-127) durch geprüfte Fassungen und ergänzt rechnung_anlegen_zugeordnet.
-- Neu gegenüber 126/127:
--  * abschliessen/ersetzen prüfen, dass die Rechnung existiert, zum selben Projekt gehört und noch nicht einem anderen Zeitraum bzw.
--    Zwischenaufmaß (auch nicht der jeweils anderen Art) zugeordnet ist.
--  * vorhaltung_zuordnen: ungültige Zeiträume werden abgelehnt (Format, von < bis, Intervalle >= 1), neue Aktion 'ersetzen' (neue Version).
--  * rechnung_anlegen_zugeordnet: Rechnung anlegen UND zuordnen in EINER Transaktion – schlägt die Zuordnung fehl, entsteht keine Rechnung.
-- Voraussetzung: phase-126 (Spalte aufmass_version) und die Funktion create_invoice (phase-93). Mehrfach ausführbar.
alter table public.projects add column if not exists aufmass_version integer not null default 0;

create or replace function public.aufmass_zuordnen(
  p_project uuid, p_za_id text, p_aktion text,
  p_erwartet jsonb default null, p_token text default null,
  p_invoice_id text default null, p_invoice_number text default null, p_neu_invoice_id text default null, p_heute text default null
) returns text
language plpgsql
as $$
declare
  d jsonb; arr jsonb; el jsonb; idx integer; n integer; ziel text;
begin
  select data into d from public.projects where id = p_project for update;
  if not found then return 'projekt_fehlt'; end if;
  arr := coalesce(d -> 'zwischenaufmasse', '[]'::jsonb);
  if jsonb_typeof(arr) <> 'array' then return 'nicht_gefunden'; end if;

  if p_aktion in ('freigeben_rechnung', 'ersetzen') then
    select (o - 1)::int, e into idx, el from jsonb_array_elements(arr) with ordinality as t(e, o) where e ->> 'rechnungId' = p_invoice_id limit 1;
  else
    select (o - 1)::int, e into idx, el from jsonb_array_elements(arr) with ordinality as t(e, o) where e ->> 'id' = p_za_id limit 1;
  end if;
  if el is null then return 'nicht_gefunden'; end if;

  -- Zielrechnung (abschliessen: p_invoice_id, ersetzen: p_neu_invoice_id) prüfen
  if p_aktion in ('abschliessen', 'ersetzen') then
    ziel := case when p_aktion = 'abschliessen' then p_invoice_id else p_neu_invoice_id end;
    if ziel is null or not exists (select 1 from public.invoices where id::text = ziel and project_id = p_project) then return 'rechnung_ungueltig'; end if;
    if exists (select 1 from jsonb_array_elements(arr) x where x ->> 'rechnungId' = ziel)
       or exists (select 1 from jsonb_array_elements(coalesce(d -> 'vorhaltePerioden', '[]'::jsonb)) x where x ->> 'rechnungId' = ziel) then
      return 'rechnung_doppelt';
    end if;
  end if;

  if p_aktion = 'reservieren' then
    if el ? 'rechnungId' then return 'bereits_abgerechnet'; end if;
    if el ? 'reserviertAm' and (el ->> 'reserviertAm')::timestamptz > now() - interval '15 minutes' then return 'reserviert'; end if;
    if (el - 'reserviertAm' - 'reserviertToken') is distinct from p_erwartet then return 'geaendert'; end if;
    el := el || jsonb_build_object('reserviertAm', to_jsonb(now()), 'reserviertToken', p_token);
  elsif p_aktion = 'abschliessen' then
    if el ->> 'reserviertToken' is distinct from p_token then return 'keine_reservierung'; end if;
    el := (el - 'reserviertAm' - 'reserviertToken') || jsonb_build_object('rechnungId', p_invoice_id, 'rechnungNr', coalesce(p_invoice_number, ''), 'abgerechnetAm', p_heute);
  elsif p_aktion = 'freigeben' then
    if el ->> 'reserviertToken' is distinct from p_token then return 'keine_reservierung'; end if;
    el := el - 'reserviertAm' - 'reserviertToken';
  elsif p_aktion = 'freigeben_rechnung' then
    el := el - 'rechnungId' - 'rechnungNr' - 'abgerechnetAm';
  elsif p_aktion = 'ersetzen' then
    el := el || jsonb_build_object('rechnungId', p_neu_invoice_id, 'rechnungNr', coalesce(p_invoice_number, ''));
  else
    return 'aktion_unbekannt';
  end if;

  update public.projects
     set data = jsonb_set(d, array['zwischenaufmasse', idx::text], el, false), aufmass_version = aufmass_version + 1
   where id = p_project;
  get diagnostics n = row_count;
  return case when n = 1 then 'ok' else 'fehler' end;
end;
$$;

drop function if exists public.vorhaltung_zuordnen(uuid, text, jsonb, text, text, text, text);
create or replace function public.vorhaltung_zuordnen(
  p_project uuid, p_aktion text,
  p_periode jsonb default null, p_erwartet_bis text default null, p_token text default null,
  p_invoice_id text default null, p_invoice_number text default null, p_neu_invoice_id text default null
) returns text
language plpgsql
as $$
declare
  d jsonb; arr jsonb; neu jsonb := '[]'::jsonb; e jsonb; gefunden boolean := false; maxbis text := null; n integer; ziel text;
begin
  select data into d from public.projects where id = p_project for update;
  if not found then return 'projekt_fehlt'; end if;
  arr := coalesce(d -> 'vorhaltePerioden', '[]'::jsonb);
  if jsonb_typeof(arr) <> 'array' then arr := '[]'::jsonb; end if;

  -- abgelaufene, nie abgeschlossene Reservierungen (älter als 15 Minuten) verfallen; abgeschlossene Zeiträume bleiben unberührt
  for e in select * from jsonb_array_elements(arr) loop
    if e ? 'reserviertAm' and not (e ? 'rechnungId') and (e ->> 'reserviertAm')::timestamptz < now() - interval '15 minutes' then
      continue;
    end if;
    neu := neu || jsonb_build_array(e);
  end loop;
  arr := neu; neu := '[]'::jsonb;

  if p_aktion in ('abschliessen', 'ersetzen') then
    ziel := case when p_aktion = 'abschliessen' then p_invoice_id else p_neu_invoice_id end;
    if ziel is null or not exists (select 1 from public.invoices where id::text = ziel and project_id = p_project) then return 'rechnung_ungueltig'; end if;
    if exists (select 1 from jsonb_array_elements(arr) x where x ->> 'rechnungId' = ziel)
       or exists (select 1 from jsonb_array_elements(coalesce(d -> 'zwischenaufmasse', '[]'::jsonb)) x where x ->> 'rechnungId' = ziel) then
      return 'rechnung_doppelt';
    end if;
  end if;

  if p_aktion = 'reservieren' then
    if p_periode is null or p_token is null
       or coalesce(p_periode ->> 'von', '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_periode ->> 'bis', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or (p_periode ->> 'von') >= (p_periode ->> 'bis')
       or coalesce((p_periode ->> 'intervalle')::numeric, 0) < 1 or coalesce((p_periode ->> 'netto')::numeric, -1) < 0 then
      return 'ungueltig';
    end if;
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
      if e ->> 'id' = p_token and e ? 'reserviertAm' and not (e ? 'rechnungId') then
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
  elsif p_aktion = 'ersetzen' then
    for e in select * from jsonb_array_elements(arr) loop
      if e ->> 'rechnungId' = p_invoice_id then
        gefunden := true;
        e := e || jsonb_build_object('rechnungId', p_neu_invoice_id, 'rechnungNr', coalesce(p_invoice_number, ''));
      end if;
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

-- Rechnung anlegen und dem reservierten Zeitraum bzw. Zwischenaufmaß zuordnen: eine Transaktion.
-- p_art: 'aufmass' (p_za_id nötig) oder 'vorhaltung'. p_params: dieselben Felder wie create_invoice (p_prefix … p_reference_invoice_number).
create or replace function public.rechnung_anlegen_zugeordnet(p_art text, p_za_id text, p_token text, p_params jsonb)
returns invoices
language plpgsql
as $$
declare
  v_row invoices; v_projekt uuid; v_erg text;
begin
  v_projekt := (p_params ->> 'p_project_id')::uuid;
  if v_projekt is null or p_art not in ('aufmass', 'vorhaltung') then raise exception 'zuordnung_ungueltig'; end if;

  v_row := public.create_invoice(
    p_prefix := p_params ->> 'p_prefix',
    p_project_id := v_projekt,
    p_customer_id := nullif(p_params ->> 'p_customer_id', '')::uuid,
    p_customer_name := p_params ->> 'p_customer_name',
    p_customer_address := p_params ->> 'p_customer_address',
    p_positions := p_params -> 'p_positions',
    p_net_amount := (p_params ->> 'p_net_amount')::numeric,
    p_tax_rate := (p_params ->> 'p_tax_rate')::numeric,
    p_tax_amount := (p_params ->> 'p_tax_amount')::numeric,
    p_gross_amount := (p_params ->> 'p_gross_amount')::numeric,
    p_invoice_date := (p_params ->> 'p_invoice_date')::date,
    p_due_date := (p_params ->> 'p_due_date')::date,
    p_notes := p_params ->> 'p_notes',
    p_company_snapshot := nullif(p_params -> 'p_company_snapshot', 'null'::jsonb),
    p_invoice_type := p_params ->> 'p_invoice_type',
    p_reference_invoice_number := p_params ->> 'p_reference_invoice_number'
  );

  if p_art = 'aufmass' then
    v_erg := public.aufmass_zuordnen(v_projekt, p_za_id, 'abschliessen', null, p_token, v_row.id::text, v_row.invoice_number, null, to_char(current_date, 'YYYY-MM-DD'));
  else
    v_erg := public.vorhaltung_zuordnen(v_projekt, 'abschliessen', null, null, p_token, v_row.id::text, v_row.invoice_number, null);
  end if;
  if v_erg <> 'ok' then raise exception 'zuordnung_fehlgeschlagen:%', v_erg; end if;
  return v_row;
end;
$$;

revoke all on function public.aufmass_zuordnen(uuid, text, text, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.aufmass_zuordnen(uuid, text, text, jsonb, text, text, text, text, text) to service_role;
revoke all on function public.vorhaltung_zuordnen(uuid, text, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.vorhaltung_zuordnen(uuid, text, jsonb, text, text, text, text, text) to service_role;
revoke all on function public.rechnung_anlegen_zugeordnet(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.rechnung_anlegen_zugeordnet(text, text, text, jsonb) to service_role;
