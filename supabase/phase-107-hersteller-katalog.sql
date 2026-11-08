-- ============================================================
-- SCAFFOLD OS – phase-107: Herstellerdatenbank (Katalog) und Messdaten-Trennung für SCAFFOLD WM
-- ============================================================
-- Zweck: Herstellerübergreifende Artikel- und Materialdatenbank (Layher, SCAFOM-RUX, MJ-Gerüst, weitere ohne Umbau)
-- als Referenzdaten. Tatsächlich gemessene Gewichte aus dem Wiegesystem (SCAFFOLD WM) stehen in einer EIGENEN Tabelle
-- (gewicht_messungen); die Katalogtabellen werden von Messdaten nie überschrieben.
--
-- Auswirkung auf Bestehendes: legt nur NEUE Tabellen an und fügt EINE neue, leere, optionale Spalte
-- inventory.katalog_artikel_id hinzu. Lagerbestände, SKU, Baustellenbestände (site_stock) und Bewegungsprotokolle
-- (inventory_transactions) werden NICHT verändert. Idempotent: darf mehrfach laufen.
--
-- Schutzregeln in der Datenbank (nicht nur in der Oberfläche):
--  * Original-Artikelnummer, Hersteller, System, Dokument und Rohwerte (attribute_roh) sind unveränderlich.
--  * Artikel werden nie gelöscht (kein Löschrecht, Verlauf verweist darauf) – stattdessen aktiv = false.
--  * Freigabe von Gewichten nur durch einen Benutzer mit Rolle admin, nur nach Prüfung (pruefstatus = geprueft)
--    und nur mit geklärter Gewichtsart.
--  * Wird ein freigegebenes Gewicht oder dessen Art geändert, fällt die Freigabe automatisch weg.
--  * Jede Änderung wird in katalog_artikel_historie protokolliert.
-- ============================================================

-- ---------- Stammdaten ----------

