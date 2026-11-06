# TEST_COVERAGE_MAP – SCAFFOLD OS

Erzeugt am 06.11.2026 per Skript. "Direkt getestet" heißt: mindestens eine Testdatei importiert das Modul. Das ist keine Zeilenabdeckung und sagt nichts über die Güte der Tests.
Indirekt über andere Module getestete Dateien erscheinen hier als "nicht direkt".

Testdateien: 201

| Bereich | Module | direkt getestet | Anteil |
|---|---|---|---|
| components (Wurzel) | 46 | 0 | 0 % |
| components/aufmaß | 14 | 0 | 0 % |
| components/cad | 27 | 3 | 11 % |
| components/dashboard | 4 | 0 | 0 % |
| components/datenpflege | 2 | 0 | 0 % |
| components/lager | 2 | 0 | 0 % |
| components/landing | 2 | 0 | 0 % |
| components/marketing | 1 | 0 | 0 % |
| components/rechnung | 2 | 1 | 50 % |
| components/win | 3 | 0 | 0 % |
| hooks | 1 | 0 | 0 % |
| lib (Wurzel) | 119 | 86 | 72 % |
| lib/actions | 4 | 0 | 0 % |
| lib/cad | 58 | 53 | 91 % |
| lib/calculations | 14 | 11 | 79 % |
| lib/data | 2 | 2 | 100 % |
| lib/export | 11 | 6 | 55 % |
| lib/geruest | 4 | 4 | 100 % |
| lib/inventory | 1 | 0 | 0 % |
| lib/nwd | 4 | 3 | 75 % |
| lib/offline | 2 | 1 | 50 % |
| lib/provision | 6 | 0 | 0 % |
| lib/supabase | 2 | 0 | 0 % |
| lib/touren | 6 | 4 | 67 % |
| types | 6 | 2 | 33 % |
| workers/ki | 5 | 2 | 40 % |
| workers/punktwolke | 6 | 4 | 67 % |
| **gesamt** | **354** | **182** | **51 %** |

## Nicht direkt getestete Module mit mindestens 80 Zeilen (lib und hooks)

### lib (Wurzel)

- lib/auto-tour.ts (405 Zeilen)
- lib/media-client.ts (329 Zeilen)
- lib/notify.ts (222 Zeilen)
- lib/grundriss-parsing.ts (189 Zeilen)
- lib/pruefprotokoll-pdf.ts (153 Zeilen)
- lib/nachtrag-pdf.ts (144 Zeilen)
- lib/umdisposition.ts (138 Zeilen)
- lib/auth.ts (123 Zeilen)
- lib/lv-texte.ts (121 Zeilen)
- lib/mahnung-versand.ts (115 Zeilen)
- lib/ki-dsgvo.ts (100 Zeilen)
- lib/routing.ts (97 Zeilen)
- lib/team-vorschlag.ts (96 Zeilen)
- lib/verankerungsprotokoll-pdf.ts (88 Zeilen)
- lib/nachtrag-client.ts (88 Zeilen)

### lib/actions

- lib/actions/employees.ts (737 Zeilen)
- lib/actions/inventory.ts (383 Zeilen)
- lib/actions/media.ts (107 Zeilen)

### lib/cad

- lib/cad/ifc-grundriss.ts (270 Zeilen)
- lib/cad/praesentation-material.ts (125 Zeilen)
- lib/cad/treppen-geometrie.ts (90 Zeilen)

### lib/calculations

- lib/calculations/ki-rules.ts (499 Zeilen)
- lib/calculations/disposition.ts (333 Zeilen)
- lib/calculations/topology-graph.ts (124 Zeilen)

### lib/export

- lib/export/pdf-export.ts (446 Zeilen)
- lib/export/lv-export.ts (230 Zeilen)
- lib/export/ifc-export.ts (147 Zeilen)

### lib/inventory

- lib/inventory/buchung.ts (236 Zeilen)

### lib/provision

- lib/provision/orchestrate.ts (344 Zeilen)
- lib/provision/supabase-mgmt.ts (201 Zeilen)
- lib/provision/vercel.ts (152 Zeilen)

### lib/touren

- lib/touren/berechtigung.ts (82 Zeilen)

