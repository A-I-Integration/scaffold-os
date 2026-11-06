# DATA_FLOWS – SCAFFOLD OS

Stand: 06.11.2026, Etappe 1: Kette Aufmaß → CAD → Stückliste → LV → Angebot → Lager/Tour → Rechnung.
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

### 3.4 Leistungsverzeichnis (lib/leistungsverzeichnis.ts, Kopf und Signaturen gelesen; Rumpf der 876 Zeilen nicht gelesen)
- Ein LV rechnet nach **Fläche (m²), Länge (m), Stück und Zeit (Wochen)**, nicht nach Teilen.
- **Mengen kommen aus dem CAD-Modell.** Einheitspreise werden aus dem Materialwert der Stückliste und firmeneigenen Faktoren abgeleitet (Stundensatz, Mietsatz je Woche, Zuschlag). **Es gibt keine eingebauten Preise;** fehlt eine Angabe, meldet fehlendeAngaben das.
- Annahmen laut Kommentar: Fläche = Länge × Höhe ohne Abrechnungsregeln der ATV DIN 18451 (Mindestlängen, Abzüge; das regelt der Vertrag); Aufbau-/Abbaustunden wie in der Logistik-Anzeige, verteilt nach Materialwert; Vorhaltung je Woche = Materialwert × Mietsatz; Klassen nach DIN EN 12811-1 (Normtext nicht geprüft).
- Lastklassen im Code (kN/m²): 1 = 0,75; 2 = 1,5; 3 = 2,0; 4 = 3,0; 5 = 4,5; 6 = 6,0. Grundstandzeit 4 Wochen.
- Vier Stile: getrennt (Aufbau, Vorhaltung, Abbau als eigene Positionen), grundstandzeit (4 Wochen in der Aufbau-/Abbauposition), preisliste, statiker (Gliederung eines Auftraggeber-LV für Turmeinrüstungen).
- Der LV-Stil richtet sich nach dem Gebäude und gehört bewusst **nicht** zu den Firmenwerten, sonst bliebe die Gliederung eines früheren Projekts hängen (lv-firmenwerte.ts).
- Firmenfelder (gelten für die Firma, nicht für ein Angebot): auftragnehmer, stundensatzFach, stundensatzHelfer, mietsatzProzentJeWoche, zuschlagProzent, gesamtStandzeitWochen, mwstProzent, statikPauschale, baustelleneinrichtung, anfahrtspauschale, pauschalFaktorProzent.
- Standardpreise (EP, EP je Woche, Faktor %) gibt es für Positionen ohne CAD-Wert, z. B. Baustelleneinrichtung, Bauzaun, Genehmigung, Aufzug, Kederplane.
- Fremde LVs (z. B. eines Statikers): lib/lv-zuordnung.ts ordnet CAD-Werte einem fremden LV zu (nicht gelesen); lib/statiker-lv-einlesen.ts liest Angaben aus dessen Excel (nicht gelesen).

### 3.5 LV → Rechnung (lib/lv-zu-rechnung.ts, gelesen)
- Jede LV-Position wird eine Rechnungsposition. **Übersprungen** werden Positionen, die entfallen oder Menge 0 oder EP 0 haben; sie werden in einer Liste gemeldet.
- Mit Faktor in % (ungleich 100): Einzelpreis = Listenpreis × Faktor (preisMitFaktor), Gesamtpreis bleibt Menge × Einzelpreis. Wegen der **Cent-Rundung des Einzelpreises** kann die Rechnungssumme von der LV-Summe abweichen; die Differenz wird als rundungsDifferenz ausgewiesen.
- Die Rechnungsart (Miete, Regie, Konsolen, Auf-/Abbau, Gerüst ...) wird aus **Schlüsselwörtern im Kurztitel** abgeleitet (Reihenfolge = Vorrang). Titeländerungen können die Art ändern.

### 3.6 Angebotsannahme → Lager und Tour (lib/angebot-annahme.ts, die ersten 70 von 158 Zeilen gelesen)
- Wird **erst bei Annahme** ausgelöst, nicht beim Speichern, damit für nicht zustande gekommene Aufträge nichts reserviert wird (Entscheidung im Kommentar).
- Ausgelöst von app/api/public/angebot/route.ts (Kunde nimmt per Link an) und app/api/projects/route.ts (bei "echter Neu-Annahme"; dort auch Nachholen der Fahrt).
- Material (data.kiResult.materialList) wird nur bei **genauem Namens-Treffer** (ohne Groß-/Kleinschreibung) einem aktiven Lagerartikel zugeordnet, **kein unscharfes Raten**; Nicht-Treffer, zu wenig Bestand und verschiedene Einheiten werden gemeldet und nicht gebucht; Leistungen/Sonderteile (category Sonderteil oder articleNumber SONDER) werden bewusst nicht gebucht.
- Danach legt lib/auto-tour.ts eine Fahrt an. Die manuellen Knöpfe "Material reservieren" und "Transportauftrag anlegen" bleiben für Fälle ohne Treffer.

