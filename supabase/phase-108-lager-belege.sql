-- ============================================================
-- SCAFFOLD OS – phase-108: Lager nach Belegprinzip (Lagerorte, Zustände, Bewegungsarten, Materialbelege)
-- ============================================================
-- Zweck: Jede Lagerbewegung ist ein unveränderlicher Beleg mit fester Bewegungsart (angelehnt an das Belegprinzip
-- der SAP-Bestandsführung, angepasst auf Gerüstbau: Mehrwegmaterial, LKW als Lagerort, Zustände, Baustellen als Lagerorte).
-- Der Bestand steht je Artikel, Lagerort und Zustand. Gebucht wird nur über buche_beleg() / storniere_beleg():
-- eine Transaktion, Zeilensperren in fester Reihenfolge, keine negativen Bestände, Storno statt Löschen.
--
-- STUFE 1 (diese Datei): NUR NEUE Tabellen/Funktionen + Übernahme des heutigen Bestands als Anfangsbestand (liest inventory,
-- site_stock, projects; ÄNDERT sie NICHT). Die bisherigen Bildschirme und Buchungswege laufen unverändert weiter.
-- v_bestand_abgleich zeigt Abweichungen zwischen altem und neuem Bestand, solange beide parallel laufen.
-- Idempotent: darf mehrfach laufen (Anfangsbestand wird nur einmal übernommen).
-- ============================================================

-- ---------- Lagerorte (Standort → Bereich → Platz; Fahrzeug; Baustelle; Werkstatt; Sperrlager) ----------

create table if not exists public.lagerorte (
  id           uuid primary key default gen_random_uuid(),
  schluessel   text not null unique,
  name         text not null,
  typ          text not null check (typ in ('standort', 'lagerbereich', 'lagerplatz', 'fahrzeug', 'baustelle', 'werkstatt', 'sperrlager')),
  parent_id    uuid references public.lagerorte(id),
  project_id   uuid references public.projects(id),
  fahrzeug_id  uuid references public.vehicles(id),
  aktiv        boolean not null default true,
  created_at   timestamptz not null default now(),
  check ((typ = 'baustelle') = (project_id is not null)),
  check (typ = 'fahrzeug' or fahrzeug_id is null)
);
create unique index if not exists lagerorte_baustelle_eindeutig on public.lagerorte (project_id) where typ = 'baustelle';
create unique index if not exists lagerorte_fahrzeug_eindeutig on public.lagerorte (fahrzeug_id) where fahrzeug_id is not null;
create index if not exists lagerorte_parent_idx on public.lagerorte (parent_id);

-- ---------- Bewegungsarten ----------

create table if not exists public.bewegungsarten (
  code            text primary key,
  name            text not null,
  braucht_von     boolean not null,
  braucht_nach    boolean not null,
  lagerort_regel  text not null default 'egal' check (lagerort_regel in ('egal', 'gleich', 'verschieden')),
  zustand_regel   text not null default 'egal' check (zustand_regel in ('egal', 'gleich', 'verschieden')),
  nur_intern      boolean not null default false,
  sortierung      integer not null default 0,
  aktiv           boolean not null default true
);

insert into public.bewegungsarten (code, name, braucht_von, braucht_nach, lagerort_regel, zustand_regel, nur_intern, sortierung) values
  ('AB', 'Anfangsbestand',                    false, true,  'egal',        'egal',        false, 10),
  ('WE', 'Wareneingang',                      false, true,  'egal',        'egal',        false, 20),
  ('AU', 'Ausgabe an Baustelle (Zuteilung)',  true,  true,  'verschieden', 'egal',        false, 30),
  ('AN', 'Anlieferung auf Baustelle',         true,  true,  'egal',        'egal',        false, 40),
  ('RN', 'Rücknahme von Baustelle',           true,  true,  'verschieden', 'egal',        false, 50),
  ('UL', 'Umlagerung',                        true,  true,  'verschieden', 'gleich',      false, 60),
  ('ZW', 'Zustandswechsel',                   true,  true,  'gleich',      'verschieden', false, 70),
  ('VL', 'Verlust / Ausbuchung',              true,  false, 'egal',        'egal',        false, 80),
  ('IP', 'Inventurdifferenz Mehrbestand',     false, true,  'egal',        'egal',        false, 90),
  ('IM', 'Inventurdifferenz Fehlbestand',     true,  false, 'egal',        'egal',        false, 100),
  ('ST', 'Storno',                            true,  true,  'egal',        'egal',        true,  110)
