-- Phase 121: Kunden mit festem Preis und Fahrt nach Kilometern.
-- Voraussetzung: Phase 120 ist ausgeführt.
--
--  * customers.preis_modus: 'standard' (Kalkulation wie bisher), 'festpreis_m2' (fester Preis je m² Gerüstfläche),
--    'festpreis_pauschale' (fester Gesamtbetrag je Auftrag).
--  * customers.fahrt_nach_km: Fahrt wird zusätzlich zum festen Preis nach Kilometern abgerechnet.
--  * customers.fahrt_satz_pro_km: eigener Satz je km für diesen Kunden; leer = Firmensatz (company_settings.calc_km_satz).
--  * Die Werte sind Vorbelegungen: im Angebot bleibt alles je Auftrag änderbar. Bestehende Kunden bleiben 'standard'.

alter table public.customers add column if not exists preis_modus text not null default 'standard';
alter table public.customers add column if not exists festpreis_m2 numeric(10,2);
alter table public.customers add column if not exists festpreis_pauschale numeric(12,2);
alter table public.customers add column if not exists fahrt_nach_km boolean not null default false;
alter table public.customers add column if not exists fahrt_satz_pro_km numeric(8,2);
do $$ begin
  alter table public.customers add constraint customers_preis_modus_check check (preis_modus in ('standard','festpreis_m2','festpreis_pauschale'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.customers add constraint customers_festpreis_positiv_check check (
    (festpreis_m2 is null or festpreis_m2 >= 0) and (festpreis_pauschale is null or festpreis_pauschale >= 0) and (fahrt_satz_pro_km is null or fahrt_satz_pro_km >= 0));
exception when duplicate_object then null; end $$;

alter table public.company_settings add column if not exists calc_km_satz numeric(8,2);
