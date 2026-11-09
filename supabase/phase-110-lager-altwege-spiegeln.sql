-- ============================================================
-- SCAFFOLD OS – phase-110: Schreibwege des alten Lagers werden ins neue Lager gespiegelt
-- ============================================================
-- Noch schreiben mehrere Stellen direkt in inventory.quantity und site_stock (Reservieren, Tourabschluss, Rücknahme, Inventur,
-- Nachbestellung, Import, Artikel-Anlage …). Damit das neue Lager (bestand/materialbelege) dabei nicht auseinanderläuft,
-- gleicht ein Trigger nach jeder solchen Änderung den Bestand im neuen Lager auf den neuen Wert ab und schreibt dafür einen Beleg
-- (Zugang: IP, Abgang: IM, Bemerkung "Altweg: …"). Die Summen stimmen damit immer; die Belege der Altwege sind noch grob
-- (ein Reservieren erscheint als Abgang + Zugang). Sie werden sauber (Umlagerung/Anlieferung), sobald ein Schreibweg auf buche_lager() umgestellt wird.
-- Buchungen über buche_lager() setzen einen Schalter, damit sie nicht doppelt gespiegelt werden.
-- Ein Fehler beim Spiegeln blockiert NIE die alte Buchung: er wird als Warnung protokolliert, v_bestand_abgleich zeigt dann die Abweichung.
-- Idempotent.
-- ============================================================

