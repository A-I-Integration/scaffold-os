# SCHEMA_LUECKE – Kunden-Schema gegen spätere SQL-Dateien

Stand: 06.11.2026. Erzeugt mit scripts/schema-luecke.mjs (Branch chore/schema-luecke), reine Textsuche, ohne Zugriff auf eine Datenbank.

## Befund

- Die Provisionierung (lib/provision/orchestrate.ts, Schritt 4 "schema", Zeile 170) spielt **ausschließlich KUNDEN_SCHEMA** ein, erzeugt aus supabase/kunden-schema.sql. Danach folgt keine Prüfung des Schemas.
- kunden-schema.sql ist ein pg_dump der Master-Instanz, **zuletzt geändert am 27.08.2026**. 58 von 77 anderen SQL-Dateien sind jünger.
- Im Kunden-Schema fehlen daher: **34 Tabellen, 50 Spalten, 7 Funktionen** (Liste unten).
- Annahme: Fünf der 34 Tabellen gehören nur in die Master-Datenbank (tenants, subscriptions, besuche, demo_ip_sperre, lead_termine). Dann fehlen einer **neu provisionierten Kundeninstanz 29 Tabellen**, die laut DATABASE_MAP im Code verwendet werden, dazu 50 Spalten und die Funktionen create_invoice, create_invoice_as_new_version, next_delivery_note_number, is_statiker, ki_jobs_cleanup.
- Für bestehende Instanzen sagt das nichts: Sie können von Hand nachgezogen worden sein (im Repo liegen z. B. nachhole-migration-einstellungen.sql und system-check-migrationen.sql, ein rein lesender Abgleich je Instanz im SQL-Editor).
- Nicht geprüft: welche Instanz auf welchem Stand ist; ob die Master-Datenbank alle diese Dateien eingespielt hat; ob spätere DROP- oder RENAME-Anweisungen einzelne Treffer entwerten.

## Empfehlung

1. Vor dem nächsten automatisch angelegten Kunden: kunden-schema.sql neu aus der Master-Instanz erzeugen (pg_dump --schema-only, wie im Kopf der Datei beschrieben, anschließend wieder um Master-Tabellen und Supabase-Interna bereinigen). Dafür braucht es Zugriff auf die Master-Datenbank; das kann dieser Bericht nicht ersetzen.
2. Je Instanz ein Protokoll, welche Dateien gelaufen sind: supabase/phase-105-schema-migrationen.sql (Branch chore/schema-luecke). Neue SQL-Dateien tragen sich am Ende selbst ein.
3. Nach der Provisionierung einmal supabase/system-check-migrationen.sql laufen lassen (rein lesend) oder die Prüfung in die Provisionierung einbauen (noch nicht gebaut).

## Messung (Ausgabe des Skripts)

