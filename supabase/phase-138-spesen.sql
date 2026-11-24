-- Phase 138: Spesen-Automatik (Tarif Gerüstbauer-Handwerk und steuerliche Pauschalen, getrennt und mit Gültig-ab versioniert)
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar)
--
-- Zugriff nur über die API-Routen (Service Role Key): Chef und Disposition. RLS aktiv, bewusst ohne Policy.

-- 1) Sätze mit Gültigkeit. Neue Fassungen werden als neue Zeile mit neuem Gültig-ab eingetragen, alte bleiben erhalten.
create table if not exists spesen_saetze (
  id uuid primary key default gen_random_uuid(),
  regelwerk text not null check (regelwerk in ('tarif','steuer','betrieb')),
  schluessel text not null,
  wert numeric(10,2) not null check (wert >= 0),
  gueltig_ab date not null,
  bemerkung text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (regelwerk, schluessel, gueltig_ab)
);
alter table spesen_saetze enable row level security;

-- 2) Spesen je Mitarbeiter und Tag
create table if not exists spesen_tage (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  work_date date not null,
  einsatzart text not null default 'heimfahrt' check (einsatzart in ('heimfahrt','auswaerts_voll','auswaerts_anreise','auswaerts_abreise')),
  fruehstueck boolean not null default false,
  mittag boolean not null default false,
  abend boolean not null default false,
  abwesenheit_stunden numeric(5,2),
  vorschlag_tarif numeric(8,2) not null default 0,
  vorschlag_steuer numeric(8,2) not null default 0,
  betrag_manuell numeric(8,2) check (betrag_manuell is null or betrag_manuell >= 0),
  begruendung text,
  notiz text,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);
alter table spesen_tage enable row level security;
create index if not exists idx_spesen_tage_datum on spesen_tage(work_date);

-- 3) Ausgangssätze (RTV Gerüstbauer-Handwerk vom 27.02.2020, § 7; steuerliche Verpflegungspauschalen Inland).
--    Bitte gegen den aktuell geltenden Tarif prüfen und bei Änderung eine neue Zeile mit neuem Gültig-ab anlegen.
insert into spesen_saetze (regelwerk, schluessel, wert, gueltig_ab, bemerkung) values
  ('tarif','verpflegung_heimfahrt', 3.50, '2021-04-01', '§ 7 Nr. 3.2: je Arbeitstag, wenn mehr als die Schwelle abwesend und keine Auslösung'),
  ('tarif','verpflegung_schwelle_stunden', 10, '2021-04-01', '§ 7 Nr. 3.2: mehr als 10 Stunden Abwesenheit'),
  ('tarif','ausloesung_voll', 24, '2021-04-01', '§ 7 Nr. 4.2.2: je voller Kalendertag'),
  ('tarif','ausloesung_an_abreise', 12, '2021-04-01', '§ 7 Nr. 4.2.2: am An- und am Abreisetag'),
  ('steuer','pauschale_ueber_8h', 14, '2021-04-01', 'Verpflegungspauschale: mehr als 8 Stunden Abwesenheit'),
  ('steuer','pauschale_schwelle_stunden', 8, '2021-04-01', 'Schwelle in Stunden'),
  ('steuer','pauschale_24h', 28, '2021-04-01', 'Verpflegungspauschale: 24 Stunden Abwesenheit'),
  ('steuer','pauschale_an_abreise', 14, '2021-04-01', 'Verpflegungspauschale: An- und Abreisetag mit Übernachtung'),
  ('steuer','kuerzung_fruehstueck_prozent', 20, '2021-04-01', 'Kürzung von der 24-h-Pauschale, wenn Frühstück gestellt wird'),
  ('steuer','kuerzung_mittag_prozent', 40, '2021-04-01', 'Kürzung von der 24-h-Pauschale, wenn Mittagessen gestellt wird'),
  ('steuer','kuerzung_abend_prozent', 40, '2021-04-01', 'Kürzung von der 24-h-Pauschale, wenn Abendessen gestellt wird'),
  ('betrieb','auszahlung_monate_versatz', 1, '2021-04-01', 'Auszahlung mit der Lohnabrechnung des Folgemonats (0 = gleicher Monat)')
on conflict (regelwerk, schluessel, gueltig_ab) do nothing;