on conflict (code) do nothing;

-- ---------- Bestand je Artikel, Lagerort und Zustand ----------

create table if not exists public.bestand (
  id            uuid primary key default gen_random_uuid(),
  inventory_id  uuid not null references public.inventory(id),
  lagerort_id   uuid not null references public.lagerorte(id),
  zustand       text not null check (zustand in ('frei', 'reserviert', 'gesperrt', 'in_pruefung', 'defekt', 'reparatur')),
  menge         integer not null default 0 check (menge >= 0),
  updated_at    timestamptz not null default now(),
  unique (inventory_id, lagerort_id, zustand)
);
create index if not exists bestand_lagerort_idx on public.bestand (lagerort_id);

-- ---------- Belege (unveränderlich) ----------

create sequence if not exists public.materialbeleg_nr_seq;

create table if not exists public.materialbelege (
  id            uuid primary key default gen_random_uuid(),
  belegnummer   text not null unique,
  bewegungsart  text not null references public.bewegungsarten(code),
  gebucht_am    timestamptz not null default now(),
  gebucht_von   uuid,
  project_id    uuid references public.projects(id),
  referenz_typ  text,
  referenz_id   uuid,
  bemerkung     text,
  storno_von    uuid references public.materialbelege(id)
);
-- ein Beleg kann nur einmal storniert werden
create unique index if not exists materialbelege_ein_storno on public.materialbelege (storno_von) where storno_von is not null;
create index if not exists materialbelege_projekt_idx on public.materialbelege (project_id, gebucht_am desc);
create index if not exists materialbelege_referenz_idx on public.materialbelege (referenz_typ, referenz_id);

create table if not exists public.materialbeleg_positionen (
  id             uuid primary key default gen_random_uuid(),
  beleg_id       uuid not null references public.materialbelege(id),
  inventory_id   uuid not null references public.inventory(id),
  menge          integer not null check (menge > 0),
  von_lagerort   uuid references public.lagerorte(id),
  von_zustand    text,
  nach_lagerort  uuid references public.lagerorte(id),
  nach_zustand   text,
  bemerkung      text
);
create index if not exists beleg_positionen_beleg_idx on public.materialbeleg_positionen (beleg_id);
create index if not exists beleg_positionen_artikel_idx on public.materialbeleg_positionen (inventory_id);

create or replace function public.beleg_unveraenderlich() returns trigger language plpgsql as $$
begin
  raise exception 'Materialbelege sind unveränderlich. Fehlbuchungen werden storniert (storniere_beleg), nicht geändert oder gelöscht.';
end $$;

drop trigger if exists materialbelege_schutz on public.materialbelege;
create trigger materialbelege_schutz before update or delete on public.materialbelege
  for each row execute function public.beleg_unveraenderlich();
drop trigger if exists materialbeleg_positionen_schutz on public.materialbeleg_positionen;
create trigger materialbeleg_positionen_schutz before update or delete on public.materialbeleg_positionen
  for each row execute function public.beleg_unveraenderlich();

-- ---------- Lagerort einer Baustelle (bei Bedarf anlegen) ----------