create table if not exists public.hersteller (
  id          uuid primary key default gen_random_uuid(),
  schluessel  text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.geruestsysteme (
  id            uuid primary key default gen_random_uuid(),
  hersteller_id uuid not null references public.hersteller(id),
  schluessel    text not null,
  name          text not null,
  zulassungen   jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  unique (hersteller_id, schluessel)
);

create table if not exists public.material_kategorien (
  id         uuid primary key default gen_random_uuid(),
  schluessel text not null unique,
  name       text not null,
  parent_id  uuid references public.material_kategorien(id),
  sortierung integer not null default 0
);

create table if not exists public.katalog_dokumente (
  id            uuid primary key default gen_random_uuid(),
  hersteller_id uuid not null references public.hersteller(id),
  system_id     uuid references public.geruestsysteme(id),
  dateiname     text not null,
  sha256        text not null unique,
  seiten        integer,
  version       text,
  version_quelle text check (version_quelle in ('dokument', 'dateiname', 'code')),
  stand         text,
  created_at    timestamptz not null default now()
);

-- ---------- Import-Protokoll ----------

create table if not exists public.import_laeufe (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  art           text not null check (art in ('bestand', 'csv', 'excel', 'pdf')),
  status        text not null default 'trockenlauf' check (status in ('trockenlauf', 'abgeschlossen', 'abgebrochen')),
  hersteller_id uuid references public.hersteller(id),
  dateiname     text,
  sha256        text,
  angelegt_von  uuid,
  gesamt        integer not null default 0,
  neu           integer not null default 0,
  dubletten     integer not null default 0,
  fehler        integer not null default 0,
  unsicher      integer not null default 0,
  protokoll     jsonb not null default '{}'::jsonb
);

-- ---------- Artikel ----------

create table if not exists public.katalog_artikel (
  -- id = eindeutige Material-ID (Schlüssel für SCAFFOLD WM, Lager-Verknüpfung und Stückliste)
  id                       uuid primary key default gen_random_uuid(),
  hersteller_id            uuid not null references public.hersteller(id),
  system_id                uuid references public.geruestsysteme(id),
  dokument_id              uuid references public.katalog_dokumente(id),
  import_lauf_id           uuid references public.import_laeufe(id),

  -- Artikelnummer: Original unverändert (inklusive Suffix), Basis und Suffix getrennt, normalisiert zum Suchen
  artikelnummer_original   text not null,
  artikelnummer_basis      text not null,
  artikelnummer_suffix     text,
  artikelnummer_normalisiert text not null,

  bezeichnung              text,
  gruppe_original          text,
  kategorie_id             uuid references public.material_kategorien(id),
  kategorie_sicherheit     text not null default 'unbekannt' check (kategorie_sicherheit in ('sicher', 'unsicher', 'unbekannt')),
  systemart                text not null default 'systemkomponente' check (systemart in ('systemkomponente', 'systemfreies_zubehoer')),

  laenge_m                 numeric(10,3),
  breite_m                 numeric(10,3),
  hoehe_m                  numeric(10,3),
  durchmesser_mm           numeric(10,2),
  material                 text,

  -- Referenzgewicht laut Herstellerdokument. Gemessene Ist-Gewichte stehen NUR in gewicht_messungen.
  gewicht_referenz_kg      numeric(10,3) check (gewicht_referenz_kg is null or gewicht_referenz_kg > 0),
  gewichtsart              text not null default 'herstellerangabe_unklar'
                           check (gewichtsart in ('ca', 'nenn', 'ist', 'herstellerangabe_unklar')),
  mengeneinheit            text not null default 'Stk',
  listenpreis_netto        numeric(12,2),

  -- Alle Originalwerte der Quelle, unverändert (Schlüssel und Werte wie im Dokument)
  attribute_roh            jsonb not null default '{}'::jsonb,

  quelle_seiten            integer[],
  quelle_seite_status      text not null default 'unbekannt'
                           check (quelle_seite_status in ('eindeutig', 'mehrere', 'nicht_gefunden', 'unbekannt')),

  pruefstatus              text not null default 'ungeprueft' check (pruefstatus in ('ungeprueft', 'in_pruefung', 'geprueft', 'abgelehnt')),
  freigabestatus           text not null default 'nicht_freigegeben' check (freigabestatus in ('nicht_freigegeben', 'freigegeben')),
  freigegeben_von          uuid,
  freigegeben_am           timestamptz,
  aktiv                    boolean not null default true,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid
);

-- Eindeutigkeit: Hersteller + System + Original-Artikelnummer (inkl. Suffix) + Dokument.
-- Dieselbe Nummer in einem anderen System oder Dokument ist ein EIGENER Eintrag (Gewichte können abweichen).
create unique index if not exists katalog_artikel_eindeutig on public.katalog_artikel (
  hersteller_id,
  coalesce(system_id, '00000000-0000-0000-0000-000000000000'::uuid),
  artikelnummer_original,
  coalesce(dokument_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index if not exists katalog_artikel_nr_basis_idx on public.katalog_artikel (artikelnummer_basis);
create index if not exists katalog_artikel_nr_norm_idx on public.katalog_artikel (artikelnummer_normalisiert);
create index if not exists katalog_artikel_system_idx on public.katalog_artikel (hersteller_id, system_id);
create index if not exists katalog_artikel_kategorie_idx on public.katalog_artikel (kategorie_id);
create index if not exists katalog_artikel_status_idx on public.katalog_artikel (pruefstatus, freigabestatus);
create index if not exists katalog_artikel_suche_idx on public.katalog_artikel
  using gin (to_tsvector('german', coalesce(bezeichnung, '') || ' ' || coalesce(gruppe_original, '')));

create table if not exists public.import_zeilen (
  id                 uuid primary key default gen_random_uuid(),
  import_lauf_id     uuid not null references public.import_laeufe(id),
  zeile              integer not null,
  roh                jsonb not null,
  ergebnis           text not null check (ergebnis in ('neu', 'dublette', 'fehler', 'unsicher')),
  meldungen          jsonb not null default '[]'::jsonb,
  katalog_artikel_id uuid references public.katalog_artikel(id)
);
create index if not exists import_zeilen_lauf_idx on public.import_zeilen (import_lauf_id, ergebnis);

-- Verlauf (Audit). Verweist mit RESTRICT auf den Artikel: ein Artikel mit Verlauf kann nicht gelöscht werden.
create table if not exists public.katalog_artikel_historie (
  id             uuid primary key default gen_random_uuid(),
  artikel_id     uuid not null references public.katalog_artikel(id) on delete restrict,
  geaendert_am   timestamptz not null default now(),
  geaendert_von  uuid,
  aktion         text not null check (aktion in ('angelegt', 'geaendert', 'freigegeben', 'freigabe_entzogen')),
  vorher         jsonb,
  nachher        jsonb
);
create index if not exists katalog_historie_artikel_idx on public.katalog_artikel_historie (artikel_id, geaendert_am desc);

-- ---------- SCAFFOLD WM: Messdaten, getrennt von den Referenzdaten ----------
-- Nur anhängen (kein Update-Recht für normale Benutzer). Die Material-ID ist katalog_artikel.id.

create table if not exists public.gewicht_messungen (
  id                         uuid primary key default gen_random_uuid(),
  material_id                uuid not null references public.katalog_artikel(id),
  inventory_id               uuid references public.inventory(id),
  messart                    text not null check (messart in ('einzelteil', 'gestell', 'lkw')),
  gewicht_ist_kg             numeric(12,3) not null check (gewicht_ist_kg > 0),
  stueckzahl                 integer check (stueckzahl is null or stueckzahl > 0),
  mehrdeutig                 boolean not null default false,
  gestell_id                 text,
  lkw_id                     text,
  lagerort                   text,
  project_id                 uuid references public.projects(id),
  gemessen_am                timestamptz not null default now(),
  quelle                     text,
  -- Erst nach Prüfung durch einen Admin dürfen Messwerte in produktive Berechnungen
  freigegeben_fuer_berechnung boolean not null default false,
  created_by                 uuid
);
create index if not exists gewicht_messungen_material_idx on public.gewicht_messungen (material_id, gemessen_am desc);
create index if not exists gewicht_messungen_projekt_idx on public.gewicht_messungen (project_id);

-- ---------- Verbindung zum bestehenden Lager (neue, leere, optionale Spalte; ändert keine Daten) ----------

alter table public.inventory add column if not exists katalog_artikel_id uuid references public.katalog_artikel(id);
create index if not exists inventory_katalog_artikel_idx on public.inventory (katalog_artikel_id) where katalog_artikel_id is not null;

-- ---------- Schutzregeln und Verlauf ----------

create or replace function public.katalog_artikel_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rolle text;
begin
  if tg_op = 'INSERT' then
    if new.freigabestatus <> 'nicht_freigegeben' then
      raise exception 'Neue Katalogartikel müssen als nicht freigegeben angelegt werden.';
    end if;
    return new;
  end if;

  -- Originalwerte sind unveränderlich
  if new.hersteller_id is distinct from old.hersteller_id
     or new.system_id is distinct from old.system_id
     or new.dokument_id is distinct from old.dokument_id
     or new.artikelnummer_original is distinct from old.artikelnummer_original
     or new.attribute_roh is distinct from old.attribute_roh then
    raise exception 'Hersteller, System, Dokument, Original-Artikelnummer und Rohwerte sind unveränderlich.';
  end if;

  -- Freigabe: nur Admin, nur nach Prüfung, nur mit geklärter Gewichtsart
  if new.freigabestatus = 'freigegeben' and old.freigabestatus is distinct from 'freigegeben' then
    select role into v_rolle from public.profiles where id = new.freigegeben_von;
    if v_rolle is distinct from 'admin' then
      raise exception 'Gewichte dürfen nur von einem Admin freigegeben werden.';
    end if;
    if new.pruefstatus <> 'geprueft' then
      raise exception 'Freigabe nur für geprüfte Artikel.';
    end if;
    if new.gewicht_referenz_kg is not null and new.gewichtsart = 'herstellerangabe_unklar' then
      raise exception 'Bitte zuerst die Gewichtsart klären (ca., nenn).';
    end if;
    new.freigegeben_am := now();
  end if;

  -- Wird ein freigegebenes Gewicht (oder seine Art) geändert, fällt die Freigabe weg
  if old.freigabestatus = 'freigegeben' and new.freigabestatus = 'freigegeben'
     and (new.gewicht_referenz_kg is distinct from old.gewicht_referenz_kg or new.gewichtsart is distinct from old.gewichtsart) then
    new.freigabestatus := 'nicht_freigegeben';
    new.freigegeben_von := null;
    new.freigegeben_am := null;
    new.pruefstatus := 'ungeprueft';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists katalog_artikel_schutz_trg on public.katalog_artikel;
create trigger katalog_artikel_schutz_trg before insert or update on public.katalog_artikel
  for each row execute function public.katalog_artikel_schutz();

create or replace function public.katalog_artikel_verlauf() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_aktion text;
begin
  if tg_op = 'INSERT' then
    insert into public.katalog_artikel_historie (artikel_id, geaendert_von, aktion, vorher, nachher)
    values (new.id, coalesce(auth.uid(), new.created_by), 'angelegt', null, to_jsonb(new));
    return new;
  end if;
  v_aktion := case
    when new.freigabestatus = 'freigegeben' and old.freigabestatus <> 'freigegeben' then 'freigegeben'
    when new.freigabestatus <> 'freigegeben' and old.freigabestatus = 'freigegeben' then 'freigabe_entzogen'
    else 'geaendert' end;
  if to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
    insert into public.katalog_artikel_historie (artikel_id, geaendert_von, aktion, vorher, nachher)
    values (new.id, coalesce(auth.uid(), new.freigegeben_von), v_aktion, to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end $$;

drop trigger if exists katalog_artikel_verlauf_trg on public.katalog_artikel;
create trigger katalog_artikel_verlauf_trg after insert or update on public.katalog_artikel
  for each row execute function public.katalog_artikel_verlauf();

-- ---------- Row Level Security ----------
-- Lesen: admin, disponent, bauleiter, lager. Schreiben: admin, disponent. Löschen: niemand.
-- Der Server (Service-Rolle) umgeht RLS; dort prüfen die API-Routen die Rolle, die Schutzregeln oben gelten trotzdem.

alter table public.hersteller enable row level security;
alter table public.geruestsysteme enable row level security;
alter table public.material_kategorien enable row level security;
alter table public.katalog_dokumente enable row level security;
alter table public.katalog_artikel enable row level security;
alter table public.katalog_artikel_historie enable row level security;
alter table public.import_laeufe enable row level security;
alter table public.import_zeilen enable row level security;
alter table public.gewicht_messungen enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['hersteller', 'geruestsysteme', 'material_kategorien', 'katalog_dokumente', 'katalog_artikel'] loop
    execute format('drop policy if exists %I on public.%I', t || '_lesen', t);
    execute format($p$create policy %I on public.%I for select using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = any (array['admin','disponent','bauleiter','lager'])))$p$, t || '_lesen', t);
    execute format('drop policy if exists %I on public.%I', t || '_anlegen', t);
    execute format($p$create policy %I on public.%I for insert with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = any (array['admin','disponent'])))$p$, t || '_anlegen', t);
    execute format('drop policy if exists %I on public.%I', t || '_aendern', t);
    execute format($p$create policy %I on public.%I for update using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = any (array['admin','disponent'])))$p$, t || '_aendern', t);
  end loop;
  foreach t in array array['katalog_artikel_historie', 'import_laeufe', 'import_zeilen'] loop
    execute format('drop policy if exists %I on public.%I', t || '_lesen', t);
    execute format($p$create policy %I on public.%I for select using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = any (array['admin','disponent'])))$p$, t || '_lesen', t);
  end loop;
  foreach t in array array['import_laeufe', 'import_zeilen'] loop
    execute format('drop policy if exists %I on public.%I', t || '_anlegen', t);
    execute format($p$create policy %I on public.%I for insert with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = any (array['admin','disponent'])))$p$, t || '_anlegen', t);
  end loop;