create or replace function public.lager_gleiche_artikel_ab(p_inventory uuid, p_ziel integer, p_hinweis text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ziel integer := greatest(coalesce(p_ziel, 0), 0);
  v_ist integer;
  v_rest integer;
  v_haupt uuid;
  v_pos jsonb := '[]'::jsonb;
  r record;
  v_nimm integer;
begin
  select coalesce(sum(b.menge), 0) into v_ist from public.bestand b join public.lagerorte l on l.id = b.lagerort_id
   where b.inventory_id = p_inventory and b.zustand = 'frei' and l.typ in ('standort', 'lagerbereich', 'lagerplatz');
  if v_ziel = v_ist then return; end if;

  if v_ziel > v_ist then
    select id into v_haupt from public.lagerorte where schluessel = 'HAUPTLAGER';
    perform public.buche_beleg('IP', jsonb_build_array(jsonb_build_object('inventory_id', p_inventory, 'menge', v_ziel - v_ist, 'nach_lagerort', v_haupt, 'nach_zustand', 'frei')),
                               null, null, 'Altweg: ' || p_hinweis);
  else
    v_rest := v_ist - v_ziel;
    for r in select b.lagerort_id, b.menge from public.bestand b join public.lagerorte l on l.id = b.lagerort_id
              where b.inventory_id = p_inventory and b.zustand = 'frei' and b.menge > 0 and l.typ in ('standort', 'lagerbereich', 'lagerplatz')
              order by b.menge desc, b.lagerort_id loop
      exit when v_rest <= 0;
      v_nimm := least(v_rest, r.menge);
      v_pos := v_pos || jsonb_build_object('inventory_id', p_inventory, 'menge', v_nimm, 'von_lagerort', r.lagerort_id, 'von_zustand', 'frei');
      v_rest := v_rest - v_nimm;
    end loop;
    perform public.buche_beleg('IM', v_pos, null, null, 'Altweg: ' || p_hinweis);
  end if;
end $$;

create or replace function public.lager_gleiche_baustelle_ab(p_inventory uuid, p_project uuid, p_hinweis text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_frei integer;
  v_res integer;
  v_ort uuid;
  v_zustand text;
  v_ist integer;
  v_ziel integer;
begin
  if p_inventory is null or p_project is null then return; end if;
  select greatest(coalesce(sum(quantity), 0), 0), greatest(coalesce(sum(reserved_quantity), 0), 0) into v_frei, v_res
    from public.site_stock where inventory_id = p_inventory and project_id = p_project;
  select id into v_ort from public.lagerorte where typ = 'baustelle' and project_id = p_project;
  if v_ort is null then
    if v_frei = 0 and v_res = 0 then return; end if;
    if not exists (select 1 from public.projects where id = p_project) then return; end if;
    v_ort := public.lagerort_fuer_projekt(p_project);
  end if;
  foreach v_zustand in array array['frei', 'reserviert'] loop
    v_ziel := case when v_zustand = 'frei' then v_frei else v_res end;
    select coalesce(menge, 0) into v_ist from public.bestand where inventory_id = p_inventory and lagerort_id = v_ort and zustand = v_zustand;
    v_ist := coalesce(v_ist, 0);
    if v_ziel > v_ist then
      perform public.buche_beleg('IP', jsonb_build_array(jsonb_build_object('inventory_id', p_inventory, 'menge', v_ziel - v_ist, 'nach_lagerort', v_ort, 'nach_zustand', v_zustand)),
                                 null, p_project, 'Altweg: ' || p_hinweis);
    elsif v_ziel < v_ist then
      perform public.buche_beleg('IM', jsonb_build_array(jsonb_build_object('inventory_id', p_inventory, 'menge', v_ist - v_ziel, 'von_lagerort', v_ort, 'von_zustand', v_zustand)),
                                 null, p_project, 'Altweg: ' || p_hinweis);
    end if;
  end loop;
end $$;

create or replace function public.trg_inventory_spiegeln() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('lager.sync', true) = '1' then return null; end if;
  begin
    perform public.lager_gleiche_artikel_ab(new.id, new.quantity, 'inventory.quantity geändert');
  exception when others then
    raise warning 'Lager-Spiegelung (inventory %) fehlgeschlagen: %', new.id, sqlerrm;
  end;
  return null;
end $$;

create or replace function public.trg_site_stock_spiegeln() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('lager.sync', true) = '1' then return null; end if;
  begin
    if tg_op in ('UPDATE', 'DELETE') then
      perform public.lager_gleiche_baustelle_ab(old.inventory_id, old.project_id, 'site_stock geändert');
    end if;
    if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.inventory_id is distinct from old.inventory_id or new.project_id is distinct from old.project_id) then
      perform public.lager_gleiche_baustelle_ab(new.inventory_id, new.project_id, 'site_stock geändert');
    end if;
  exception when others then
    raise warning 'Lager-Spiegelung (site_stock) fehlgeschlagen: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists inventory_spiegeln on public.inventory;
drop trigger if exists inventory_spiegeln_neu on public.inventory;
drop trigger if exists inventory_spiegeln_aenderung on public.inventory;
create trigger inventory_spiegeln_neu after insert on public.inventory
  for each row when (new.quantity > 0) execute function public.trg_inventory_spiegeln();
create trigger inventory_spiegeln_aenderung after update of quantity on public.inventory
  for each row when (new.quantity is distinct from old.quantity) execute function public.trg_inventory_spiegeln();
drop trigger if exists site_stock_spiegeln on public.site_stock;
create trigger site_stock_spiegeln after insert or update of quantity, reserved_quantity, inventory_id, project_id or delete on public.site_stock
  for each row execute function public.trg_site_stock_spiegeln();

-- buche_lager setzt den Schalter, damit die Nachführung der Altfelder nicht zurückgespiegelt wird
create or replace function public.buche_lager(
  p_bewegungsart text, p_positionen jsonb, p_user uuid default null, p_project uuid default null,
  p_bemerkung text default null, p_referenz_typ text default null, p_referenz_id uuid default null, p_storno_von uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_beleg uuid;
  r record;
begin
  v_beleg := public.buche_beleg(p_bewegungsart, p_positionen, p_user, p_project, p_bemerkung, p_referenz_typ, p_referenz_id, p_storno_von);
  perform set_config('lager.sync', '1', true);
  for r in select inventory_id, von_lagerort, von_zustand, nach_lagerort, nach_zustand, menge
           from public.materialbeleg_positionen where beleg_id = v_beleg order by inventory_id, id loop
    if r.von_lagerort is not null then perform public.altfeld_anpassen(r.inventory_id, r.von_lagerort, r.von_zustand, -r.menge); end if;
    if r.nach_lagerort is not null then perform public.altfeld_anpassen(r.inventory_id, r.nach_lagerort, r.nach_zustand, r.menge); end if;
  end loop;
  perform set_config('lager.sync', '', true);
  return v_beleg;
end $$;

revoke all on function public.lager_gleiche_artikel_ab(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.lager_gleiche_baustelle_ab(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.buche_lager(text, jsonb, uuid, uuid, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.buche_lager(text, jsonb, uuid, uuid, text, text, uuid, uuid) to service_role;

insert into public.schema_migrationen (name, bemerkung)
values ('phase-110-lager-altwege-spiegeln', 'Trigger: Schreibwege auf inventory/site_stock werden als Belege ins neue Lager gespiegelt')
on conflict (name) do nothing;