### 3.7 Schlussrechnung und Zwischenaufmaß (lib/schlussrechnung.ts, lib/zwischenaufmass.ts, je ca. die ersten 40 bis 55 Zeilen gelesen)
- Schlussrechnung: Basis "angebot" (Hauptposition = Angebotspreis: KI-/CAD-Kalkulation oder Festpreis × Fläche) oder "aufmass" (aufgemessene Fläche × Preis/m²), dazu Kran, Mietverlängerung, Nachtrag, Statik, Sonderrabatt und optional bestätigte Nachträge. Beträge netto; Rundung auf Cent.
- Zwischenaufmaß: je Stichtag wird die **kumulierte** Fläche festgehalten; abgerechnet wird **neue Menge = kumuliert (dieser Stichtag) − kumuliert (zuletzt abgerechnet)**.

## 4. Befunde

**F1 – Zwei getrennte Material-Engines (mittel).** Der CAD-Weg rechnet in lib/calculations/cad-engine.ts (2.704 Zeilen, generateBillOfMaterials). Der Aufmaß-Weg rechnet Material in lib/calculations/scaffold-engine.ts (calculateScaffoldMaterial, aufgerufen aus app/api/ki-material/route.ts und lib/gaeb.ts). Der Kommentar in aufmass-zu-cad.ts behauptet, dass nach der Übernahme Fläche und Stückliste mit dem Aufmaß übereinstimmen. **Kein Test importiert beide Engines** (geprüft per Textsuche), und der Test aufmass-zu-cad.test.ts prüft nach seinen Testnamen die Übernahme der Maße, nicht die Gleichheit der Stücklisten. Ob die Zahlen übereinstimmen, ist damit nicht belegt (Annahme: nicht durch Tests gesichert).

**F2 – Preise im Code (mittel, Produktregel).** scaffold-engine.ts hat eine feste Artikeltabelle (26 Artikel, 27 unitPrice-Zeilen, z. B. Rahmen 0,73 m mit 45,00 €), und lib/calculations/article-prices.ts nutzt "Fallback auf statische Preise, wenn DB leer". loadArticlePricesMitQuelle meldet, ob echte Lagerpreise oder feste Ersatzpreise verwendet wurden. Das widerspricht der Produktregel, dass Preise nur in den Firmendaten liegen und nicht im App-Code. Nicht geprüft: wie die Oberfläche den Fall "Ersatzpreise" zeigt und ob neue Kundeninstanzen ein gefülltes Lager haben.

**F3 – Übergabe Aufmaß → CAD über den Browser-Tab (niedrig).** Die Zwischenablage ist sessionStorage (CAD_UEBERNAHME_KEY, "nur dieser Browser-Tab"). Ein anderer Tab oder ein anderes Gerät hat sie nicht.

**F4 – Zuordnung Material → Lager über den genauen Namen (mittel, Schlussfolgerung).** Die Namen der Stückliste (aus cad-engine bzw. der Artikeltabelle in scaffold-engine) müssen exakt mit den Namen in der Lagertabelle der Firma übereinstimmen. Wird ein Lagerartikel umbenannt, bleibt die automatische Reservierung für diese Position aus; sie erscheint nur in der Rückmeldung (nichtGefunden). Die Schlussfolgerung beruht auf der Beschreibung im Kopf von angebot-annahme.ts; die Zuordnungslogik selbst (lib/lager-zuordnung.ts) wurde nicht gelesen.

**F5 – Rundung (niedrig).** LV-Summe und Rechnungssumme können wegen der Cent-Rundung des Einzelpreises abweichen; der Code weist die Differenz aus (rundungsDifferenz). Nicht geprüft: ob sie in der Oberfläche sichtbar ist.

## 5. Nicht gelesen (Etappe 2)

- Rumpf von lib/leistungsverzeichnis.ts (Zeilen 76 bis 876), Rumpf von cad-engine.ts, scaffold-engine.ts und alle Prüfregeln (cad-rules, DIN-Check, Statik-Prüfung)
- Aufmaß-Seiten Schritt 1 bis 6 im Detail, API-Routen /api/ki-material, /api/invoices, /api/projekt-lv
- lib/auto-tour.ts, lib/lager-zuordnung.ts, lib/inventory/buchung.ts (Lager- und Tourenlogik)
- lib/export (PDF/Excel/E-Rechnung), lib/gaeb.ts, lib/lv-zuordnung.ts, lib/statiker-lv-einlesen.ts
- Mietabrechnung, Standzeit-Abrechnung (Cron), Nachträge, Lohnabrechnung