end $$;

-- Messdaten: alle Lager-Rollen dürfen Messungen anlegen und lesen; nur ein Admin darf die Freigabe für Berechnungen setzen.
drop policy if exists gewicht_messungen_lesen on public.gewicht_messungen;
create policy gewicht_messungen_lesen on public.gewicht_messungen for select using (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = any (array['admin','disponent','bauleiter','lager'])));
drop policy if exists gewicht_messungen_anlegen on public.gewicht_messungen;
create policy gewicht_messungen_anlegen on public.gewicht_messungen for insert with check (
  freigegeben_fuer_berechnung = false
  and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = any (array['admin','disponent','bauleiter','lager'])));
drop policy if exists gewicht_messungen_freigeben on public.gewicht_messungen;
create policy gewicht_messungen_freigeben on public.gewicht_messungen for update using (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- ---------- Referenzdaten: Materialkategorien (Struktur laut Auftrag, keine Messwerte) ----------

insert into public.material_kategorien (schluessel, name, sortierung) values
  ('systemgeruest', 'Systemgerüst', 10),
  ('kupplungen', 'Kupplungen', 110),
  ('schutzsysteme', 'Schutzsysteme', 130),
  ('zubehoer', 'Zubehör', 140),
  ('transportmaterial', 'Transportmaterial', 150),
  ('psa', 'Persönliche Schutzausrüstung', 160),
  ('sonstige', 'Sonstige Materialien', 170)
on conflict (schluessel) do nothing;

insert into public.material_kategorien (schluessel, name, parent_id, sortierung)
select u.schluessel, u.name, p.id, u.sortierung
from (values
  ('vertikalrahmen', 'Vertikalrahmen', 20), ('horizontalriegel', 'Horizontalriegel', 30), ('diagonalen', 'Diagonalen', 40),
  ('belaege', 'Beläge', 50), ('konsolen', 'Konsolen', 60), ('spindeln', 'Spindeln', 70),
  ('gelaender', 'Geländer', 80), ('treppen', 'Treppen', 90)
) as u(schluessel, name, sortierung)
join public.material_kategorien p on p.schluessel = 'systemgeruest'
on conflict (schluessel) do nothing;

insert into public.hersteller (schluessel, name) values
  ('layher', 'Layher'), ('scafom-rux', 'SCAFOM-RUX'), ('mj-geruest', 'MJ-Gerüst')
on conflict (schluessel) do nothing;

insert into public.schema_migrationen (name, bemerkung)
values ('phase-107-hersteller-katalog', 'Herstellerdatenbank, Import-Protokoll, Messdaten-Trennung (WM)')
on conflict (name) do nothing;