create or replace function public.lagerort_fuer_projekt(p_project uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_name text;
begin
  select id into v_id from public.lagerorte where typ = 'baustelle' and project_id = p_project;
  if v_id is not null then return v_id; end if;
  select coalesce(name, p_project::text) into v_name from public.projects where id = p_project;
  if not found then raise exception 'Projekt % nicht gefunden.', p_project; end if;
  insert into public.lagerorte (schluessel, name, typ, project_id)
  values ('BST-' || p_project::text, 'Baustelle ' || v_name, 'baustelle', p_project)
  on conflict do nothing;
  select id into v_id from public.lagerorte where typ = 'baustelle' and project_id = p_project;
  return v_id;
end $$;

-- ---------- Buchen ----------
-- p_positionen: [{ "inventory_id", "menge", "von_lagerort", "von_zustand", "nach_lagerort", "nach_zustand", "bemerkung" }]
-- Zustand ohne Angabe = 'frei'. Alles in einer Transaktion; bei jedem Fehler wird nichts gebucht.

create or replace function public.buche_beleg(
  p_bewegungsart text, p_positionen jsonb, p_user uuid default null, p_project uuid default null,
  p_bemerkung text default null, p_referenz_typ text default null, p_referenz_id uuid default null, p_storno_von uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_art public.bewegungsarten%rowtype;
  v_beleg uuid;
  v_nr text;
  p record;
  v_menge integer;
  v_haben integer;
begin
  select * into v_art from public.bewegungsarten where code = p_bewegungsart and aktiv;
  if not found then raise exception 'Unbekannte Bewegungsart: %', p_bewegungsart; end if;
  if v_art.nur_intern and p_storno_von is null then raise exception 'Die Bewegungsart % ist nur über storniere_beleg() möglich.', p_bewegungsart; end if;
  if p_positionen is null or jsonb_typeof(p_positionen) <> 'array' or jsonb_array_length(p_positionen) = 0 then
    raise exception 'Ein Beleg braucht mindestens eine Position.';
  end if;

  -- Positionen prüfen und in eine Arbeitstabelle legen
  create temporary table if not exists _pos (
    nr integer, inventory_id uuid, menge integer, von_lagerort uuid, von_zustand text, nach_lagerort uuid, nach_zustand text, bemerkung text
  ) on commit drop;
  delete from _pos;
  insert into _pos
  select ordinality::integer,
         (e->>'inventory_id')::uuid, (e->>'menge')::integer,
         nullif(e->>'von_lagerort', '')::uuid, case when nullif(e->>'von_lagerort', '') is null then null else coalesce(nullif(e->>'von_zustand', ''), 'frei') end,
         nullif(e->>'nach_lagerort', '')::uuid, case when nullif(e->>'nach_lagerort', '') is null then null else coalesce(nullif(e->>'nach_zustand', ''), 'frei') end,
         e->>'bemerkung'
  from jsonb_array_elements(p_positionen) with ordinality as t(e, ordinality);

  for p in select * from _pos order by nr loop
    if p.inventory_id is null or p.menge is null or p.menge <= 0 then
      raise exception 'Position %: Artikel und eine Menge größer 0 sind Pflicht.', p.nr;
    end if;
    if v_art.braucht_von and p.von_lagerort is null then raise exception 'Position %: Quell-Lagerort fehlt.', p.nr; end if;
    if not v_art.braucht_von and p.von_lagerort is not null then raise exception 'Position %: % hat keinen Quell-Lagerort.', p.nr, v_art.name; end if;
    if v_art.braucht_nach and p.nach_lagerort is null then raise exception 'Position %: Ziel-Lagerort fehlt.', p.nr; end if;
    if not v_art.braucht_nach and p.nach_lagerort is not null then raise exception 'Position %: % hat keinen Ziel-Lagerort.', p.nr, v_art.name; end if;
    if v_art.lagerort_regel = 'gleich' and p.von_lagerort is distinct from p.nach_lagerort then raise exception 'Position %: Quelle und Ziel müssen derselbe Lagerort sein.', p.nr; end if;
    if v_art.lagerort_regel = 'verschieden' and p.von_lagerort = p.nach_lagerort then raise exception 'Position %: Quelle und Ziel müssen verschiedene Lagerorte sein.', p.nr; end if;
    if v_art.zustand_regel = 'gleich' and p.von_zustand is distinct from p.nach_zustand then raise exception 'Position %: Der Zustand darf sich bei % nicht ändern.', p.nr, v_art.name; end if;
    if v_art.zustand_regel = 'verschieden' and p.von_zustand = p.nach_zustand then raise exception 'Position %: Der Zustand muss sich ändern.', p.nr; end if;
    if p.von_lagerort is not null and not exists (select 1 from public.lagerorte where id = p.von_lagerort and aktiv) then raise exception 'Position %: Quell-Lagerort unbekannt oder gesperrt.', p.nr; end if;
    if p.nach_lagerort is not null and not exists (select 1 from public.lagerorte where id = p.nach_lagerort and aktiv) then raise exception 'Position %: Ziel-Lagerort unbekannt oder gesperrt.', p.nr; end if;
  end loop;

  v_nr := 'MB-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.materialbeleg_nr_seq')::text, 6, '0');
  insert into public.materialbelege (belegnummer, bewegungsart, gebucht_von, project_id, referenz_typ, referenz_id, bemerkung, storno_von)
  values (v_nr, p_bewegungsart, p_user, p_project, p_referenz_typ, p_referenz_id, p_bemerkung, p_storno_von)
  returning id into v_beleg;

  -- 1. Abgänge in fester Reihenfolge (verhindert Verklemmungen zwischen gleichzeitigen Buchungen)
  for p in select inventory_id, von_lagerort, von_zustand, sum(menge)::integer as menge from _pos
           where von_lagerort is not null group by 1, 2, 3 order by 1, 2, 3 loop
    select menge into v_haben from public.bestand
      where inventory_id = p.inventory_id and lagerort_id = p.von_lagerort and zustand = p.von_zustand for update;
    if v_haben is null or v_haben < p.menge then
      raise exception 'Nicht genug Bestand: Artikel %, Lagerort %, Zustand %: vorhanden %, benötigt %.',
        (select sku from public.inventory where id = p.inventory_id), (select schluessel from public.lagerorte where id = p.von_lagerort),
        p.von_zustand, coalesce(v_haben, 0), p.menge using errcode = 'check_violation';
    end if;
    update public.bestand set menge = menge - p.menge, updated_at = now()
      where inventory_id = p.inventory_id and lagerort_id = p.von_lagerort and zustand = p.von_zustand;
  end loop;

  -- 2. Zugänge
  for p in select inventory_id, nach_lagerort, nach_zustand, sum(menge)::integer as menge from _pos
           where nach_lagerort is not null group by 1, 2, 3 order by 1, 2, 3 loop
    insert into public.bestand (inventory_id, lagerort_id, zustand, menge)
    values (p.inventory_id, p.nach_lagerort, p.nach_zustand, p.menge)
    on conflict (inventory_id, lagerort_id, zustand) do update set menge = public.bestand.menge + excluded.menge, updated_at = now();
  end loop;

  insert into public.materialbeleg_positionen (beleg_id, inventory_id, menge, von_lagerort, von_zustand, nach_lagerort, nach_zustand, bemerkung)
  select v_beleg, inventory_id, menge, von_lagerort, von_zustand, nach_lagerort, nach_zustand, bemerkung from _pos order by nr;

  return v_beleg;
