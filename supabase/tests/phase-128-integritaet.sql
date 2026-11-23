-- Prüfskript Phase 128 (manuell gegen eine Test-Datenbank mit phase-93/126/127/128 ausführen, NICHT gegen Produktion).
-- Erwartung je Abschnitt steht als Kommentar. Getestet auf PostgreSQL 18 (lokal); Parallelität: 8 gleichzeitige Sitzungen mit demselben reservieren -> genau 1x ok, 7x reserviert.
-- Erwartung Teil 1: ungueltig, ungueltig, ungueltig | ok | rechnung_ungueltig (unbekannte ID), rechnung_ungueltig (Rechnung anderes Projekt), ok, ok, rechnung_doppelt (dieselbe Rechnung für zweiten Zeitraum)
--   Aufmaß: ok, rechnung_doppelt (schon einem Vorhaltezeitraum zugeordnet), rechnung_ungueltig (anderes Projekt), ok
-- Erwartung Teil 2 (Wrapper): Fehler 'zuordnung_fehlgeschlagen:keine_reservierung', danach 0 Rechnungen; mit richtigem Token 1 Rechnung + Zuordnung.
\set ON_ERROR_STOP 0
insert into projects(id,data) values
 ('00000000-0000-0000-0000-0000000000a1','{"zwischenaufmasse":[{"id":"za1","positionen":[]},{"id":"za2"}]}'),
 ('00000000-0000-0000-0000-0000000000b2','{}');
insert into invoices(id,invoice_number,project_id) values
 ('10000000-0000-0000-0000-000000000001','R-1','00000000-0000-0000-0000-0000000000a1'),
 ('10000000-0000-0000-0000-000000000002','R-2','00000000-0000-0000-0000-0000000000a1'),
 ('10000000-0000-0000-0000-000000000003','R-3','00000000-0000-0000-0000-0000000000b2');
\echo --- vorhaltung: ungueltige Zeitraeume
select vorhaltung_zuordnen('00000000-0000-0000-0000-0000000000a1','reservieren','{"von":"2026-03-10","bis":"2026-03-01","intervalle":1,"netto":10}',null,'t0');
select vorhaltung_zuordnen('00000000-0000-0000-0000-0000000000a1','reservieren','{"von":"x","bis":"2026-03-01","intervalle":1,"netto":10}',null,'t0');
select vorhaltung_zuordnen('00000000-0000-0000-0000-0000000000a1','reservieren','{"von":"2026-03-01","bis":"2026-03-08","intervalle":0,"netto":10}',null,'t0');
\echo --- reservieren ok
select vorhaltung_zuordnen('00000000-0000-0000-0000-0000000000a1','reservieren','{"von":"2026-03-01","bis":"2026-03-08","intervalle":1,"netto":10}',null,'tk1');
\echo --- abschliessen: ungueltige ID / fremdes Projekt / ok / doppelt
select vorhaltung_zuordnen('00000000-0000-0000-0000-0000000000a1','abschliessen',null,null,'tk1','99999999-0000-0000-0000-000000000009','X');
select vorhaltung_zuordnen('00000000-0000-0000-0000-0000000000a1','abschliessen',null,null,'tk1','10000000-0000-0000-0000-000000000003','R-3');
select vorhaltung_zuordnen('00000000-0000-0000-0000-0000000000a1','abschliessen',null,null,'tk1','10000000-0000-0000-0000-000000000001','R-1');
select vorhaltung_zuordnen('00000000-0000-0000-0000-0000000000a1','reservieren','{"von":"2026-03-08","bis":"2026-03-15","intervalle":1,"netto":10}','2026-03-08','tk2');
select vorhaltung_zuordnen('00000000-0000-0000-0000-0000000000a1','abschliessen',null,null,'tk2','10000000-0000-0000-0000-000000000001','R-1');
\echo --- gleiche Rechnung fuer Aufmass nach Vorhaltung
select aufmass_zuordnen('00000000-0000-0000-0000-0000000000a1','za1','reservieren','{"id":"za1","positionen":[]}','z1');
select aufmass_zuordnen('00000000-0000-0000-0000-0000000000a1','za1','abschliessen',null,'z1','10000000-0000-0000-0000-000000000001','R-1','', '2026-03-01');
select aufmass_zuordnen('00000000-0000-0000-0000-0000000000a1','za1','abschliessen',null,'z1','10000000-0000-0000-0000-000000000003','R-3','', '2026-03-01');
select aufmass_zuordnen('00000000-0000-0000-0000-0000000000a1','za1','abschliessen',null,'z1','10000000-0000-0000-0000-000000000002','R-2',null,'2026-03-01');
\echo --- ersetzen
select vorhaltung_zuordnen('00000000-0000-0000-0000-0000000000a1','ersetzen',null,null,null,'10000000-0000-0000-0000-000000000001','R-1b','10000000-0000-0000-0000-000000000002');
select jsonb_pretty(data->'vorhaltePerioden') from projects where id='00000000-0000-0000-0000-0000000000a1';
-- Teil 2
insert into projects(id,data) values ('00000000-0000-0000-0000-0000000000d1','{}');
select vorhaltung_zuordnen('00000000-0000-0000-0000-0000000000d1','reservieren','{"von":"2026-06-01","bis":"2026-06-08","intervalle":1,"netto":10}',null,'wk1');
\set ON_ERROR_STOP 0
-- falscher Token -> Zuordnung scheitert -> Rechnung darf NICHT existieren
select rechnung_anlegen_zugeordnet('vorhaltung',null,'falsch','{"p_prefix":"RE","p_project_id":"00000000-0000-0000-0000-0000000000d1","p_positions":[],"p_net_amount":10,"p_tax_rate":19,"p_tax_amount":1.9,"p_gross_amount":11.9,"p_invoice_date":"2026-06-08","p_due_date":"2026-06-22","p_invoice_type":"rechnung"}');
select count(*) as rechnungen_nach_fehler from invoices where project_id='00000000-0000-0000-0000-0000000000d1';
select rechnung_anlegen_zugeordnet('vorhaltung',null,'wk1','{"p_prefix":"RE","p_project_id":"00000000-0000-0000-0000-0000000000d1","p_positions":[],"p_net_amount":10,"p_tax_rate":19,"p_tax_amount":1.9,"p_gross_amount":11.9,"p_invoice_date":"2026-06-08","p_due_date":"2026-06-22","p_invoice_type":"rechnung"}') is not null as ok;
select count(*) as rechnungen_nach_erfolg from invoices where project_id='00000000-0000-0000-0000-0000000000d1';
select data->'vorhaltePerioden'->0->>'rechnungNr' as nr from projects where id='00000000-0000-0000-0000-0000000000d1';
