# DATA_FLOWS – SCAFFOLD OS

Stand: 06.11.2026, Etappe 1 und 2 (LV-Rechenkern, Lager/Tour): Kette Aufmaß → CAD → Stückliste → LV → Angebot → Lager/Tour → Rechnung.
Quelle ist der Code (Dateiköpfe, Kommentare, Funktionen). **Gelesen** heißt: die genannte Stelle wurde gelesen. **Nicht gelesen** wird ausdrücklich genannt.
Kommentare im Code beschreiben die Absicht der Entwickler, nicht automatisch das tatsächliche Verhalten; wo Tests fehlen, steht das dabei.

## 1. Überblick

```
Aufmaß (app/aufmass/schritt1..6)
  Schritt 1-3: step2 (Gebäudemaße, Dach, Abschnitte, Klassen), step3 (Gerüstsystem)
  Schritt 5:   Lieferung/Abholung   <- lieferMengenAusMaterialliste (Mengen aus der Materialliste)
  Schritt 6:   Angebot              <- uebernehmeMaterialBearbeitung (manuelle Mengen), aufmassZuCad (Knopf "ins CAD")
        |
        |  aufmassZuCad -> BuildingParams, Übergabe über sessionStorage (Schlüssel scaffold_cad_aus_aufmass, nur dieser Browser-Tab)
        v
CAD (app/cad/page.tsx)
  generateCADModel -> generateBillOfMaterials (Stückliste) -> wendeLagerAn (Lagerdaten der Firma) -> berechneCadKosten (Lohn, Transport)
  calculateLogistics, generateStatikExport
        |
        v
LV (components/cad/LvDialog.tsx)
  erzeugeLeistungsverzeichnis(quelle aus CAD-Modell, Eingaben) -> Leistungsverzeichnis
  -> Export PDF/Excel (lib/export/lv-export.ts), GAEB (lib/gaeb-export.ts)
  -> gespeicherte LVs je Baustelle (Tabelle projekt_lv, Route /api/projekt-lv, Komponente ProjektLv)
  -> rechnungAusLv -> Rechnungsentwurf (aufgerufen aus LvDialog und ProjektLv)

Angebot an Kunden (öffentlicher Link, app/api/public/angebot)
  Kunde: annehmen / Korrektur / ablehnen (lib/angebot-rueckmeldung.ts)
  Annahme -> beiAngebotsannahmeSicher(projectId)   [auch aus app/api/projects bei echter Neu-Annahme]
      -> Material reservieren (inventory, bucheAusZentrallager) + Transportauftrag/Tour (legeAutoTourAn)

Rechnung
  Schlussrechnung: baueRechnungsPositionen (Basis 'angebot' oder 'aufmass') + Kran, Miete, Nachtrag, Statik, Rabatt, Nachträge
  Zwischenaufmaß: kumulierte Fläche je Stichtag, abgerechnet wird nur die Differenz
  Rechnungsnummer: Datenbankfunktion next_invoice_number (Tabelle invoice_counters)
```

Parallel dazu gibt es einen zweiten Rechenweg für Material aus dem Aufmaß (siehe Abschnitt 4, Befund F1).

## 2. Wo die Daten liegen (belegt, soweit gelesen)

| Was | Ort | Beleg |
|---|---|---|
| Material-/Kostenergebnis des Projekts | projects.data.kiResult (materialList, building, systemId, totalAreaM2, suggestedPrice, totalCost ...) | angebot-annahme.ts liest data.kiResult.materialList; aufmass-zu-cad.ts liest kiResult.building und kiResult.systemId; schlussrechnung.ts nutzt totalAreaM2 und suggestedPrice |
| Angebotsstatus | projects.data.angebotsStatus | angebot-rueckmeldung.ts (Kopfkommentar), public/angebot/route.ts |
| Zwischenaufmaße | projects.data.zwischenaufmasse | zwischenaufmass.ts (Kopfkommentar: "keine Schema-Änderung") |
| Gespeicherte LVs je Baustelle | Tabelle projekt_lv (Felder u. a. version, art, titel, status, lv, summe_netto) | projekt-lv.ts; Arten: auftrag, bestellwerterhoehung, teilabbau, nachtrag; Status: entwurf, gueltig, abgerechnet |
| Firmenwerte und Standardpreise fürs LV | company_settings.lv_firmenwerte, company_settings.lv_standardpreise | lv-firmenwerte.ts (Kopfkommentar: gilt auf allen Geräten) |
| Lagerartikel | Tabelle inventory (sku, name, quantity, unit, unit_price, is_active) | angebot-annahme.ts, article-prices.ts |
| Rechnungsnummern | Datenbankfunktion next_invoice_number, Tabelle invoice_counters | API_MAP / DATABASE_MAP |
| Zwischenablage Aufmaß → CAD | sessionStorage des Browser-Tabs | aufmass-zu-cad.ts (CAD_UEBERNAHME_KEY) |

