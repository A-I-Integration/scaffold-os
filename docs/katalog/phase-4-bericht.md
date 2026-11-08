# Herstellerdatenbank – Bericht nach Phase 4 (Import-Engine und Datenbankstruktur)

Branch: `hersteller-katalog` (auf `origin/main`). Bestehende Verbraucher (Aufmaß, Disposition, Angebot) und `article-prices.ts` sind **nicht geändert**.

## Geänderte und neue Dateien
| Bereich | Datei |
|---|---|
| Migration | `supabase/phase-107-hersteller-katalog.sql` |
| Engine | `lib/katalog/{typen,normalisieren,kategorien,import,adapter-bestand,adapter-tabelle,schreiben}.ts` |
| API | `app/api/katalog/import/route.ts` (Admin + Dispo, Trockenlauf Standard), `app/api/katalog/freigabe/route.ts` (Freigabe nur Admin) |
| Quellen | `scripts/katalog-quellen-abgleich.py`, `lib/data/katalog-quellen.json` (PDF-SHA-256, Seiten je Artikel) |
| Auswertung | `scripts/katalog-importlauf.ts`, `docs/katalog/importlauf-ergebnis.json`, `docs/katalog/fallback-gewichte-analyse.md` |
| Tests | `lib/katalog/__tests__/import.test.ts` (38), `app/api/katalog/__tests__/freigabe.test.ts` (5) |

## Migration (phase-107)
Neue Tabellen: `hersteller`, `geruestsysteme`, `material_kategorien`, `katalog_dokumente`, `katalog_artikel`, `katalog_artikel_historie`, `import_laeufe`, `import_zeilen`, `gewicht_messungen`.
Einzige Änderung an Bestehendem: **eine neue, leere, optionale Spalte** `inventory.katalog_artikel_id`. Lagerbestände, SKU, `site_stock` und `inventory_transactions` bleiben unverändert (per Test abgesichert).
Schutz in der Datenbank: Rohwerte/Original-Nummer/Hersteller/System/Dokument unveränderlich; Freigabe nur durch Rolle `admin`, nur nach Prüfung, nur bei geklärter Gewichtsart; Gewichtsänderung entzieht die Freigabe; Verlauf per Trigger; kein Löschrecht; RLS (Lesen Lager-Rollen, Schreiben Admin/Dispo).
SCAFFOLD WM: `gewicht_messungen` ist getrennt vom Katalog und über `material_id = katalog_artikel.id` verbunden; Messungen sind beim Anlegen nie für Berechnungen freigegeben.
Hinweis: nicht gegen eine echte Datenbank ausgeführt, nur Syntaxprüfung (pglast, inkl. PL/pgSQL). Bitte zuerst in einer Testumgebung ausführen.

## Importergebnis (Trockenlauf über die vorhandenen Kataloge, nichts geschrieben)
| Hersteller | Zeilen | neu | unsicher | Dublette | Fehler |
|---|---|---|---|---|---|
| MJ-Gerüst | 3268 | 3230 | 37 | 1 | 0 |
| SCAFOM-RUX | 1746 | 1695 | 50 | 1 | 0 |
| Layher | 1652 | 1618 | 34 | 0 | 0 |
| **Summe** | **6666** | 6543 | 121 | 2 | 0 |

Gewichte: 1593 als „ca.“ (Quelle „ca. kg“), 4696 als **Herstellerangabe, Art ungeklärt**, 377 ohne Gewicht. Alle `ungeprueft` / `nicht_freigegeben`.
Kategorien (Vorschlag per Schlüsselwort): 3279 sicher, 1507 unsicher, 1880 unbekannt (landen in „Sonstige“, manuelle Prüfung).

## Eindeutigkeit der Artikelnummern
- Dieselbe Nummer bei mehreren Herstellern: **0**.
- Nummern, die in mehreren Dokumenten/Listen eines Herstellers stehen: 1292; davon **78 mit abweichenden Gewichten** → bleiben als getrennte Einträge je Dokument erhalten.
- Im selben Dokument doppelt: **2** (MJ `016375` Aluminiumsteg 4 m/40 kg gegen 5 m/50 kg; SCAFOM `00664`, nur Preis abweichend). Die erste Zeile wird zur Prüfung markiert, die zweite steht im Protokoll (`import_zeilen.roh`). Nichts geht verloren.
- Suffixe: 15 Nummern mit Endbuchstaben (U, Q, L, n); 5 Basisnummern kommen in mehreren Schreibweisen vor (z. B. `01566`). 34 Zeilen enthalten mehrere Nummern in einer Zeile → unsicher, nicht aufgeteilt.

## Quellen (PDFs)
Alle 25 Preislisten-PDFs lagen vor; SHA-256 und Seitenzahl gespeichert. Seitenzuordnung per Textvergleich: 6413 eindeutig, 237 auf mehreren Seiten, 16 nicht gefunden (opti-rack-Flyer). Dokumentversion nur, wenn sie im Dateinamen steht (MJ „V2.4“); bei Layher/SCAFOM nicht erfunden (leer).

## Tests
Gesamte Suite: 208 Dateien, 1699 Tests grün (vor den 5 Freigabe-Tests). Neu: 43 Tests, abgedeckt sind die zehn geforderten Punkte (Import, Suffixe, Dubletten, Gewichtszuordnung, fehlende Werte, Einheiten, mehrere Hersteller, Baustellen-Zuordnung, Lagerkompatibilität, WM-Trennung). Lint und Typprüfung für die neuen Dateien sauber.

## Offene Probleme
1. Gewichtsart bei MJ/Layher ungeklärt (bewusst, laut Freigabe). Wer klärt sie je Hersteller, und woran erkennt man sie?
2. Layher: Das Einleseskript hat Suffixbuchstaben (W/P/w/p) verworfen. Eine neue Extraktion aus den PDFs ist nötig, um Originalnummern vollständig zu erhalten.
3. 78 Nummern mit abweichenden Gewichten je Dokument und die 2 Dubletten brauchen eine fachliche Entscheidung.
4. 1880 Artikel ohne sichere Kategorie, 377 ohne Gewicht, 34 Kombinationsnummern.
5. Die Zuordnung „Liste = System“ und „Zubehör-Liste = systemfrei“ ist meine Annahme (im Protokoll änderbar).
6. Migration noch nicht in einer echten Supabase-Umgebung gelaufen; RLS und Trigger dort testen.
7. `article-prices.ts`-Ersatzgewichte (inkl. 10-kg-Annahme) und der zweite Bestand in `scaffold-engine.ts` bleiben bis zum kontrollierten Ersatz bestehen.
8. Noch nicht gebaut: Oberfläche (Phase 5), WM-Anbindung (Phase 6), PDF-Import.
