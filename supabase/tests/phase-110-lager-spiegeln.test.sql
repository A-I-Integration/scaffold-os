\set ON_ERROR_STOP 0
insert into projects (id, name) values ('00000000-0000-0000-0000-0000000000a1','Bau A'),('00000000-0000-0000-0000-0000000000a2','Bau B');
insert into inventory (id, sku, name, category, quantity) values ('00000000-0000-0000-0000-000000000011','R1','Rahmen','Rahmen',100);
\i supabase/phase-108-lager-belege.sql
\i supabase/phase-109-lager-altbestand-nachfuehren.sql
\i supabase/phase-110-lager-altwege-spiegeln.sql
select 'Start (erw. 0):', count(*) from v_bestand_abgleich;
\echo == Neuer Artikel mit Bestand (Altweg)
insert into inventory (id, sku, name, category, quantity) values ('00000000-0000-0000-0000-000000000012','D1','Diagonale','Diag',40);
select 'nach Anlage (erw. 0):', count(*) from v_bestand_abgleich;
\echo == Altes Reservieren: inventory -20, site_stock reserviert +20 (neue Zeile)
update inventory set quantity = 80 where id='00000000-0000-0000-0000-000000000011';
insert into site_stock (inventory_id, project_id, quantity, reserved_quantity) values ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000a1',0,20);
select 'nach Reservieren (erw. 0):', count(*) from v_bestand_abgleich;
\echo == Alte Anlieferung: reserviert -> physisch
update site_stock set quantity = 20, reserved_quantity = 0 where inventory_id='00000000-0000-0000-0000-000000000011';
select 'nach Anlieferung (erw. 0):', count(*) from v_bestand_abgleich;
\echo == Alte Rücknahme: site_stock 0, inventory +20
update site_stock set quantity = 0 where inventory_id='00000000-0000-0000-0000-000000000011';
update inventory set quantity = 100 where id='00000000-0000-0000-0000-000000000011';
\echo == Alte Inventur: 97 gezählt; Nachbestellung +50; doppelte site_stock-Zeilen; Löschen
update inventory set quantity = 97 where id='00000000-0000-0000-0000-000000000011';
update inventory set quantity = quantity + 50 where id='00000000-0000-0000-0000-000000000011';
insert into site_stock (inventory_id, project_id, quantity, reserved_quantity) select '00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-0000000000a2',0,1 from generate_series(1,3);
delete from site_stock where inventory_id='00000000-0000-0000-0000-000000000012' and id=(select id from site_stock where inventory_id='00000000-0000-0000-0000-000000000012' limit 1);
select 'nach allem (erw. 0):', count(*) from v_bestand_abgleich;
select 'Summe R1 neu (erw. 147):', sum(menge) from bestand where inventory_id='00000000-0000-0000-0000-000000000011';
\echo == Neues Lager + Altweg gemischt
select buche_lager('UL', jsonb_build_array(jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000011','menge',30,'von_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'),'nach_lagerort',(select id from lagerorte where schluessel='WERKSTATT'))))is not null as ul;
select 'nach Umlagerung inventory.quantity (erw. 117):', quantity from inventory where id='00000000-0000-0000-0000-000000000011';
select 'Abgleich (erw. 0):', count(*) from v_bestand_abgleich;
update inventory set quantity = 110 where id='00000000-0000-0000-0000-000000000011';
select 'Abgleich nach Altweg (erw. 0):', count(*) from v_bestand_abgleich;
select 'Schalter zurückgesetzt:', coalesce(nullif(current_setting('lager.sync', true), ''), 'leer');
select bewegungsart, count(*) from materialbelege group by 1 order by 1;
