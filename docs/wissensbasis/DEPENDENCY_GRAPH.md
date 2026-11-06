# DEPENDENCY_GRAPH – SCAFFOLD OS

Erzeugt am 06.11.2026 per Skript aus Import-Anweisungen (ohne Testdateien). Dynamische Importe und require sind enthalten; Importe über Variablen oder Strings, die erst zur Laufzeit gebildet werden, nicht.

Dateien im Graph: 577; Abhängigkeitskanten: 1131

## Abhängigkeiten zwischen Bereichen (Anzahl importierender Dateipaare, ab 3)

| von | nach | Anzahl |
|---|---|---|
| app | lib (Wurzel) | 338 |
| app | lib/supabase | 79 |
| components (Wurzel) | lib (Wurzel) | 77 |
| components/cad | lib/cad | 51 |
| app | components (Wurzel) | 42 |
| app | lib/cad | 28 |
| app | components/aufmaß | 24 |
| lib/cad | lib/calculations | 18 |
| app | lib/calculations | 17 |
| app | components/cad | 17 |
| components/cad | lib/calculations | 16 |
| components/cad | lib (Wurzel) | 16 |
| app | lib/touren | 15 |
| components/cad | types | 11 |
| app | types | 9 |
| lib (Wurzel) | lib/calculations | 9 |
| app | lib/nwd | 8 |
| lib/export | lib (Wurzel) | 8 |
| app | lib/provision | 7 |
| components (Wurzel) | components/aufmaß | 7 |
| lib (Wurzel) | lib/supabase | 7 |
| lib/export | lib/geruest | 7 |
| lib/calculations | types | 6 |
| lib/export | lib/calculations | 6 |
| app | components/marketing | 5 |
| app | lib/export | 5 |
| app | components/rechnung | 5 |
| components/aufmaß | lib (Wurzel) | 5 |
| lib/cad | lib (Wurzel) | 5 |
| lib/geruest | lib/calculations | 5 |
| app | components/win | 4 |
| app | lib/actions | 4 |
| components (Wurzel) | lib/offline | 4 |
| components (Wurzel) | lib/supabase | 4 |
| components/aufmaß | components (Wurzel) | 4 |
| lib/actions | lib/supabase | 4 |
| lib (Wurzel) | types | 4 |
| lib/cad | types | 4 |
| app | lib/inventory | 3 |
| lib/actions | lib (Wurzel) | 3 |
| lib/cad | workers/ki | 3 |
| lib/calculations | lib (Wurzel) | 3 |
| lib/export | types | 3 |
| lib/geruest | lib (Wurzel) | 3 |
| lib/geruest | lib/cad | 3 |
| lib (Wurzel) | lib/cad | 3 |

## Meistgenutzte Module (nicht-Test-Importeure)

| Modul | genutzt von |
|---|---|
| lib/auth.ts | 113 |
| lib/supabase/server.ts | 80 |
| lib/calculations/cad-engine.ts | 46 |
| types/scaffold.ts | 23 |
| lib/vertrag-upload-client.ts | 19 |
| lib/supabase/client.ts | 18 |
| lib/rollen.ts | 18 |
| lib/rate-limit.ts | 14 |
| lib/validation.ts | 13 |
| lib/invoice-pdf.ts | 13 |
| lib/datum.ts | 12 |
| lib/baustellenmappe.ts | 12 |
| lib/aufmass-projekt-session.ts | 12 |
| lib/statik-daten.ts | 11 |
| lib/rechnung-position.ts | 11 |
| lib/cad/modell-aussehen.ts | 10 |
| lib/ansicht-link.ts | 10 |
| lib/nachtrag.ts | 9 |
| lib/miete.ts | 9 |
| lib/leistungsverzeichnis.ts | 9 |

## Module mit den meisten eigenen Abhängigkeiten

| Modul | nutzt |
|---|---|
| components/cad/BuildingForm.tsx | 29 |
| components/cad/Scaffold3D.tsx | 15 |
| components/cad/LvDialog.tsx | 12 |
| lib/export/statiker-paket.ts | 10 |
| lib/leistungsverzeichnis.ts | 9 |
| components/cad/BillOfMaterials.tsx | 9 |
| components/SchlussrechnungDialog.tsx | 9 |
| components/Baustellenmappe.tsx | 9 |
| lib/export/lastannahmen.ts | 8 |
| lib/geruest/regelpruefung.ts | 7 |
| components/SidebarLayout.tsx | 6 |
| components/ArbeitsschutzFormulare.tsx | 6 |
| lib/provision/orchestrate.ts | 5 |
| lib/geruest/richtwert-regeln.ts | 5 |
| lib/export/statik-excel.ts | 5 |
| lib/calculations/cad-engine.ts | 5 |
| lib/cad/projektdatei.ts | 5 |
| lib/cad/obj-mtl-zu-glb.ts | 5 |
| lib/cad/modell-analyse.ts | 5 |
| lib/cad/ifc-einleser.ts | 5 |

## Zyklische Abhängigkeiten
Gruppen mit gegenseitigen Importen (Dateiebene): 2

- 2 Dateien: lib/calculations/cad-engine.ts, lib/calculations/modell-stand.ts
- 2 Dateien: lib/geruest/regelpruefung.ts, lib/geruest/richtwert-regeln.ts

## Module ohne erkannten Importeur in lib, components, hooks
Das kann ungenutzten Code bedeuten, einen Aufruf über Laufzeit-Strings oder einen Einstieg (z. B. aus Workern oder Skripten). Nicht gelöscht, nur gemeldet.

ohne Importeur und ohne Test: 10; nur von Tests genutzt: 3

### ohne Importeur und ohne Test

- components/AuthNav.tsx (201 Zeilen)
- components/LogoutButton.tsx (26 Zeilen)
- components/MaterialReservieren.tsx (91 Zeilen)
- components/TerminBuchung.tsx (323 Zeilen)
- components/TransportAnlegen.tsx (91 Zeilen)
- components/dashboard/AlertFeed.tsx (90 Zeilen)
- components/dashboard/ProjectsTable.tsx (89 Zeilen)
- components/dashboard/StatsGrid.tsx (129 Zeilen)
- lib/actions/media.ts (107 Zeilen)
- lib/actions/project.ts (36 Zeilen)

### nur von Tests genutzt

- lib/cad/ifc-testmodelle.ts
- lib/cad/netz-csg.ts
- lib/lv-zuordnung.ts