## 3. Rechenregeln und ihr Grund (aus Code-Kommentaren und Funktionen)

### 3.1 Aufmaß → CAD (lib/cad/aufmass-zu-cad.ts, gelesen; Tests: lib/cad/__tests__/aufmass-zu-cad.test.ts)
- **Fläche = Länge × Höhe je Abschnitt.** Weil das Aufmaß so rechnet, bekommt das CAD dieselbe Länge auf **einer** Seite (sides = front); laut Kommentar stimmen dann Fläche und Stückliste mit dem Aufmaß überein. Weitere Seiten schaltet man im CAD zu.
- **Fehlende Pflichtmaße werden gemeldet, nicht erfunden** (Länge, Breite/Tiefe, Höhe).
- **Projekt kam aus dem CAD:** das gespeicherte Gebäude wird übernommen (Umriss, Optionen, Balkone, Türen). **Geänderte Aufmaß-Werte haben Vorrang**, sonst käme eine Änderung nie im CAD an; jede Abweichung wird als Hinweis gezeigt. Mit Umriss (ab 3 Punkten) bleiben die Umriss-Maße.
- **Dachhöhe** = Höhe − Traufhöhe, nur bei Dachform ungleich Flachdach/kein und Traufhöhe kleiner als Höhe; sonst 0 mit Hinweis.
- **Klassen:** Lastklasse 1 bis 6 wird übernommen; die Breitenklasse (z. B. W06) setzt die Gerüstbreite nur, wenn das System eine Breite hat, die mindestens der Breitenklasse entspricht; sonst Hinweis "bitte im CAD prüfen".
- **Unbekanntes System oder Dachform:** Standard Layher Allround bzw. Flachdach, aber mit Hinweis.

### 3.2 Liefermengen, Schritt 5 (lib/lieferung-mengen.ts, gelesen)
- Bauteile in mehreren Größen (Rahmen, Bühnen, Diagonalen, Geländer) werden über **alle** passenden Zeilen addiert, nicht nur die erste.
- "Anker" zählt nur Anker-Zeilen. Früher zählte auch "Kupplung", und weil Kupplungen vor den Ankern stehen, bekam das Feld die Kupplungs-Menge (behobener Fehler laut Kommentar).

### 3.3 Materialliste im Angebot bearbeiten, Schritt 6 (lib/stueckliste-bearbeiten.ts, gelesen)
- Manuell geänderte Mengen werden ins Ergebnis übernommen, Gesamtkosten = Material + Lohn + Transport + Fahrt.
- Der Verkaufspreis behält das **bisherige Verhältnis zu den Gesamtkosten**. Nur ohne brauchbaren Ausgangswert gilt 25 % Aufschlag (Faktor 1,25). Früher wurde immer × 1,25 gesetzt, auch bei CAD-Angeboten, wo der Aufschlag 0 ist (reine Materialkosten).

