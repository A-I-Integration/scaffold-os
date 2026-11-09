-- ============================================================
-- SCAFFOLD OS – phase-109: Neue Lagerbuchungen führen das alte Lager (inventory / site_stock) mit
-- ============================================================
-- Solange die alten Bildschirme noch inventory.quantity und site_stock lesen, muss jede Buchung über das neue Lager
-- diese Felder mitführen, sonst laufen beide auseinander. buche_lager() bucht den Beleg (buche_beleg) und führt die
-- Altfelder in DERSELBEN Transaktion um genau die gebuchten Mengen nach:
--   Lager (Standort/Bereich/Platz) + frei   → inventory.quantity
--   Baustelle + frei                        → site_stock.quantity
--   Baustelle + reserviert                  → site_stock.reserved_quantity
--   alles andere (Werkstatt, Sperrlager, Fahrzeug, defekt, gesperrt …) hat im alten Lager keine Entsprechung:
--   es zählt dort nicht mehr als verfügbar.
-- Die Altfelder sind nur noch ein Abbild: der Bestand im neuen Lager gilt. Mehrere site_stock-Zeilen je Artikel+Projekt
-- werden von vorn nach hinten aufgefüllt/abgebaut; die Altfelder gehen dabei nie unter 0.
-- Idempotent.
-- ============================================================

create or replace function public.altfeld_anpassen(p_inventory uuid, p_lagerort uuid, p_zustand text, p_delta integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_typ text;
  v_projekt uuid;
  v_spalte text;
  r record;
  v_rest integer;
  v_abzug integer;
begin
  if p_delta = 0 then return; end if;
  select typ, project_id into v_typ, v_projekt from public.lagerorte where id = p_lagerort;

  if v_typ in ('standort', 'lagerbereich', 'lagerplatz') and p_zustand = 'frei' then
    update public.inventory set quantity = greatest(0, quantity + p_delta) where id = p_inventory;
    return;
  end if;

  if v_typ = 'baustelle' and p_zustand in ('frei', 'reserviert') then
    v_spalte := case when p_zustand = 'frei' then 'quantity' else 'reserved_quantity' end;
    if p_delta > 0 then
      select id into r from public.site_stock where inventory_id = p_inventory and project_id = v_projekt order by created_at nulls last, id limit 1;
      if r.id is null then
        insert into public.site_stock (inventory_id, project_id, quantity, reserved_quantity)
        values (p_inventory, v_projekt, case when v_spalte = 'quantity' then p_delta else 0 end, case when v_spalte = 'reserved_quantity' then p_delta else 0 end);
      else
        execute format('update public.site_stock set %I = %I + $1 where id = $2', v_spalte, v_spalte) using p_delta, r.id;
      end if;
    else
      v_rest := -p_delta;
      for r in select id from public.site_stock where inventory_id = p_inventory and project_id = v_projekt order by created_at nulls last, id loop
        exit when v_rest <= 0;
        execute format('select least(%I, $1) from public.site_stock where id = $2', v_spalte) into v_abzug using v_rest, r.id;
        v_abzug := greatest(coalesce(v_abzug, 0), 0);
        if v_abzug > 0 then
          execute format('update public.site_stock set %I = %I - $1 where id = $2', v_spalte, v_spalte) using v_abzug, r.id;
          v_rest := v_rest - v_abzug;
        end if;
      end loop;
    end if;
  end if;
end $$;

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
  for r in select inventory_id, von_lagerort, von_zustand, nach_lagerort, nach_zustand, menge
           from public.materialbeleg_positionen where beleg_id = v_beleg order by inventory_id, id loop
    if r.von_lagerort is not null then perform public.altfeld_anpassen(r.inventory_id, r.von_lagerort, r.von_zustand, -r.menge); end if;
    if r.nach_lagerort is not null then perform public.altfeld_anpassen(r.inventory_id, r.nach_lagerort, r.nach_zustand, r.menge); end if;
  end loop;
  return v_beleg;
end $$;

create or replace function public.storniere_lager(p_beleg uuid, p_user uuid default null, p_grund text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_orig public.materialbelege%rowtype;
  v_pos jsonb;
begin
  select * into v_orig from public.materialbelege where id = p_beleg;
  if not found then raise exception 'Beleg nicht gefunden.'; end if;
  if v_orig.storno_von is not null then raise exception 'Ein Storno-Beleg kann nicht storniert werden.'; end if;
  if exists (select 1 from public.materialbelege where storno_von = p_beleg) then raise exception 'Beleg % ist bereits storniert.', v_orig.belegnummer; end if;
  select jsonb_agg(jsonb_build_object('inventory_id', inventory_id, 'menge', menge,
           'von_lagerort', nach_lagerort, 'von_zustand', nach_zustand, 'nach_lagerort', von_lagerort, 'nach_zustand', von_zustand))
    into v_pos from public.materialbeleg_positionen where beleg_id = p_beleg;
  return public.buche_lager('ST', v_pos, p_user, v_orig.project_id, coalesce(p_grund, 'Storno von ' || v_orig.belegnummer), v_orig.referenz_typ, v_orig.referenz_id, p_beleg);
end $$;

revoke all on function public.altfeld_anpassen(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.buche_lager(text, jsonb, uuid, uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.storniere_lager(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.buche_lager(text, jsonb, uuid, uuid, text, text, uuid, uuid) to service_role;
grant execute on function public.storniere_lager(uuid, uuid, text) to service_role;

insert into public.schema_migrationen (name, bemerkung)
values ('phase-109-lager-altbestand-nachfuehren', 'buche_lager/storniere_lager: Buchung + Altfelder (inventory, site_stock) in einer Transaktion')
on conflict (name) do nothing;
