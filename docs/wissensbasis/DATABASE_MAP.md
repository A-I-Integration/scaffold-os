# DATABASE_MAP – SCAFFOLD OS

Erzeugt am 06.11.2026 per Skript aus den SQL-Dateien in supabase/ und im Repo-Root.
**Wichtig:** Das ist der Stand der SQL-Dateien, nicht der Live-Datenbank. Spätere ALTER-/DROP-Anweisungen,
manuelle Änderungen im Supabase-Dashboard und die Reihenfolge der Ausführung sind hier nicht abgebildet.
Im Quelltext kommen 0 "drop table"-Anweisungen vor; betroffene Tabellen können in der Live-Datenbank fehlen.

SQL-Dateien: 79; erkannte CREATE-TABLE-Namen: 57

| Tabelle | angelegt in | RLS aktiviert (in SQL erkannt) | Policies (erkannt) |
|---|---|---|---|
| invoice_attachments | rechnung-anhaenge.sql, supabase/phase-rechnung-anhaenge.sql | ja | 0 |
| invoice_pruef_links | rechnung-pruefung.sql, supabase/phase-rechnung-pruefung.sql | ja | 0 |
| invoice_pruefungen | rechnung-pruefung.sql, supabase/phase-rechnung-pruefung.sql | ja | 0 |
| absences | supabase/kunden-schema.sql | ja | 4 |
| drivers | supabase/kunden-schema.sql, supabase/phase-4-touren.sql | ja | 2 |
| employee_skills | supabase/kunden-schema.sql | ja | 4 |
| employees | supabase/kunden-schema.sql | ja | 4 |
| gps_tracking | supabase/kunden-schema.sql, supabase/phase-4-touren.sql | ja | 2 |
| inventory | supabase/kunden-schema.sql | ja | 4 |
| inventory_transactions | supabase/kunden-schema.sql | ja | 2 |
| profiles | supabase/kunden-schema.sql | ja | 6 |
| project_media | supabase/kunden-schema.sql | ja | 12 |
| projects | supabase/kunden-schema.sql | ja | 2 |
| site_stock | supabase/kunden-schema.sql | ja | 3 |
| time_entries | supabase/kunden-schema.sql, supabase/phase-5-zeiterfassung.sql | ja | 2 |
| tour_assignments | supabase/kunden-schema.sql | ja | 4 |
| tour_plans | supabase/kunden-schema.sql | ja | 4 |
| tour_stops | supabase/kunden-schema.sql, supabase/phase-4-touren.sql | ja | 2 |
| tours | supabase/kunden-schema.sql, supabase/phase-4-touren.sql | ja | 2 |
| transport_orders | supabase/kunden-schema.sql | ja | 4 |
| vehicles | supabase/kunden-schema.sql, supabase/phase-4-touren.sql | ja | 2 |
| invoice_counters | supabase/kunden-schema.sql, supabase/phase-13-rechnungen.sql | ja | 0 |
| invoices | supabase/kunden-schema.sql, supabase/phase-13-rechnungen.sql | ja | 2 |
| company_settings | supabase/kunden-schema.sql, supabase/phase-14-firmenprofil.sql | ja | 2 |
| impact_events | supabase/kunden-schema.sql, supabase/phase-17-impact.sql | ja | 0 |
| customers | supabase/kunden-schema.sql, supabase/migration-kundenstamm.sql | ja | 2 |
| lead_termine | supabase/lead-termine.sql | ja | 0 |
| leistungskatalog | supabase/migration-leistungskatalog.sql | ja | 0 |
| subcontractors | supabase/migration-nachunternehmer.sql | ja | 0 |
| subcontractor_entries | supabase/migration-nachunternehmer.sql | ja | 0 |
| tenants | supabase/phase-10-tenants.sql | ja | 0 |
| nwd_jobs | supabase/phase-103-nwd-jobs.sql | ja | 0 |
| abrechnung_m2 | supabase/phase-104-abrechnung-m2.sql | ja | 0 |
| subscriptions | supabase/phase-12-stripe-abo.sql | ja | 0 |
| project_events | supabase/phase-18-projekt-dokumentation.sql | ja | 0 |
| email_log | supabase/phase-20-email-log.sql | ja | 0 |
| project_versions | supabase/phase-25-versionierung.sql | ja | 0 |
| invoice_freigabe_override | supabase/phase-27-freigabe-pflicht.sql | ja | 0 |
| project_assignments | supabase/phase-28-kunden-vervollstaendigen.sql | ja | 0 |
| customer_contacts | supabase/phase-28-kunden-vervollstaendigen.sql | ja | 0 |
| project_access_tokens | supabase/phase-33-fernannahme.sql | ja | 0 |
| delivery_notes | supabase/phase-37-lieferschein.sql | ja | 0 |
| delivery_note_counters | supabase/phase-37-lieferschein.sql | ja | 0 |
| invoice_payments | supabase/phase-38-teilzahlungen.sql | ja | 0 |
| taeglicher_einsatz | supabase/phase-54-wochenplanung.sql | ja | 0 |
| kolonnen | supabase/phase-55-kolonnen.sql | ja | 0 |
| ki_jobs | supabase/phase-65-ki-jobs.sql | ja | 0 |
| demo_ip_sperre | supabase/phase-88-demo-gate.sql | ja | 0 |
| payroll_documents | supabase/phase-90-lohnabrechnungen.sql | ja | 0 |
| email_accounts | supabase/phase-98-email-konten.sql | ja | 0 |
| customer_emails | supabase/phase-98-email-konten.sql | ja | 0 |
| project_view_links | supabase/phase-ansicht-link.sql | ja | 0 |
| project_stand_links | supabase/phase-auftrag-links.sql | ja | 0 |
| project_mappe_links | supabase/phase-baustellenmappe.sql | ja | 0 |
| besuche | supabase/phase-besucherzaehler.sql | ja | 0 |
| projekt_lv | supabase/phase-projekt-lv.sql | ja | 0 |
| project_statiker | supabase/phase-statiker.sql | ja | 0 |