### 3.4 Leistungsverzeichnis (lib/leistungsverzeichnis.ts, Kopf, Signaturen und Rechenkern gelesen; Statiker- und Preislisten-Stil nur über Kommentare)
- Ein LV rechnet nach **Fläche (m²), Länge (m), Stück und Zeit (Wochen)**, nicht nach Teilen.
- **Mengen kommen aus dem CAD-Modell.** Einheitspreise werden aus dem Materialwert der Stückliste und firmeneigenen Faktoren abgeleitet (Stundensatz, Mietsatz je Woche, Zuschlag). **Es gibt keine eingebauten Preise;** fehlt eine Angabe, meldet fehlendeAngaben das.
- Annahmen laut Kommentar: Fläche = Länge × Höhe ohne Abrechnungsregeln der ATV DIN 18451 (Mindestlängen, Abzüge; das regelt der Vertrag); Aufbau-/Abbaustunden wie in der Logistik-Anzeige, verteilt nach Materialwert; Vorhaltung je Woche = Materialwert × Mietsatz; Klassen nach DIN EN 12811-1 (Normtext nicht geprüft).
- Lastklassen im Code (kN/m²): 1 = 0,75; 2 = 1,5; 3 = 2,0; 4 = 3,0; 5 = 4,5; 6 = 6,0. Grundstandzeit 4 Wochen.
- Vier Stile: getrennt (Aufbau, Vorhaltung, Abbau als eigene Positionen), grundstandzeit (4 Wochen in der Aufbau-/Abbauposition), preisliste, statiker (Gliederung eines Auftraggeber-LV für Turmeinrüstungen).
- Der LV-Stil richtet sich nach dem Gebäude und gehört bewusst **nicht** zu den Firmenwerten, sonst bliebe die Gliederung eines früheren Projekts hängen (lv-firmenwerte.ts).
- Firmenfelder (gelten für die Firma, nicht für ein Angebot): auftragnehmer, stundensatzFach, stundensatzHelfer, mietsatzProzentJeWoche, zuschlagProzent, gesamtStandzeitWochen, mwstProzent, statikPauschale, baustelleneinrichtung, anfahrtspauschale, pauschalFaktorProzent.
- Standardpreise (EP, EP je Woche, Faktor %) gibt es für Positionen ohne CAD-Wert, z. B. Baustelleneinrichtung, Bauzaun, Genehmigung, Aufzug, Kederplane.
- Fremde LVs (z. B. eines Statikers): lib/lv-zuordnung.ts ordnet CAD-Werte einem fremden LV zu (nicht gelesen); lib/statiker-lv-einlesen.ts liest Angaben aus dessen Excel (nicht gelesen).

**Rechenkern von erzeugeLeistungsverzeichnis (Zeilen 292 bis 874 teils gelesen: Mengen, Materialwert, Preisformeln, Aufbau/Vorhaltung/Abbau, Faktor-Rangfolge; die Statiker- und Preislisten-Stile nur über ihre Kommentare)**

Mengen aus dem CAD-Modell:
- **Fläche (m²)** = CAD-Gesamtfläche + Höhenzuschlag (m) × Gesamtlänge − Öffnungsabzug (m²), nicht kleiner als 0, auf 2 Stellen gerundet. Höhenzuschlag und Öffnungsabzug gibt der Nutzer ein; **es sind keine Normwerte voreingestellt**.
- Giebelflächen der Dachgauben (m²) sind eine **Zulage**, nicht im CAD. Konsolen (m) und Schutzdach (m) = Summe der Komponentenlängen im Modell; Treppen (Stück) = Anzahl der Treppen-Komponenten.

Materialwert je Gruppe (aus der Stückliste, nach Artikelnummer): KO- = Konsolen, SD- = Schutzdach, SP-001, ST-001, ST-002 = Treppe, alles andere = Gerüst. Die Aufbau- und Abbaustunden werden **im Verhältnis des Materialwerts** auf die Gruppen verteilt.

Preisformeln (alle auf Cent gerundet; faktor = 1 + Zuschlag in %):
- EP Aufbau bzw. Abbau = Stunden der Gruppe × Stundensatz Fach × faktor ÷ Menge (in diesen Formeln wird nur der Stundensatz Fach verwendet; wo der Stundensatz Helfer eingeht, steht in den nicht gelesenen Zeilen)
- EP Vorhaltung je Woche = Materialwert der Gruppe × Mietsatz (% je Woche) ÷ 100 × faktor ÷ Menge
- Stil grundstandzeit: EP = (Stunden × Stundensatz Fach + Materialwert × Mietsatz × 4 Wochen) × faktor ÷ Menge
- Vorhaltungsmenge = Menge × Gesamtstandzeit in Wochen; entfällt bei Menge 0 oder Standzeit 0
- GP = Menge × EP × Faktor ÷ 100. **Vorhaltung und Stundenlohn (Titel 12) bekommen keinen Faktor.**

