\set ON_ERROR_STOP 0
insert into projects (id, name) values ('00000000-0000-0000-0000-0000000000a1','Bau A');
insert into inventory (id, sku, name, category, quantity) values ('00000000-0000-0000-0000-000000000011','R1','Rahmen','Rahmen',100);
insert into site_stock (inventory_id, project_id, quantity, reserved_quantity) select '00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000a1',0,1 from generate_series(1,3);
\i supabase/phase-108-lager-belege.sql
select 'Start Abgleich (erw. 0):', count(*) from v_bestand_abgleich;
-- Ausgabe 20 an Baustelle (reserviert): Lager -20, Baustelle reserviert +20
select buche_lager('AU', jsonb_build_array(jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000011','menge',20,'von_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'),'nach_lagerort',lagerort_fuer_projekt('00000000-0000-0000-0000-0000000000a1'),'nach_zustand','reserviert'))) as au \gset
select 'inventory.quantity (erw. 80):', quantity from inventory;
select 'site_stock reserviert gesamt (erw. 23):', sum(reserved_quantity) from site_stock;
-- Anlieferung: reserviert -> frei auf der Baustelle 22 (mehr als eine Zeile betroffen)
select buche_lager('AN', jsonb_build_array(jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000011','menge',22,'von_lagerort',lagerort_fuer_projekt('00000000-0000-0000-0000-0000000000a1'),'von_zustand','reserviert','nach_lagerort',lagerort_fuer_projekt('00000000-0000-0000-0000-0000000000a1'),'nach_zustand','frei'))) is not null as an_ok;
select 'site_stock frei/reserviert (erw. 22/1):', sum(quantity), sum(reserved_quantity) from site_stock;
-- Defekt im Hauptlager 4 -> nicht mehr verfügbar
select buche_lager('ZW', jsonb_build_array(jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000011','menge',4,'von_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'),'von_zustand','frei','nach_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'),'nach_zustand','defekt'))) is not null as zw_ok;
select 'inventory.quantity (erw. 76):', quantity from inventory;
-- Storno des Defekt-Belegs und der Ausgabe
select storniere_lager(:'au') is not null as storno_au;
select 'inventory.quantity nach Storno AU (erw. 96 -> aber 22 liegen frei auf Baustelle, reserviert nur 1: Storno scheitert erwartet):', quantity from inventory;
select 'Abgleich (erw. 0):', count(*) from v_bestand_abgleich;
-- Fehlschlag darf nichts verändern
select buche_lager('VL', jsonb_build_array(jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000011','menge',9999,'von_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'))));
select 'inventory.quantity unverändert:', quantity from inventory;