## Verwendung der Tabellen im Code (Textsuche nach .from("..."), rest/v1/... )

Nur nicht-Test-Dateien. Dynamisch gebildete Tabellennamen werden nicht erkannt. Ein Eintrag heißt nur: die Datei nennt die Tabelle, nicht ob sie liest oder schreibt.

| Tabelle | Dateien | Wo (Auszug) | Beispiel |
|---|---|---|---|
| invoice_attachments | 5 | app/api 5 | app/api/invoices/anhang/route.ts |
| invoice_pruef_links | 3 | app/api 3 | app/api/invoices/pruef-link/route.ts |
| invoice_pruefungen | 2 | app/api 2 | app/api/invoices/pruef-link/route.ts |
| absences | 4 | app/api 2, lib/actions 1, lib 1 | app/api/tour-stops/nicht-fertig/route.ts |
| drivers | 6 | app/api 3, lib/actions 1, lib 1, lib/touren 1 | app/api/admin/data/route.ts |
| employee_skills | 1 | lib/actions 1 | lib/actions/employees.ts |
| employees | 11 | app/api 8, lib/actions 1, lib 1, lib/touren 1 | app/api/admin/users/route.ts |
| gps_tracking | 2 | app/api 2 | app/api/cron/datenhygiene/route.ts |
| inventory | 13 | app/api 9, lib/actions 1, lib 1, lib/calculations 1 | app/api/admin/data/route.ts |
| inventory_transactions | 6 | app/api 4, lib/actions 1, lib/inventory 1 | app/api/inventory/count/route.ts |
| profiles | 69 | app/api 53, app 5, lib 3, components 2 | app/api/abbau-plan/route.ts |
| project_media | 14 | app/api 10, workers 2, lib/actions 1, lib 1 | app/api/attach-photos/route.ts |
| projects | 32 | app/api 26, lib 3, app 2, lib/actions 1 | app/api/admin/data/route.ts |
| site_stock | 4 | app/api 2, lib/actions 1, lib/inventory 1 | app/api/disposition/route.ts |
| time_entries | 4 | app/api 4 | app/api/baustellen-ergebnis/route.ts |
| tour_assignments | 1 | lib/actions 1 | lib/actions/employees.ts |
| tour_plans | 1 | lib/actions 1 | lib/actions/employees.ts |
| tour_stops | 4 | app/api 3, lib 1 | app/api/tour-stops/nicht-fertig/route.ts |
| tours | 7 | app/api 4, lib/actions 1, lib 1, lib/touren 1 | app/api/admin/data/route.ts |
| transport_orders | 11 | app/api 6, lib 2, app 1, lib/actions 1 | app/api/admin/data/route.ts |
| vehicles | 4 | app/api 4 | app/api/admin/data/route.ts |
| invoices | 16 | app/api 15, lib 1 | app/api/cron/mahnwesen/route.ts |
| company_settings | 14 | app/api 11, lib 2, lib/touren 1 | app/api/company/route.ts |
| impact_events | 2 | app/api 1, lib 1 | app/api/track/status/route.ts |
| customers | 9 | app/api 8, lib 1 | app/api/admin/data/route.ts |
| lead_termine | 1 | app/api 1 | app/api/lead/termin/route.ts |
| leistungskatalog | 1 | app/api 1 | app/api/leistungskatalog/route.ts |
| subcontractors | 1 | app/api 1 | app/api/nachunternehmer/route.ts |
| subcontractor_entries | 1 | app/api 1 | app/api/nachunternehmer-eintraege/route.ts |
| tenants | 6 | app/api 5, lib/provision 1 | app/api/admin/impersonate/route.ts |
| abrechnung_m2 | 2 | app/api 2 | app/api/abrechnung-m2/route.ts |
| subscriptions | 1 | app/api 1 | app/api/stripe/webhook/route.ts |
| project_events | 4 | app/api 4 | app/api/cron/standzeit-abrechnung/route.ts |
| email_log | 5 | app/api 4, lib 1 | app/api/email-log/resend/route.ts |
| project_versions | 2 | app/api 2 | app/api/project-versions/route.ts |
| invoice_freigabe_override | 1 | app/api 1 | app/api/invoices/route.ts |
| project_assignments | 4 | app/api 4 | app/api/project-assignments/route.ts |
| customer_contacts | 2 | app/api 2 | app/api/kunden-kontakte/route.ts |
| project_access_tokens | 3 | app/api 3 | app/api/access-token/route.ts |
| delivery_notes | 1 | app/api 1 | app/api/delivery-notes/route.ts |
| invoice_payments | 1 | app/api 1 | app/api/invoice-payments/route.ts |
| taeglicher_einsatz | 5 | app/api 4, lib 1 | app/api/abbau-plan/route.ts |
| kolonnen | 3 | app/api 3 | app/api/kolonnen/route.ts |
| ki_jobs | 6 | app/api 4, workers 2 | app/api/cad/analyze-plan/route.ts |
| demo_ip_sperre | 1 | app/api 1 | app/api/auth/demo-gate/route.ts |
| payroll_documents | 3 | app/api 3 | app/api/lohnabrechnungen/route.ts |
| email_accounts | 2 | app/api 2 | app/api/email-accounts/route.ts |
| customer_emails | 1 | app/api 1 | app/api/kunden/[id]/emails/route.ts |
| project_view_links | 2 | app/api 2 | app/api/ansicht-link/route.ts |
| project_stand_links | 4 | app/api 4 | app/api/auftrag-link/route.ts |
| project_mappe_links | 3 | app/api 3 | app/api/baustellenmappe/route.ts |
| besuche | 1 | app/api 1 | app/api/track/besuch/route.ts |
| project_statiker | 3 | app/api 3 | app/api/statiker-zuordnung/route.ts |

Tabellen ohne Treffer der Textsuche: 4 (invoice_counters, delivery_note_counters, nwd_jobs, projekt_lv). Nachgeprüft: nwd_jobs (lib/nwd/job.ts) und projekt_lv (app/api/projekt-lv/route.ts) werden im Code genannt, die Suche hat sie nur nicht erkannt; die beiden Zähler-Tabellen werden über Datenbankfunktionen angesprochen (rest/v1/rpc/next_invoice_number, next_delivery_note_number), nicht direkt.

Im Code genannt, aber ohne CREATE TABLE: stuecklisten (frühere Route /api/stueckliste). Geklärt am 06.11.2026: Die Tabelle existiert in der Instanz der Nutzerin nicht; Knopf und Route wurden entfernt (gemergt in main, PR #662). Der Treffer "rpc" ist nur der Pfadteil rest/v1/rpc.

RPC-Aufrufe (rest/v1/rpc/...): besucher_statistik, next_invoice_number, next_delivery_note_number.