Anpassen von Hand (Schlüssel = Kurztitel der Position, "bleibt stabil, wenn sich die Nummern verschieben"): Menge, EP, Faktor, Streichen (Menge 0, Nummer bleibt). Die Position merkt sich `manuell` und die berechneten Werte (`berechnet`) zum Zurücksetzen.
**Rangfolge des Faktors:** von Hand je Position > Standardpreis-Faktor aus der Datenpflege je Position > allgemeiner Pauschalfaktor > 100.

Fehlende Preise: Standardpreise aus der Datenpflege füllen nur dort, wo sonst 0 € stehen würde. Positionen mit Menge und ohne Preis bleiben "offen" und stehen in fehlendeAngaben (Stil preisliste: nur, was in der Liste wirklich fehlt).

Herkunftsnachweis (`herkunft`): Modellstand-Hash plus Fingerabdrücke von Stückliste, Stunden und LV-Einstellungen. Status ok, abweichung oder unbekannt; bei Abweichung (Stückliste oder Stunden gehören zu einem anderen Modellstand) erscheint eine Meldung in fehlendeAngaben. Bei von Hand eingegebenen Stunden gibt es keine Prüfung.

Stil "statiker" (Gliederung eines Auftraggeber-LV für Turmeinrüstungen, Zeilen 496 bis 679, nur Kommentare gelesen): Das CAD wird für den 2. Bauabschnitt auf die Rückbauhöhe gekappt (Standard 21,5 m, wenn leer; Reserve darüber auf die nächste Lagenoberkante gerundet); die Plane des 1. BA zählt nur oberhalb der Teilungshöhe minus Überlappung, damit keine Fläche doppelt gerechnet wird; ein gemessener Anbau hat Vorrang, sonst Rückfall auf das Dach des angrenzenden Gebäudeteils (Wandlänge × 1,5 m ÷ cos Neigung, Annahme laut Kommentar); der Aufzug im 2. BA wird nicht gekappt (Vorhaltung wie im 1. BA, nur mit der Standzeit des 2. BA).

### 3.5 LV → Rechnung (lib/lv-zu-rechnung.ts, gelesen)
- Jede LV-Position wird eine Rechnungsposition. **Übersprungen** werden Positionen, die entfallen oder Menge 0 oder EP 0 haben; sie werden in einer Liste gemeldet.
- Mit Faktor in % (ungleich 100): Einzelpreis = Listenpreis × Faktor (preisMitFaktor), Gesamtpreis bleibt Menge × Einzelpreis. Wegen der **Cent-Rundung des Einzelpreises** kann die Rechnungssumme von der LV-Summe abweichen; die Differenz wird als rundungsDifferenz ausgewiesen.
- Die Rechnungsart (Miete, Regie, Konsolen, Auf-/Abbau, Gerüst ...) wird aus **Schlüsselwörtern im Kurztitel** abgeleitet (Reihenfolge = Vorrang). Titeländerungen können die Art ändern.

