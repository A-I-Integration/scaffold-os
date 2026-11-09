\set ON_ERROR_STOP 0
insert into projects (id, name) values ('00000000-0000-0000-0000-0000000000a1','Bau A') on conflict do nothing;
insert into inventory (id, sku, name, category, quantity) values
 ('00000000-0000-0000-0000-000000000011','R1','Rahmen','Rahmen',100),
 ('00000000-0000-0000-0000-000000000012','D1','Diagonale','Diagonale',50);
insert into site_stock (inventory_id, project_id, quantity, reserved_quantity) values
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000a1',30,10);
\echo == Backfill erneut
\i supabase/phase-108-lager-belege.sql
select 'ABGLEICH Zeilen (erwartet 0):', count(*) from v_bestand_abgleich;
select l.schluessel, i.sku, b.zustand, b.menge from bestand b join lagerorte l on l.id=b.lagerort_id join inventory i on i.id=b.inventory_id order by 1,2,3;
\echo == Idempotenz: nochmal laufen lassen
\i supabase/phase-108-lager-belege.sql
select 'AB-Belege (erwartet 1):', count(*) from materialbelege where bewegungsart='AB';
\echo == Ausgabe AU Hauptlager->Baustelle 20 Rahmen
select buche_beleg('AU', jsonb_build_array(jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000011','menge',20,
 'von_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'),'nach_lagerort',lagerort_fuer_projekt('00000000-0000-0000-0000-0000000000a1'),'nach_zustand','reserviert')),null,'00000000-0000-0000-0000-0000000000a1') is not null as ok;
\echo == Zu viel (erwartet Fehler, nichts gebucht)
select buche_beleg('VL', jsonb_build_array(jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000011','menge',999,'von_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'))));
\echo == Mehrpositionen: 2. Position scheitert -> 1. darf nicht gebucht sein
select buche_beleg('VL', jsonb_build_array(
 jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000011','menge',5,'von_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER')),
 jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000012','menge',999,'von_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'))));
select 'Rahmen frei Hauptlager (erwartet 50):', menge from bestand where inventory_id='00000000-0000-0000-0000-000000000011' and zustand='frei' and lagerort_id=(select id from lagerorte where schluessel='HAUPTLAGER');
\echo == Zustandswechsel frei->defekt 3 im Hauptlager
select buche_beleg('ZW', jsonb_build_array(jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000011','menge',3,
 'von_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'),'von_zustand','frei','nach_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'),'nach_zustand','defekt'))) is not null as zw_ok;
\echo == ZW mit gleichem Zustand (erwartet Fehler)
select buche_beleg('ZW', jsonb_build_array(jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000011','menge',1,
 'von_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'),'von_zustand','frei','nach_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'),'nach_zustand','frei')));
\echo == Umlagerung mit Zustandsänderung (erwartet Fehler)
select buche_beleg('UL', jsonb_build_array(jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000011','menge',1,
 'von_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'),'von_zustand','frei','nach_lagerort',(select id from lagerorte where schluessel='WERKSTATT'),'nach_zustand','defekt')));
\echo == Umlagerung Hauptlager->Werkstatt 7, dann Storno
select buche_beleg('UL', jsonb_build_array(jsonb_build_object('inventory_id','00000000-0000-0000-0000-000000000011','menge',7,
 'von_lagerort',(select id from lagerorte where schluessel='HAUPTLAGER'),'nach_lagerort',(select id from lagerorte where schluessel='WERKSTATT'))),null,null,'t') as ul \gset
select storniere_beleg(:'ul') is not null as storno_ok;
\echo == Doppelstorno (erwartet Fehler)
select storniere_beleg(:'ul');
\echo == Storno direkt buchen (erwartet Fehler)
select buche_beleg('ST', '[{"inventory_id":"00000000-0000-0000-0000-000000000011","menge":1}]'::jsonb);
\echo == Beleg ändern/löschen (erwartet Fehler)
update materialbelege set bemerkung='x';
delete from materialbeleg_positionen;
\echo == Summe Rahmen über alle Orte (erwartet 140 = 100+30+10)
select sum(menge) from bestand where inventory_id='00000000-0000-0000-0000-000000000011';
\echo == Direktes Schreiben als authenticated (erwartet Fehler)
set role authenticated; insert into bestand(inventory_id,lagerort_id,zustand,menge) select id,(select id from lagerorte limit 1),'frei',1 from inventory limit 1; select buche_beleg('WE','[]'::jsonb); reset role;
