-- Phase 126: Aufmaß-Abrechnung gegen Doppelabrechnung und gleichzeitiges Überschreiben absichern (Faktura F7-Sicherung)
-- 1) aufmass_version: zählt jede Änderung an der Aufmaß-Zuordnung. Ein veralteter Schreibzugriff auf projects.data (z. B. Autosave
--    während einer Rechnungsstellung) greift ins Leere, statt die Reservierung oder Abrechnung zu überschreiben.
-- 2) aufmass_zuordnen: ändert genau EIN Zwischenaufmaß in projects.data.zwischenaufmasse unter Zeilensperre (FOR UPDATE).
--    reservieren → (Rechnung anlegen) → abschliessen; bei Fehler freigeben. freigeben_rechnung / ersetzen bei Storno bzw. neuer Version.
-- Mehrfach ausführbar.
alter table public.projects add column if not exists aufmass_version integer not null default 0;

create or replace function public.aufmass_zuordnen(
  p_project uuid, p_za_id text, p_aktion text,
  p_erwartet jsonb default null, p_token text default null,
  p_invoice_id text default null, p_invoice_number text default null, p_neu_invoice_id text default null, p_heute text default null
) returns text
language plpgsql
as $$
declare
  d jsonb; arr jsonb; el jsonb; idx integer; n integer;
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
     set data = jsonb_set(d, array['zwischenaufmasse', idx::text], el, false),
         aufmass_version = aufmass_version + 1
   where id = p_project;
  get diagnostics n = row_count;
  return case when n = 1 then 'ok' else 'fehler' end;
end;
$$;

revoke all on function public.aufmass_zuordnen(uuid, text, text, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.aufmass_zuordnen(uuid, text, text, jsonb, text, text, text, text, text) to service_role;