### 3.6 Angebotsannahme → Lager und Tour (lib/angebot-annahme.ts vollständig, lib/lager-zuordnung.ts vollständig, Köpfe von lib/inventory/buchung.ts und lib/auto-tour.ts gelesen)
- **Auslöser:** (a) Kunde nimmt per Link an (app/api/public/angebot/route.ts, nur bei art "annehmen"; eine zweite Antwort auf ein angenommenes Angebot wird mit 409 abgelehnt); (b) app/api/projects/route.ts, wenn data.angebotsStatus von "nicht angenommen" auf "angenommen" wechselt (Zeile 209), nicht bei jedem weiteren Speichern. Es läuft nach der Antwort (after()) und fängt Fehler ab (beiAngebotsannahmeSicher).
- **Erst bei Annahme**, nicht beim Speichern: damit für nicht zustande gekommene Aufträge nichts reserviert wird (Entscheidung im Kommentar).
- **Zuordnung Materialzeile → Lagerartikel (lager-zuordnung.ts):** erst über die **Artikelnummer** (materialList.articleNumber = inventory.sku), dann nur bei genau gleichem Namen (ohne Groß-/Kleinschreibung, getrimmt). **Kein unscharfes Raten.** Hinweis: Der Kopfkommentar von angebot-annahme.ts nennt nur den Namen, die Funktion prüft zuerst die Artikelnummer; ein früherer Stand dieses Dokuments hat dem Kopfkommentar geglaubt.
- **Einheiten:** Sind beide Einheiten vorhanden und verschieden (nach Normalisierung, z. B. Stk, Stück, St = Stück; m², qm = m²), wird nichts gebucht, die Zeile erscheint unter einheitenKonflikt. Fehlt eine Einheit, wird nicht blockiert.
- **Leistungen und Sonderteile** (category Sonderteil oder articleNumber SONDER) werden bewusst nicht gebucht.
- **Buchung je Zeile** über lib/inventory/buchung.ts (eine zentrale Funktion für die manuelle Reservierung, den Transportauftrag und die Annahme-Automatik): Bestand prüfen, **atomar verringern** (optimistic lock laut Kopf), site_stock-Reservierung anlegen, in inventory_transactions protokollieren. Zu wenig Bestand → Zeile unter nichtGenugBestand, nichts gebucht.
- **Transportauftrag je gebuchter Zeile** (transport_orders, Status pending). Danach legt lib/auto-tour.ts **eine Tour** an (Status planned, am Projektbeginn aus data.step1.projektbeginn, Fahrzeug nach Gewicht, Fahrer = freier Mitarbeiter; Regeln in lib/auto-tour-wahl.ts, nicht gelesen). Findet sich nichts Passendes, gibt es keine Tour, sondern einen Hinweis.
- **Ergebnis** wird in projects.data.lagerAutomatikErgebnis gespeichert (reserviert, transportAngelegt, nichtGefunden, nichtGenugBestand, einheitenKonflikt, leistungen, tour, hinweis, fehler); laut Kommentar sichtbar im Kunden-Detail. Das Speichern ist "best-effort": schlägt es fehl, wird der Fehler verschluckt.
- Die manuellen Knöpfe "Material reservieren" und "Transportauftrag anlegen" bleiben für Fälle ohne Treffer.

### 3.7 Schlussrechnung und Zwischenaufmaß (lib/schlussrechnung.ts, lib/zwischenaufmass.ts, je ca. die ersten 40 bis 55 Zeilen gelesen)
- Schlussrechnung: Basis "angebot" (Hauptposition = Angebotspreis: KI-/CAD-Kalkulation oder Festpreis × Fläche) oder "aufmass" (aufgemessene Fläche × Preis/m²), dazu Kran, Mietverlängerung, Nachtrag, Statik, Sonderrabatt und optional bestätigte Nachträge. Beträge netto; Rundung auf Cent.
- Zwischenaufmaß: je Stichtag wird die **kumulierte** Fläche festgehalten; abgerechnet wird **neue Menge = kumuliert (dieser Stichtag) − kumuliert (zuletzt abgerechnet)**.

## 4. Befunde

**F1 – Zwei getrennte Material-Engines liefern verschiedene Stücklisten (hoch, gemessen).** Der CAD-Weg rechnet in lib/calculations/cad-engine.ts (generateBillOfMaterials), der Aufmaß-Weg in lib/calculations/scaffold-engine.ts (calculateScaffoldMaterial, aufgerufen aus app/api/ki-material/route.ts und lib/gaeb.ts). Beide Engines wurden am 06.11.2026 mit denselben Gebäuden ausgeführt (flaches Dach, eine Seite; CAD-Weg über aufmassZuCad mit System layher-allround; Ausführung in Node mit dem TypeScript-Compiler, nicht in Vitest):

| Gebäude | Fläche beide | Material Aufmaß | Material CAD | CAD/Aufmaß | Gewicht Aufmaß / CAD | Rahmen A / C | Diagonalen A / C | Kupplungen A / C | Anker A / C |
|---|---|---|---|---|---|---|---|---|---|
| 8 × 4,5 m | 36 m² | 5.700 € | 4.853 € | 0,85 | 1.474 / 1.242 kg | 24 / 18 | 24 / 6 | 48 / 18 | 4 / 0 |
| 12 × 7,5 m | 90 m² | 9.760 € | 7.804 € | 0,80 | 2.498 / 2.044 kg | 40 / 32 | 40 / 8 | 80 / 32 | 7 / 4 |
| 20 × 10,5 m | 210 m² | 22.131 € | 17.667 € | 0,80 | 5.752 / 4.753 kg | 96 / 84 | 96 / 21 | 192 / 84 | 16 / 12 |
| 30 × 15 m | 450 m² | 44.484 € | 31.839 € | 0,72 | 11.498 / 8.680 kg | 192 / 160 | 192 / 40 | 384 / 160 | 32 / 20 |
| 40 × 19,5 m | 780 m² | 73.843 € | 59.774 € | 0,81 | 19.096 / 15.647 kg | 320 / 280 | 320 / 70 | 640 / 280 | 54 / 35 |