```
Kunden-Schema: letzter Stand 2026-08-27
SQL-Dateien (ohne kunden-schema und system-check): 77, davon neuer als der Dump: 58

Tabellen in SQL-Dateien, die im Kunden-Schema FEHLEN: 34
  abrechnung_m2  <-  phase-104-abrechnung-m2.sql
  besuche  <-  phase-besucherzaehler.sql
  customer_contacts  <-  phase-28-kunden-vervollstaendigen.sql
  customer_emails  <-  phase-98-email-konten.sql
  delivery_note_counters  <-  phase-37-lieferschein.sql
  delivery_notes  <-  phase-37-lieferschein.sql
  demo_ip_sperre  <-  phase-88-demo-gate.sql
  email_accounts  <-  phase-98-email-konten.sql
  email_log  <-  phase-20-email-log.sql
  invoice_attachments  <-  phase-rechnung-anhaenge.sql, rechnung-anhaenge.sql
  invoice_freigabe_override  <-  phase-27-freigabe-pflicht.sql
  invoice_payments  <-  phase-38-teilzahlungen.sql
  invoice_pruef_links  <-  phase-rechnung-pruefung.sql, rechnung-pruefung.sql
  invoice_pruefungen  <-  phase-rechnung-pruefung.sql, rechnung-pruefung.sql
  ki_jobs  <-  phase-65-ki-jobs.sql
  kolonnen  <-  phase-55-kolonnen.sql
  lead_termine  <-  lead-termine.sql
  leistungskatalog  <-  migration-leistungskatalog.sql
  nwd_jobs  <-  phase-103-nwd-jobs.sql
  payroll_documents  <-  phase-90-lohnabrechnungen.sql
  project_access_tokens  <-  phase-33-fernannahme.sql
  project_assignments  <-  phase-28-kunden-vervollstaendigen.sql
  project_events  <-  phase-18-projekt-dokumentation.sql
  project_mappe_links  <-  phase-baustellenmappe.sql
  project_stand_links  <-  phase-auftrag-links.sql
  project_statiker  <-  phase-statiker.sql
  project_versions  <-  phase-25-versionierung.sql
  project_view_links  <-  phase-ansicht-link.sql
  projekt_lv  <-  phase-projekt-lv.sql
  subcontractor_entries  <-  migration-nachunternehmer.sql
  subcontractors  <-  migration-nachunternehmer.sql
  subscriptions  <-  phase-12-stripe-abo.sql
  taeglicher_einsatz  <-  phase-54-wochenplanung.sql
  tenants  <-  phase-10-tenants.sql

Spalten (ADD COLUMN), die im Kunden-Schema FEHLEN: 50
  company_settings.angebotene_geruesttypen  <-  phase-96-angebotene-geruesttypen.sql
  company_settings.calc_crane_day  <-  migration-kalkulations-grundlagen.sql, nachhole-migration-einstellungen.sql
  company_settings.calc_festpreis_pro_m2  <-  phase-86-festpreis-spalte.sql
  company_settings.calc_hourly_rate  <-  migration-kalkulations-grundlagen.sql, nachhole-migration-einstellungen.sql
  company_settings.calc_hours_per_sqm  <-  migration-kalkulations-grundlagen.sql, nachhole-migration-einstellungen.sql
  company_settings.calc_permit_high  <-  migration-kalkulations-grundlagen.sql, nachhole-migration-einstellungen.sql
  company_settings.calc_permit_low  <-  migration-kalkulations-grundlagen.sql, nachhole-migration-einstellungen.sql
  company_settings.calc_transport_min  <-  migration-kalkulations-grundlagen.sql, nachhole-migration-einstellungen.sql
  company_settings.calc_transport_per_kg  <-  migration-kalkulations-grundlagen.sql, nachhole-migration-einstellungen.sql
  company_settings.calc_trip_flat  <-  migration-kalkulations-grundlagen.sql, nachhole-migration-einstellungen.sql
  company_settings.lv_firmenwerte  <-  phase-lv-firmenwerte.sql
  company_settings.lv_standardpreise  <-  phase-lv-firmenwerte.sql
  company_settings.mahnung_erinnerung_tage  <-  phase-mahnung-steuerung.sql
  company_settings.mahnung_pauschale  <-  nachhole-migration-einstellungen.sql, phase-36-mahnung-zinsen.sql
  company_settings.mahnung_verzugszinssatz  <-  nachhole-migration-einstellungen.sql, phase-36-mahnung-zinsen.sql
  company_settings.preisliste_geruesttypen  <-  nachhole-migration-einstellungen.sql, phase-46-preisliste-geruesttypen.sql
  company_settings.tour_fahrt_dauer_min  <-  phase-102-tour-planung-zeiten.sql
  company_settings.tour_letzter_start_min  <-  phase-102-tour-planung-zeiten.sql
  company_settings.tour_standort_erfassen  <-  phase-101-tour-standort-schalter.sql
  customers.datev_konto  <-  phase-95-kunden-datev-konto.sql
  employees.fuehrerschein_klassen  <-  phase-91-fahrzeug-fuehrerschein.sql
  employees.kolonne_id  <-  phase-55-kolonnen.sql
  inventory.weight_kg  <-  migration-kalkulations-grundlagen.sql, nachhole-migration-einstellungen.sql
  invoice_counters.prefix  <-  phase-22-gutschrift.sql
  invoices.customer_id  <-  phase-34-kunde-projekt-verknuepfung.sql
  invoices.erinnerung_am  <-  phase-mahnung-steuerung.sql
  invoices.geprueft_am  <-  phase-rechnung-pruefung.sql, rechnung-pruefung.sql
  invoices.geprueft_von  <-  phase-rechnung-pruefung.sql, rechnung-pruefung.sql
  invoices.geruest_nr  <-  phase-rechnung-struktur.sql, rechnung-struktur.sql
  invoices.importiert  <-  phase-import-altbestand.sql
  invoices.leistungsdatum  <-  phase-rechnung-struktur.sql, rechnung-struktur.sql
  invoices.mahnung_pause_grund  <-  phase-mahnung-steuerung.sql
  invoices.mahnung_pausiert  <-  phase-mahnung-steuerung.sql
  invoices.paid_amount  <-  phase-38-teilzahlungen.sql
  invoices.pruef_status  <-  phase-rechnung-pruefung.sql, rechnung-pruefung.sql
  invoices.reference_invoice_number  <-  phase-22-gutschrift.sql
  projects.customer_id  <-  phase-34-kunde-projekt-verknuepfung.sql
  time_entries.fahrzeit_minuten  <-  phase-53-lohn-zusatzfelder.sql
  time_entries.spesen_euro  <-  phase-53-lohn-zusatzfelder.sql
  time_entries.uebernachtung  <-  phase-53-lohn-zusatzfelder.sql
  tours.departed_at  <-  phase-100-tour-hof.sql
  tours.departed_lat  <-  phase-100-tour-hof.sql
  tours.departed_lng  <-  phase-100-tour-hof.sql
  tours.returned_at  <-  phase-100-tour-hof.sql
  tours.returned_lat  <-  phase-100-tour-hof.sql
  tours.returned_lng  <-  phase-100-tour-hof.sql
  tours.team_ids  <-  phase-89-tour-team.sql
  vehicles.nutzlast_kg  <-  phase-91-fahrzeug-fuehrerschein.sql
  vehicles.typ  <-  phase-91-fahrzeug-fuehrerschein.sql
  vehicles.zulaessiges_gesamtgewicht_kg  <-  phase-91-fahrzeug-fuehrerschein.sql

Funktionen, die im Kunden-Schema FEHLEN: 7
  besucher_statistik  <-  phase-besucherzaehler.sql
  create_invoice  <-  phase-93-rechnung-atomar.sql
  create_invoice_as_new_version  <-  phase-94-storno-neue-version-atomar.sql
  is_statiker  <-  phase-statiker.sql
  ki_jobs_cleanup  <-  phase-65-ki-jobs.sql
  next_delivery_note_number  <-  phase-37-lieferschein.sql
  touch_subscriptions_updated_at  <-  phase-12-stripe-abo.sql

Dateien neuer als der Dump:
  2026-08-31  phase-18-projekt-dokumentation.sql
  2026-09-01  migration-kalkulations-grundlagen.sql
  2026-09-01  migration-nachunternehmer.sql
  2026-09-01  phase-20-email-log.sql
  2026-09-03  phase-22-gutschrift.sql
  2026-09-03  phase-24-pruefprotokoll.sql
  2026-09-03  phase-25-versionierung.sql
  2026-09-03  phase-27-freigabe-pflicht.sql
  2026-09-03  phase-28-kunden-vervollstaendigen.sql
  2026-09-03  phase-31-fix-belegnummer.sql
  2026-09-03  phase-33-fernannahme.sql
  2026-09-05  phase-34-kunde-projekt-verknuepfung.sql
  2026-09-07  phase-36-mahnung-zinsen.sql
  2026-09-07  phase-37-lieferschein.sql
  2026-09-07  phase-38-teilzahlungen.sql
  2026-09-11  phase-46-preisliste-geruesttypen.sql
  2026-09-11  phase-52-zeiterfassung-projekt.sql
  2026-09-11  phase-53-lohn-zusatzfelder.sql
  2026-09-11  phase-54-wochenplanung.sql
  2026-09-11  phase-55-kolonnen.sql
  2026-09-15  phase-65-ki-jobs.sql
  2026-09-18  phase-88-demo-gate.sql
  2026-09-19  phase-89-tour-team.sql
  2026-09-20  diagnose-lager-konsistenz.sql
  2026-09-20  nachhole-migration-einstellungen.sql
  2026-09-20  phase-61-rls-nachtrag.sql
  2026-09-20  phase-86-festpreis-spalte.sql
  2026-09-21  phase-90-lohnabrechnungen.sql
  2026-09-21  phase-91-fahrzeug-fuehrerschein.sql
  2026-09-21  phase-92-fahrzeug-spalten-bereinigung.sql
  2026-09-21  phase-93-rechnung-atomar.sql
  2026-09-21  phase-94-storno-neue-version-atomar.sql
  2026-09-21  phase-95-kunden-datev-konto.sql
  2026-10-10  phase-96-angebotene-geruesttypen.sql
  2026-10-10  phase-97-email-log-inhalt.sql
  2026-10-11  phase-98-email-konten.sql
  2026-10-11  phase-99-email-log-kunde.sql
  2026-10-13  phase-100-tour-hof.sql
  2026-10-13  phase-101-tour-standort-schalter.sql
  2026-10-13  phase-102-tour-planung-zeiten.sql
  2026-10-16  phase-ansicht-link.sql
  2026-10-17  phase-statiker.sql
  2026-10-21  phase-103-nwd-jobs.sql
  2026-10-21  phase-104-abrechnung-m2.sql
  2026-10-23  phase-lv-firmenwerte.sql
  2026-10-26  phase-baustellenmappe.sql
  2026-10-26  phase-ereignis.sql
  2026-10-26  phase-import-altbestand.sql
  2026-10-26  phase-projekt-lv.sql
  2026-10-26  phase-rechnung-anhaenge.sql
  2026-10-26  phase-rechnung-pruefung.sql
  2026-10-26  phase-rechnung-struktur.sql
  2026-10-27  phase-anhang-sichtbarkeit.sql
  2026-10-27  phase-auftrag-links.sql
  2026-10-27  phase-mahnung-steuerung.sql
  2026-10-29  phase-89-cad-import.sql
  2026-10-29  phase-besucherzaehler.sql
  2026-11-04  migration-leistungskatalog.sql
```