end $$;

-- ---------- Stornieren ----------

create or replace function public.storniere_beleg(p_beleg uuid, p_user uuid default null, p_grund text default null) returns uuid
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
  return public.buche_beleg('ST', v_pos, p_user, v_orig.project_id, coalesce(p_grund, 'Storno von ' || v_orig.belegnummer), v_orig.referenz_typ, v_orig.referenz_id, p_beleg);
end $$;

revoke all on function public.buche_beleg(text, jsonb, uuid, uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.storniere_beleg(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.lagerort_fuer_projekt(uuid) from public, anon, authenticated;
grant execute on function public.buche_beleg(text, jsonb, uuid, uuid, text, text, uuid, uuid) to service_role;
grant execute on function public.storniere_beleg(uuid, uuid, text) to service_role;
grant execute on function public.lagerort_fuer_projekt(uuid) to service_role;

-- ---------- Grundlagerorte ----------

insert into public.lagerorte (schluessel, name, typ) values ('HAUPTLAGER', 'Hauptlager', 'standort') on conflict (schluessel) do nothing;
insert into public.lagerorte (schluessel, name, typ, parent_id)
  select 'SPERRLAGER', 'Sperrlager', 'sperrlager', id from public.lagerorte where schluessel = 'HAUPTLAGER' on conflict (schluessel) do nothing;
insert into public.lagerorte (schluessel, name, typ, parent_id)
  select 'WERKSTATT', 'Werkstatt', 'werkstatt', id from public.lagerorte where schluessel = 'HAUPTLAGER' on conflict (schluessel) do nothing;

-- ---------- Anfangsbestand aus dem heutigen Lager (liest nur; ändert inventory/site_stock nicht) ----------
-- Altes Lager (inventory.quantity)  → Hauptlager / frei
-- site_stock.quantity               → Lagerort der Baustelle / frei
-- site_stock.reserved_quantity      → Lagerort der Baustelle / reserviert (= zugeteilt, noch nicht angeliefert)

do $$
declare
  v_haupt uuid;
  v_pos jsonb := '[]'::jsonb;
  r record;
  v_ort uuid;
  v_negativ integer;
begin
  if exists (select 1 from public.materialbelege where bewegungsart = 'AB') then
    raise notice 'Anfangsbestand wurde bereits übernommen – übersprungen.';
    return;
  end if;
  select id into v_haupt from public.lagerorte where schluessel = 'HAUPTLAGER';

  select count(*) into v_negativ from public.inventory where quantity < 0;
  if v_negativ > 0 then raise notice '% Artikel mit negativem Bestand im alten Lager werden NICHT übernommen (bitte prüfen).', v_negativ; end if;

  for r in select id, quantity from public.inventory where quantity > 0 loop
    v_pos := v_pos || jsonb_build_object('inventory_id', r.id, 'menge', r.quantity, 'nach_lagerort', v_haupt, 'nach_zustand', 'frei');
  end loop;

  for r in select s.inventory_id, s.project_id, s.quantity, s.reserved_quantity from public.site_stock s
           join public.projects p on p.id = s.project_id where s.quantity > 0 or s.reserved_quantity > 0 loop
    v_ort := public.lagerort_fuer_projekt(r.project_id);
    if r.quantity > 0 then
      v_pos := v_pos || jsonb_build_object('inventory_id', r.inventory_id, 'menge', r.quantity, 'nach_lagerort', v_ort, 'nach_zustand', 'frei');
    end if;
    if r.reserved_quantity > 0 then
      v_pos := v_pos || jsonb_build_object('inventory_id', r.inventory_id, 'menge', r.reserved_quantity, 'nach_lagerort', v_ort, 'nach_zustand', 'reserviert');
    end if;
  end loop;

  if jsonb_array_length(v_pos) > 0 then
    perform public.buche_beleg('AB', v_pos, null, null, 'Anfangsbestand aus dem bisherigen Lager (phase-108)');
  end if;
end $$;

-- ---------- Abgleich altes ↔ neues Lager (zum Beobachten, solange beide parallel laufen) ----------

create or replace view public.v_bestand_abgleich as
with lager as (
  select b.inventory_id, sum(b.menge) filter (where l.typ in ('standort', 'lagerbereich', 'lagerplatz') and b.zustand = 'frei') as neu_lager_frei
  from public.bestand b join public.lagerorte l on l.id = b.lagerort_id group by b.inventory_id
),
-- site_stock kann je Artikel+Projekt mehrere Zeilen haben (kein Unique-Schlüssel) → zusammenzählen
baustelle as (
  select inventory_id, project_id, sum(quantity)::integer as quantity, sum(reserved_quantity)::integer as reserved_quantity
  from public.site_stock group by inventory_id, project_id
)
select 'lager'::text as bereich, i.id as inventory_id, i.sku, null::uuid as project_id,
       i.quantity as alt_menge, coalesce(lager.neu_lager_frei, 0)::integer as neu_menge,
       i.quantity - coalesce(lager.neu_lager_frei, 0)::integer as differenz
from public.inventory i left join lager on lager.inventory_id = i.id
where i.quantity <> coalesce(lager.neu_lager_frei, 0)
union all
select 'baustelle_frei', s.inventory_id, i.sku, s.project_id, s.quantity,
       coalesce(b.menge, 0), s.quantity - coalesce(b.menge, 0)
from baustelle s join public.inventory i on i.id = s.inventory_id
left join public.lagerorte l on l.typ = 'baustelle' and l.project_id = s.project_id
left join public.bestand b on b.inventory_id = s.inventory_id and b.lagerort_id = l.id and b.zustand = 'frei'
where s.quantity <> coalesce(b.menge, 0)
union all
select 'baustelle_reserviert', s.inventory_id, i.sku, s.project_id, s.reserved_quantity,
       coalesce(b.menge, 0), s.reserved_quantity - coalesce(b.menge, 0)
from baustelle s join public.inventory i on i.id = s.inventory_id
left join public.lagerorte l on l.typ = 'baustelle' and l.project_id = s.project_id
left join public.bestand b on b.inventory_id = s.inventory_id and b.lagerort_id = l.id and b.zustand = 'reserviert'
where s.reserved_quantity <> coalesce(b.menge, 0);

-- ---------- Row Level Security: Lesen für Lager-Rollen, Schreiben nur über die Buchungsfunktionen (Server) ----------

alter table public.lagerorte enable row level security;
alter table public.bewegungsarten enable row level security;
alter table public.bestand enable row level security;
alter table public.materialbelege enable row level security;
alter table public.materialbeleg_positionen enable row level security;

do $$
declare t text;
begin
  foreach t in array array['lagerorte', 'bewegungsarten', 'bestand', 'materialbelege', 'materialbeleg_positionen'] loop
    execute format('drop policy if exists %I on public.%I', t || '_lesen', t);
    execute format($p$create policy %I on public.%I for select using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = any (array['admin','disponent','bauleiter','lager'])))$p$, t || '_lesen', t);
  end loop;
end $$;

insert into public.schema_migrationen (name, bemerkung)
values ('phase-108-lager-belege', 'Lagerorte, Zustände, Bewegungsarten, Materialbelege; Anfangsbestand übernommen (Stufe 1, alte Tabellen unverändert)')
on conflict (name) do nothing;