Ergebnis: **Die Fläche stimmt in allen fünf Größen exakt überein** (der Kommentar in aufmass-zu-cad.ts trifft dafür zu). **Die Stücklisten stimmen nicht überein:** Das Material im CAD-Weg ist 15 bis 28 % günstiger, das Gewicht 12 bis 24 % geringer. Der Aufmaß-Weg rechnet pro Feld und Lage 2 Diagonalen (aFields × aLevels × 2), der CAD-Weg erzeugt deutlich weniger. Im CAD-Weg fehlen Kupplungen im gleichen Umfang; dafür hat er Teile, die der Aufmaß-Weg nicht hat (Querriegel, Eckverbindungen, Lastverteilplatten, Treppenstufen und -podeste), und der Aufmaß-Weg hat Seitenschutznetz und Spindeltreppen. Die Rahmen- und Belagsartikel haben bei gleicher Artikelnummer unterschiedliche Namen (z. B. RA-002: "Rahmen 1,09 m" im Aufmaß-Weg, "Rahmen 2.79m" im CAD-Weg). Für denselben Auftrag kann der Preis je nach Weg um ein Fünftel abweichen. **Welche Stückliste fachlich stimmt, kann ich nicht beurteilen;** das gehört zur Statik und zur Zulassung des Systems.

Anker (Beispiel mit möglichem Sicherheitsbezug): Bei 8 × 4,5 m listet der CAD-Weg keinen Anker, der Aufmaß-Weg 4. Ein Kommentar in cad-engine.ts (Zeile 1801) nennt "Verankerungen: ab 6 m Gebäudehöhe, jedes zweite Feld, jede zweite Lage". Ob die Regel zulässig ist, ist nicht geprüft und nicht meine Entscheidung.

Abgesichert ist jetzt: Fläche gleich und gleicher Preis je Artikelnummer (Test lib/calculations/__tests__/engine-abgleich.test.ts auf dem Branch test/engine-abgleich); die Gleichheit der Stücklisten steht als it.todo.

**F2 – Preise im Code (mittel, Produktregel).** scaffold-engine.ts hat eine feste Artikeltabelle (26 Artikel, 27 unitPrice-Zeilen, z. B. Rahmen 0,73 m mit 45,00 €), und lib/calculations/article-prices.ts nutzt "Fallback auf statische Preise, wenn DB leer". loadArticlePricesMitQuelle meldet, ob echte Lagerpreise oder feste Ersatzpreise verwendet wurden. Das widerspricht der Produktregel, dass Preise nur in den Firmendaten liegen und nicht im App-Code. Nicht geprüft: wie die Oberfläche den Fall "Ersatzpreise" zeigt und ob neue Kundeninstanzen ein gefülltes Lager haben.

Nachtrag (06.11.2026): Die Preise stehen an mindestens **drei Stellen im Code**: scaffold-engine.ts (ARTICLE_DB, 26 Artikel), article-prices.ts (FALLBACK_PRICES) und cad-engine.ts (getUnitPrice, getWeightKg, getRecommendation ab Zeile 1875). Für alle gemeinsamen Artikelnummern sind die Preise heute gleich (durch Test belegt); die Gleichheit hängt aber an Handarbeit. In cad-engine.ts gilt für unbekannte Artikelnummern ein Vorgabewert (10 € und 5 kg); in der geprüften Standard-Stückliste (19 Artikel, 12 × 7,5 m) griff er nicht, ob andere Gebäude (Brücke, Turm, Aufzug) ihn auslösen, ist nicht geprüft.

**F3 – Übergabe Aufmaß → CAD über den Browser-Tab (niedrig).** Die Zwischenablage ist sessionStorage (CAD_UEBERNAHME_KEY, "nur dieser Browser-Tab"). Ein anderer Tab oder ein anderes Gerät hat sie nicht.

**F4 – Zuordnung Material → Lager (niedrig, korrigiert).** Die Zuordnung läuft zuerst über die Artikelnummer und erst danach über den genauen Namen. Voraussetzung für die automatische Reservierung ist also, dass die Artikelnummern der Stückliste (z. B. RA-001) mit den SKUs im Lager der Firma übereinstimmen oder die Namen exakt gleich sind. Eine Firma mit eigenen SKUs und abweichenden Namen bekommt keine automatische Reservierung; das erscheint nur in der Rückmeldung (nichtGefunden). Das ist ein Zusammenhang mit F2 (feste Artikelnummern und Namen aus scaffold-engine.ts).

**F5 – Rundung (niedrig).** LV-Summe und Rechnungssumme können wegen der Cent-Rundung des Einzelpreises abweichen; der Code weist die Differenz aus (rundungsDifferenz). Nicht geprüft: ob sie in der Oberfläche sichtbar ist.

**F6 – Fehlgeschlagener Transportauftrag wird nicht gemeldet (mittel).** In angebot-annahme.ts wird nach erfolgreicher Reservierung der Transportauftrag per POST angelegt; nur bei Erfolg (`transRes.ok`) wird er vermerkt. Schlägt der POST fehl, gibt es keinen else-Zweig und keine Meldung: Das Material ist reserviert, aber kein Transportauftrag existiert und die Tour enthält die Position nicht. (Aus dem Code gelesen, nicht ausgeführt.)

**F7 – Keine Rückabwicklung bei Teilfehlern (niedrig, Schlussfolgerung).** Die Reservierungen laufen zeilenweise. Wird die Annahme später widerrufen oder bricht der Lauf mitten in der Liste ab, bleiben bereits gebuchte Zeilen bestehen. Dass es keine Rückabwicklung gibt, ist aus dem Code abgeleitet (keine solche Funktion in angebot-annahme.ts gelesen), nicht durch Test belegt. Offen: Was passiert, wenn der Status von "angenommen" auf etwas anderes und wieder zurück auf "angenommen" gesetzt wird; die Bedingung (Zeile 209) löst dann erneut aus, ob doppelt gebucht wird, ist nicht geprüft.

**F8 – Das Ergebnis der Annahme-Automatik wird nirgends angezeigt (mittel).** projects.data.lagerAutomatikErgebnis (reserviert, nichtGefunden, nichtGenugBestand, einheitenKonflikt, tour, hinweis, fehler) wird gespeichert, aber keine Datei in app/, components/ oder hooks/ liest es (Textsuche im ganzen Repo: nur lib/angebot-annahme.ts, lib/auto-tour.ts und ein Lesezugriff in app/api/projects/route.ts für das Nachholen der Fahrt). Der Kommentar in angebot-annahme.ts behauptet, das Ergebnis sei im Kunden-Detail sichtbar. Damit bleiben nicht gefundene Artikel, fehlender Bestand und Einheitenkonflikte unbemerkt, solange niemand die Datenbank liest. Fix vorbereitet auf dem Branch fix/annahme-ergebnis-sichtbar (Anzeige an der Auftrags-Karte); Vitest-Lauf steht noch aus.

## 5. Nicht gelesen (Etappe 3)

- Statiker- und Preislisten-Stil des LV im Detail (Zeilen 496 bis 840), Stundenlohn-Titel, geruestText, Kopfzeilen
- cad-engine.ts-Rumpf (Geometrie, Stückliste, Logistik-Stunden, Statik-Export), scaffold-engine.ts-Rumpf, Prüfregeln (cad-rules, DIN-Check)
- Aufmaß-Seiten Schritt 1 bis 6 im Detail, API-Routen /api/ki-material, /api/invoices, /api/projekt-lv
- lib/auto-tour-wahl.ts, lib/touren, lib/export (PDF/Excel/E-Rechnung), lib/gaeb.ts, lib/lv-zuordnung.ts, lib/statiker-lv-einlesen.ts
- Mietabrechnung, Standzeit-Abrechnung (Cron), Nachträge, Lohnabrechnung
