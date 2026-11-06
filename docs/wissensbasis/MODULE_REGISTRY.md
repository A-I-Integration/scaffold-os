# MODULE_REGISTRY – SCAFFOLD OS

Erzeugt am 06.11.2026 per Skript aus den versionierten Dateien (lib, components, hooks, types, workers; ohne Tests).
Beschreibung = erste Kommentarzeilen am Dateikopf (Originaltext aus dem Code, nicht von uns bewertet). Leer = Datei hat keinen Kopfkommentar.
Abhängigkeiten stammen aus Import-Anweisungen (statisch und dynamisch). "Tests" = Testdateien, die das Modul direkt importieren (kein Zeilenabdeckungsgrad).
Nicht enthalten: Seiten und API-Routen (siehe SYSTEM_MAP.md und API_MAP.md); Datenbanktabellen je Modul (noch nicht zugeordnet).

Module: 354 in 27 Bereichen

## components (Wurzel) (46 Dateien, 7011 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| components/AngebotRueckmeldungHinweis.tsx | 26 |  | AngebotRueckmeldungHinweis | 1 | app 2 | 0 |
| components/AnsichtLinkBox.tsx | 106 | 3D-Link (nur lesend) für ein CAD-Projekt: anlegen, kopieren, widerrufen. – Der Link zeigt nur Modell, Kennzahlen und Stückliste OHNE Preise. | AnsichtLinkBox | 0 | app 1 | 0 |
| components/AnsichtViewer.tsx | 181 |  | AnsichtDaten, AnsichtViewer | 4 | app 2 | 0 |
| components/ArbeitsschutzFormulare.tsx | 135 |  | Pflichtenuebertragung, Betriebsanweisung | 6 | components 1 | 0 |
| components/AufmassDemo.tsx | 238 |  | AufmassDemo | 0 | app 1 | 0 |
| components/AuftragsTeam.tsx | 101 | SCAFFOLD OS – Mitarbeiter-Auftrags-Zuordnung (Phase 28) | AuftragsTeam | 1 | app 2 | 0 |
| components/Auftragsstand.tsx | 271 | Gesamtübersicht einer Baustelle: Auftragswert, Teilrechnungen (z. B. 70/30), Nachträge/Verlängerungen, – bezahlt/offen. Alle Rechnungen sind anklickbar. Die Zahlen kommen aus den vorhandenen Daten; es wird nichts doppelt gepflegt. | Auftragsstand | 5 | app 1 | 0 |
| components/AuthNav.tsx | 201 |  | AuthNav | 3 | – | 0 |
| components/BauphasenBlock.tsx | 191 | SCAFFOLD OS – Bauphasen (Kundenseite, beim Auftrag) – Aufbau-/Abbau-Termine, Teilrückbau, Kostenaufteilung (z. B. 65 % Aufbau), Lager und Personal. | BauphasenBlock | 4 | app 1 | 0 |
| components/Baustellenmappe.tsx | 178 | SCAFFOLD OS – Baustellenmappe (Reiter in der Baustelle) – Unterlagen je Baustelle ablegen, für die Mappe freigeben, QR-Code/Link für das | Baustellenmappe | 9 | app 1 | 0 |
| components/BesucherZaehler.tsx | 46 | SCAFFOLD OS – Besucherzähler (Browser-Teil, nur Master-Website) | BesucherZaehler | 0 | app 1 | 0 |
| components/CookieBanner.tsx | 133 | SCAFFOLD OS – Cookie-/Einwilligungs-Banner (DSGVO/TTDSG) | CookieBanner | 0 | components 1 | 0 |
| components/CookieBannerWrapper.tsx | 20 | CookieBannerWrapper.tsx – Client Component Wrapper | CookieBannerWrapper | 1 | app 1 | 0 |
| components/EmailVerlaufDialog.tsx | 94 | SCAFFOLD OS – E-Mail-Verlauf: versendete Mail ansehen + erneut senden – Inhalt/Anhang gibt es nur für Mails ab Phase 97 (ältere: nur Kopfdaten). | EmailVerlaufEintrag, EmailVerlaufDialog | 1 | app 1, components 1 | 0 |
| components/FreigabeBadge.tsx | 31 | Lädt den Freigabe-Status für mehrere Baustellen in einem Aufruf. | useFreigabeStatus, FreigabeBadge | 1 | app 2 | 0 |
| components/Gefaehrdungsbeurteilung.tsx | 87 |  | Gefaehrdungsbeurteilung | 5 | components 1 | 0 |
| components/Geruestpruefung.tsx | 170 |  | Geruestpruefung | 5 | components 1 | 0 |
| components/KiHinweis.tsx | 18 | SCAFFOLD OS – KI-Hinweis (EU AI Act, Art. 4 / Art. 50) | KiHinweis | 0 | app 3, components 4 | 0 |
| components/KundeAuftrag.tsx | 364 | SCAFFOLD OS – Auftrags-Karte für die Kunden-Seite (Phase 20) | KundeAuftrag | 5 | app 1 | 0 |
| components/KundeEmails.tsx | 139 | SCAFFOLD OS – "E-Mails"-Register bei Kunden (Phase 48) | KundeEmails | 0 | app 1 | 0 |
| components/KundenKontakte.tsx | 100 | SCAFFOLD OS – Mehrere Kunden-Ansprechpartner (Phase 28) | KundenKontakte | 0 | app 1 | 0 |
| components/LandingHeader.tsx | 81 | Wechselnde Aussagen in der Leiste über dem Menü (Texte der Geschäftsführung). | LandingHeader | 1 | app 3, components 1 | 0 |
| components/LogoutButton.tsx | 26 |  | LogoutButton | 2 | – | 0 |
| components/MaterialReservieren.tsx | 91 | SCAFFOLD OS – Material-Reservierung beim Angebot (Phase 51) | MaterialReservieren | 0 | – | 0 |
| components/NachtraegeBlock.tsx | 318 |  | NachtraegeBlock | 4 | app 1, components 1 | 0 |
| components/NeueMailDialog.tsx | 188 | SCAFFOLD OS – "Neue Mail" beim Kunden (E-Mails-Reiter) | NeueMailDialog | 3 | app 1 | 0 |
| components/OfflineUnterstuetzung.tsx | 62 | SCAFFOLD OS – Offline-Unterstützung: meldet den Service Worker an (nur Produktion) und zeigt eine Leiste, solange kein Netz da ist. – Die Leiste sagt ehrlich, was geht: CAD-Rechnen ja, Server-Funktionen (Speichern im Projekt, KI,  | OfflineUnterstuetzung | 4 | app 1 | 0 |
| components/PostfachEinstellungen.tsx | 234 | SCAFFOLD OS – "Mein E-Mail-Postfach" (je eingeloggtem Nutzer) | PostfachEinstellungen | 1 | app 1 | 0 |
| components/ProductTour.tsx | 118 | SCAFFOLD OS – Produkt-Tour für neue Nutzer (Phase 47) | ProductTour | 0 | components 1 | 0 |
| components/ProjektDokumentation.tsx | 523 | SCAFFOLD OS – Projekt-Dokumentation (Phase 18) | ProjektDokumentation | 5 | app 2 | 0 |
| components/ProjektLv.tsx | 135 | Gespeicherte Leistungsverzeichnisse einer Baustelle: ansehen, ändern, als Version kopieren, abrechnen. | ProjektLvBlock | 4 | app 1 | 0 |
| components/ProjektZeiten.tsx | 111 | Zeiten einer Baustelle: ansehen, korrigieren, nachtragen (nur Chef/Disposition dürfen ändern). | ProjektZeiten | 0 | app 1 | 0 |
| components/Pruefschild.tsx | 91 |  | Pruefschild | 3 | components 1 | 0 |
| components/RechnungAktionen.tsx | 88 | Aktionsleiste je Rechnung: die häufigen Schritte als beschriftete Knöpfe, – alles Seltene (korrigieren, E-Rechnung, löschen …) beschriftet im Menü „Mehr“. | RechnungAktionen | 0 | app 1 | 0 |
| components/SchlussrechnungDialog.tsx | 569 |  | SchlussrechnungDialog | 9 | app 2, components 1 | 0 |
| components/SidebarLayout.tsx | 414 |  | SidebarLayout | 6 | app 1 | 0 |
| components/SollIstStunden.tsx | 31 | SCAFFOLD OS – Soll-Ist-Vergleich Arbeitsstunden (Phase 52) | SollIstStunden | 0 | app 1 | 0 |
| components/StatikerFreigabeBox.tsx | 93 | Statiker-Freigabe für ein CAD-Projekt: welcher externe Statiker-Login darf – dieses Projekt (3D-Ansicht, Maße, Stückliste ohne Preise) sehen. | StatikerFreigabeBox | 0 | app 1 | 0 |
| components/TerminBuchung.tsx | 323 |  | TerminBuchung | 0 | – | 0 |
| components/TransportAnlegen.tsx | 91 | SCAFFOLD OS – Transportaufträge direkt anlegen (Phase 57) | TransportAnlegen | 0 | – | 0 |
| components/Uebergabeprotokoll.tsx | 84 |  | Uebergabeprotokoll | 5 | components 1 | 0 |
| components/Unterweisung.tsx | 76 |  | Unterweisung | 5 | components 1 | 0 |
| components/Verankerungsprotokoll.tsx | 115 |  | Verankerungsprotokoll | 5 | components 1 | 0 |
| components/VersionsHistorie.tsx | 90 | SCAFFOLD OS – Versionshistorie eines Projekts (Phase 25) – Zeigt frühere Aufmaß-Stände, "Wiederherstellen" sichert den | VersionsHistorie | 0 | app 1 | 0 |
| components/VertragsDokumente.tsx | 82 | SCAFFOLD OS – Vertragsdokument-Ablage (Phase 28) | VertragsDokumente | 1 | app 1 | 0 |
| components/ZwischenaufmassBlock.tsx | 147 |  | ZwischenaufmassBlock | 3 | app 1, components 1 | 0 |

## components/aufmaß (14 Dateien, 2351 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| components/aufmaß/DigitalTwin.tsx | 311 | components/aufmaß/DigitalTwin.tsx – SCAFFOLD OS – Digitaler Zwilling (React Three Fiber) | DigitalTwin | 0 | app 1 | 0 |
| components/aufmaß/DinCheck.tsx | 98 | DIN EN 12811 KI-Check – Button + Ergebnisliste (Phase 18) – Selbstständige Komponente: prüft per /api/din-check und | DinCheck | 1 | app 1 | 0 |
| components/aufmaß/DispositionResult.tsx | 181 | components/aufmaß/DispositionResult.tsx – SCAFFOLD OS – Dispositions-Ergebnis-Anzeige | DispositionResult | 1 | app 1 | 0 |
| components/aufmaß/DrohnenUpload.tsx | 133 |  | DrohnenUpload | 1 | app 1 | 0 |
| components/aufmaß/FotoAnalyse.tsx | 100 |  | FotoAnalyse | 1 | app 1 | 0 |
| components/aufmaß/GrundrissUpload.tsx | 252 |  | GrundrissUpload | 2 | app 1 | 0 |
| components/aufmaß/KIMaterialResult.tsx | 351 | components/aufmaß/KIMaterialResult.tsx – SCAFFOLD OS – KI-Material-Ergebnis-Anzeige | KIMaterialResult | 1 | app 1 | 0 |
| components/aufmaß/KIWarnings.tsx | 147 | components/aufmaß/KIWarnings.tsx – SCAFFOLD OS – KI-Warnungs-Anzeige | KIWarnings | 1 | app 1 | 0 |
| components/aufmaß/LiDARUpload.tsx | 370 | Ab dieser Größe geht der Scan direkt zu Supabase Storage und wird vom – Punktwolken-Worker (Docker) analysiert – umgeht das Vercel-Upload-Limit. | LiDARUpload | 2 | app 1 | 0 |
| components/aufmaß/PhotoUpload.tsx | 129 |  | PhotoUpload | 1 | app 1 | 0 |
| components/aufmaß/SignaturePad.tsx | 73 |  | SignaturePad | 0 | app 2, components 7 | 0 |
| components/aufmaß/SprachNotiz.tsx | 118 | Sprachnotiz (Phase 18) – Aufnehmen am Handy, KI transkribiert, – Text wird ans Notizfeld angehängt. | SprachNotiz | 1 | app 1 | 0 |
| components/aufmaß/SymbolIcon.tsx | 25 |  | SymbolIcon | 0 | app 5 | 0 |
| components/aufmaß/WizardKopf.tsx | 63 | Gemeinsamer Kopf der Aufmaß-Schritte: Titel mit Icon und klickbare Schrittleiste über alle sechs Schritte. | WizardKopf | 0 | app 6 | 0 |

## components/cad (27 Dateien, 7071 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| components/cad/AbbauEinplanenDialog.tsx | 133 | Abbau einplanen: Vorschlag (verfügbare Mitarbeiter, KI-Vorliebe), von Hand änderbar, dann in die Wochenplanung speichern. – Urlaub/Krankheit: Abwesende werden nicht vorgeschlagen; von Hand gewählte Abwesende werden rot markiert. | AbbauEinplanenDialog | 0 | app 1 | 0 |
| components/cad/BalkonEditor.tsx | 120 |  | BalkonEditor | 2 | components 1 | 1 |
| components/cad/BillOfMaterials.tsx | 349 |  | BillOfMaterials | 9 | app 2 | 0 |
| components/cad/BuildingForm.tsx | 1129 |  | BuildingForm | 29 | app 1 | 0 |
| components/cad/ComponentCatalog.tsx | 98 | components/cad/ComponentCatalog.tsx – SCAFFOLD OS – Klick-Platzierung Bauteil-Katalog (CP-Pro-Marktvergleich) | CATALOG_ITEMS, ComponentCatalog | 0 | components 2 | 0 |
| components/cad/DimensionsPanel.tsx | 92 | components/cad/DimensionsPanel.tsx – SCAFFOLD OS – Freie Bemaßung (CP-Pro-Marktvergleich) | DimensionsPanel | 1 | components 1 | 0 |
| components/cad/DraufsichtKarte.tsx | 58 | Draufsicht einer Punktwolke (Höhe als Farbe) zum Anklicken von Punkten: gemeinsam genutzt von „Scans zusammenführen“ und „Punktwolke messen“. | Karte | 2 | components 2 | 0 |
| components/cad/HuelleWerkzeug.tsx | 87 | SCAFFOLD OS – Gebäudehülle: Detailstufe, auf Höhe kappen (Volumen oben/unten), OBJ-Export – Rechenlogik: lib/cad/huelle.ts (kappeHuelle), lib/cad/obj-export.ts (netzZuObj). Die Hülle ist eine vereinfachte Säulenhülle der Punktwolk | DETAILSTUFEN, HuelleWerkzeug | 5 | app 1 | 0 |
| components/cad/KatalogWahlListe.tsx | 43 | Liste der im CAD per Klick gewählten Hersteller-Artikel (zusammengefasst mit – Stückzahl). Reine Anzeige; Preise = Hersteller-Listenpreise netto, keine Verkaufspreise. | KatalogWahlListe | 2 | app 1 | 0 |
| components/cad/LayersPanel.tsx | 126 | components/cad/LayersPanel.tsx – SCAFFOLD OS – CAD-Ebenen/Layers (CP-Pro-Marktvergleich) | LayersPanel | 1 | components 1 | 0 |
| components/cad/Lod2Panel.tsx | 111 | Amtliches 3D-Gebäudemodell (LoD2, CityGML) als Quelle für Maße und Dachform. – Ablauf: Koordinaten aus Google Maps eintragen → Kachel herunterladen und hier auswählen → Gebäude prüfen → übernehmen. | leseKoordinaten, Lod2Panel | 2 | components 1 | 1 |
| components/cad/LvDialog.tsx | 503 | SCAFFOLD OS – Dialog „Leistungsverzeichnis" im CAD – Eingaben (Projekt, Standzeit, Klassen, Preisfaktoren) → Vorschau der Positionen | LvDialog | 12 | app 1 | 0 |
| components/cad/M2Abrechnung.tsx | 95 | Abrechnung nach m² im CAD (nur Admin): Gerüstfläche × (Grundpreis + gewählte Aufpreise). – Die Preise pflegt der Admin unter Datenpflege → „Preis je m²“ und „Aufpreise je m²“. | M2Abrechnung | 1 | app 1 | 0 |
| components/cad/NotesPanel.tsx | 55 | components/cad/NotesPanel.tsx – SCAFFOLD OS – CAD-Notizen/Anmerkungen (CP-Pro-Marktvergleich) | NotesPanel | 1 | components 1 | 0 |
| components/cad/OeffnungenFenster.tsx | 61 | SCAFFOLD OS – Erkannte Öffnungen (Türen, Fenster) aus der Punktwolke: Vorschläge prüfen und Türen übernehmen – Rechenlogik: lib/cad/oeffnungen.ts. Nichts wird ohne Klick übernommen. | OeffnungenFenster | 2 | app 1 | 0 |
| components/cad/PlanKontrolle.tsx | 78 | Kontrolle für Werte aus Plänen (auch handgeschrieben): Fassadenflächen je Seite und Bauabschnitt, Höhen. – Die Werte gehen nicht ins LV, sie werden nur gegengerechnet. Eine falsch gelesene Ziffer fällt über die Summen auf. | PlanKontrolle | 1 | components 1 | 0 |
| components/cad/PunktwolkeWerkzeug.tsx | 107 | SCAFFOLD OS – Punktwolke bereinigen und messen (Fenster im CAD) – Rechenlogik: lib/cad/punktwolke-werkzeuge.ts. Wirkt auf die angezeigte Punktwolke (Anzeige-Punkte), die Originaldatei bleibt unverändert. | PunktwolkeWerkzeug | 5 | app 1 | 0 |
| components/cad/Scaffold2D.tsx | 293 |  | Scaffold2D | 1 | app 1 | 0 |
| components/cad/Scaffold3D.tsx | 2308 | Scaffold3D.tsx – v2.1 Performance-Fix (CTO-Approval) | baueAufzugMast, tuerPlatzierungGestuft | 15 | app 2, components 1 | 2 |
| components/cad/ScanZusammenfuehren.tsx | 158 | SCAFFOLD OS – Mehrere Scans zu einer Punktwolke zusammenführen (Fenster im CAD) – Rechenlogik: lib/cad/scan-zusammenfuehren.ts und lib/cad/registrierung.ts. Alles läuft im Browser, nichts wird hochgeladen. | ScanZusammenfuehren | 5 | app 1 | 0 |
| components/cad/StatikDatenPanel.tsx | 111 |  | StatikDatenPanel | 5 | app 1 | 0 |
| components/cad/SystemLeiste.tsx | 52 | Marken-Leiste oben im CAD: Hersteller und System wählen (gleiche Auswahl wie – im Formular links). Zeigt, ob zum System ein Hersteller-Katalog vorliegt und | SystemLeiste | 2 | app 1 | 0 |
| components/cad/TeilabbauPanel.tsx | 124 | Teilabbau-Fenster im CAD: Auswahl per Klick im Modell oder per Zahl (Lagen / m² / Teile), – Ergebnis: Teile, Material, Stunden, Arbeitstage, Einsatzplan von oben nach unten. | TeilabbauArt, TeilabbauEingabe, TEILABBAU_START, teilabbauPlanText, TeilabbauPanel | 1 | app 1 | 0 |
| components/cad/TuerEditor.tsx | 104 |  | TuerEditor | 1 | components 1 | 0 |
| components/cad/Umgebung3D.tsx | 311 | SCAFFOLD OS – Umgebung der 3D-Ansicht (Darstellung) | Umgebung3D | 2 | components 1 | 0 |
| components/cad/UmrissEditor.tsx | 123 | Umriss-Editor: Gebäude als Vieleck statt Rechteck. – Eckpunkte in Metern (x nach rechts, z nach unten in der Vorschau), im Kreis eingeben. | UmrissEditor | 2 | components 1 | 0 |
| components/cad/UmrissZeichner.tsx | 242 | Umriss per Klick zeichnen: Ecken anklicken, sie rasten ein (Raster, vorhandene Punkte, waagerecht/senkrecht), – ein Klick auf den ersten Punkt (oder „Figur schließen“) beendet die Figur. Mehrere Figuren möglich | UmrissZeichner | 1 | components 1 | 0 |

## components/dashboard (4 Dateien, 501 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| components/dashboard/AlertFeed.tsx | 90 | components/dashboard/AlertFeed.tsx – SCAFFOLD OS – CEO-Warnungs-Feed | AlertFeed | 0 | – | 0 |
| components/dashboard/MieteEndeCard.tsx | 193 | SCAFFOLD OS – Dashboard: Mietende in den nächsten 14 Tagen – Zeigt aktive Projekte, deren Mietende bald erreicht ist, mit | MieteEndeCard | 1 | app 1 | 0 |
| components/dashboard/ProjectsTable.tsx | 89 | components/dashboard/ProjectsTable.tsx – SCAFFOLD OS – Aktive Projekte mit Marge | ProjectsTable | 0 | – | 0 |
| components/dashboard/StatsGrid.tsx | 129 | components/dashboard/StatsGrid.tsx – SCAFFOLD OS – CEO-Statistiken-Kacheln | StatsGrid | 0 | – | 0 |

## components/datenpflege (2 Dateien, 191 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| components/datenpflege/LeistungskatalogEditor.tsx | 118 | Datenpflege: Leistungskatalog der Firma (Leistung, Einheit, Preis netto). – Import aus Excel/CSV (erste Zeile = Spaltennamen). Preis leer = „nach Aufwand / auf Anfrage“. | LeistungskatalogEditor | 1 | app 1 | 0 |
| components/datenpflege/LvStandardpreiseEditor.tsx | 73 | Datenpflege: Standardpreise für LV-Positionen ohne CAD-Wert (EP und EP je Woche). – Speichern geht über /api/company (nur Admin). | LvStandardpreiseEditor | 1 | app 1 | 0 |

## components/lager (2 Dateien, 293 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| components/lager/AbbauDialog.tsx | 174 | SCAFFOLD OS – Abbau-Rücklauf-Dialog (Phase 68-B) | AbbauDialog | 0 | app 1 | 0 |
| components/lager/BarcodeScanner.tsx | 119 |  | BarcodeScanner | 0 | app 1 | 0 |

## components/landing (2 Dateien, 673 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| components/landing/StartFilm.tsx | 174 | SCAFFOLD OS – Startseite: sieben Abschnitte vom Drohnenscan bis zum Dashboard | StartFilm | 1 | app 1 | 0 |
| components/landing/start-film-szene.ts | 499 | SCAFFOLD OS – Startseite: 3D-Szene für die Wechsel-Abschnitte (Scroll-Animation) | Szene, Buehne, starteSzene | 0 | components 1 | 0 |

## components/marketing (1 Dateien, 181 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| components/marketing/FeatureSeite.tsx | 181 | SCAFFOLD OS – Vorlage für öffentliche Funktions-Seiten (SEO/GEO) – Eine Seite pro Suchthema (Aufmaß, Angebot, Rechnung, Disposition, | FeatureSektion, FeatureFaq, FeatureLink, FeatureSeiteProps, FEATURE_SEITEN (+2) | 1 | app 5 | 0 |

## components/rechnung (2 Dateien, 187 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| components/rechnung/AnhangDialog.tsx | 137 |  | AnhangDialog | 2 | app 3, components 1 | 0 |
| components/rechnung/PositionDetails.tsx | 50 | Detailfelder einer Rechnungsposition: Gerüst-ID, Bemerkung, Art (Modul, Rollgerüst, Hängegerüst, Konsolen …), – Maße L × B × H mit Mengenvorschlag, Listenpreis × Faktor, bei Stundenlohn Mitarbeiter und Tätigkeit. | PositionDetails | 1 | app 2, components 1 | 1 |

## components/win (3 Dateien, 327 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| components/win/DesktopShell.tsx | 202 |  | DesktopShell | 2 | components 1 | 0 |
| components/win/Win.tsx | 90 | Bausteine für die Desktop-Optik (Windows-Stil): Titelleiste, Menüband mit Gruppen, Baumansicht, Dokument-Reiter, Statusleiste. – Farben als Variablen, damit alle Seiten gleich aussehen und später zentral anpassbar sind. | WIN, Titelleiste, Menueband, BandGruppe, BandKnopf (+4) | 0 | app 4 | 0 |
| components/win/useOhneBuntSymbole.ts | 35 | Entfernt führende bunte Emoji vor Reitern, Knöpfen und Überschriften in der Desktop-Ansicht – (ruhigere, sachliche Optik). Statussymbole (✅ ❌ ⚠️ ⏳ und farbige Punkte) bleiben, weil sie eine Bedeutung tragen. | bereinige, useOhneBuntSymbole | 0 | components 1 | 0 |

## hooks (1 Dateien, 70 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| hooks/useKIValidation.ts | 70 | hooks/useKIValidation.ts – SCAFFOLD OS – KI-Validierungs-Hook | useKIValidation | 2 | app 1 | 0 |

## lib (Wurzel) (119 Dateien, 12090 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/abbau-faellig.ts | 23 | SCAFFOLD OS – Rücklauf nach Abbau fällig? | AbbauHinweis, abbauFaellig | 0 | app 1 | 1 |
| lib/abwesenheit.ts | 36 | SCAFFOLD OS – Abwesenheitsarten (gemeinsame Liste) – Schlechtwetter und Gleitzeit sind Anträge mit Genehmigung durch die Disposition. | ABSENCE_TYPES, AbsenceTypeId, ABSENCE_TYPE_LABEL, ABSENCE_TYPE_BADGE, istAbsenceType (+3) | 0 | app 1, lib 1 | 1 |
| lib/angebot-3d-ansicht.ts | 39 | SCAFFOLD OS – 3D-Ansicht im Angebot | MedienZeile, waehleCadAnsicht, passeBildEin, GeladenesBild, ladeBild | 0 | app 2 | 1 |
| lib/angebot-annahme.ts | 158 | SCAFFOLD OS – Automatik bei Angebots-Annahme (Phase 62) | istLeistungsZeile, AngebotsannahmeErgebnis, beiAngebotsannahme, beiAngebotsannahmeSicher | 3 | app 2 | 1 |
| lib/angebot-rueckmeldung-mail.ts | 42 | Benachrichtigung an die Firma, wenn ein Kunde ein Angebot per Link ablehnt oder eine Korrektur schickt. – Empfänger: die in den Einstellungen hinterlegte Firmen-E-Mail; ist keine hinterlegt, gehen die Mails an die Admins/Dispositi | empfaengerFuer, rueckmeldungMail | 1 | lib 1 | 1 |
| lib/angebot-rueckmeldung.ts | 54 | Antworten des Kunden auf ein Angebot (öffentlicher Link): annehmen, Korrektur mit Notiz, ablehnen. – Gespeichert wird in project.data: angebotsStatus + angebotRueckmeldungen (Verlauf). | ANGEBOT_ANTWORTEN, AngebotAntwort, AngebotStatus, ANTWORT_ZU_STATUS, ANGEBOT_STATUS_LABEL (+8) | 0 | app 3, components 1, lib 1 | 1 |
| lib/anhang-storage.ts | 33 | Server-seitige Helfer für den privaten Bucket (Service-Rolle). Nur in API-Routen verwenden. | uploadToken, downloadLink, dateiLoeschen, dateiVorhanden | 1 | app 3 | 0 |
| lib/ansicht-link.ts | 122 | SCAFFOLD OS – 3D-Ansichtslink (nur lesend) | TOKEN_MUSTER, UUID_MUSTER, GUELTIGKEIT_TAGE, LinkStatus, linkStatus (+3) | 4 | app 10 | 5 |
| lib/arbeitsschutz-pdf.ts | 68 |  | generatePflichtenPDF, generateBetriebsanweisungPDF | 2 | components 1 | 0 |
| lib/aufmass-autosave-regeln.ts | 50 | SCAFFOLD OS – Auto-Speichern bei Bestandsprojekten (Aufmaß Schritt 1–5) – Reine Regeln (ohne Browser/DB), von Client UND API genutzt. | AUTOSAVE_SCHRITTE, AutosaveSchritt, AUTOSAVE_PROJEKT_ABGESCHLOSSEN_FEHLER, stabilJson, istSchrittGeaendert (+2) | 0 | app 1, components 1, lib 2 | 1 |
| lib/aufmass-autosave.ts | 36 | Client-Teil des Auto-Speicherns bei Bestandsprojekten (siehe aufmass-autosave-regeln.ts). | speichereSchrittAuto | 2 | app 5, components 1 | 0 |
| lib/aufmass-eigentuemer.ts | 44 | SCAFFOLD OS – Zuordnung von Browser-Zwischenspeichern zu EINEM Projekt | LIDAR_EIGENTUEMER_KEY, SESSION_EIGENTUEMER_KEY, NEU, gehoertZu, setzeLidarEigentuemer (+2) | 0 | app 3, components 1 | 1 |
| lib/aufmass-entwurf.ts | 93 | SCAFFOLD OS – Aufmaß-Entwurf (Auto-Save für Schritt 1–5) | ENTWURF_ID_KEY, ENTWURF_STATUS, EntwurfPayload, baueEntwurfPayload, speichereEntwurf (+1) | 1 | app 6, components 1 | 1 |
| lib/aufmass-projekt-session.ts | 219 | SCAFFOLD OS – Gemeinsame Sitzungs-Logik für den Aufmaß-Assistenten – (Phase 56) | WIZARD_KEYS, loescheWizardDaten, sollFrischGeladenWerden, leseMarkierung, setzeMarkierung (+6) | 0 | app 9, components 3 | 1 |
| lib/aufmass-rechnung.ts | 47 | Rechnungspositionen für das Gerüst aus einem Aufmaß/Angebot: nach Abschnitten (Fassaden) mit m² aufgeschlüsselt statt als eine Pauschale. – Die Summe bleibt immer exakt der Angebotspreis (basis) – gibt es keine saubere Aufteilung, | AufmassAbschnitt, geruestPositionen | 1 | app 2 | 2 |
| lib/aufmassblatt-ablage.ts | 45 | SCAFFOLD OS – Aufmaßblatt am Projekt ablegen | aufmassblattDateiname, legeAufmassblattAmProjektAb | 1 | app 1 | 1 |
| lib/aufmassblatt-fotos.ts | 57 | Hilfsfunktionen, um Projekt-Fotos für das Aufmaßblatt vorzubereiten. | MedienEintrag, waehleFotos, ladeBildVerkleinert, ladeAufmassFotos | 1 | app 1, lib 1 | 1 |
| lib/aufmassblatt-pdf.ts | 398 | SCAFFOLD OS – Aufmaßblatt (PDF) | AufmassAbschnitt, AufmassZeile, MINDESTLAENGE_M, AufmassFoto, AufmassNachtrag (+5) | 2 | app 1, components 3, lib 1 | 2 |
| lib/auftragsstand.ts | 113 | SCAFFOLD OS – Auftragsstand einer Baustelle (reine Logik) | StandRechnung, StandNachtrag, Auftragsstand, istGueltig, bezahltBrutto (+5) | 1 | app 1, components 1 | 1 |
| lib/auth.ts | 123 | SCAFFOLD OS – Zentrale Mindest-Auth-Prüfung (Phase 58) | requireAuth, unauthorizedResponse, requireOwnEmployeeOrAdmin, pruefeRolle, forbiddenResponse (+1) | 2 | app 113 | 0 |
| lib/auto-tour-wahl.ts | 196 | SCAFFOLD OS – Automatische Fahrt bei Angebots-Annahme: Auswahl | FahrzeugKurz, FahrerKandidat, gesamtgewichtKg, FahrzeugWahl, waehleFahrzeug (+13) | 1 | lib 1 | 1 |
| lib/auto-tour.ts | 405 | SCAFFOLD OS – Automatische Fahrt bei Angebots-Annahme (DB-Teil) | AutoTourErgebnis, legeAutoTourAn, fahrtNachholen, fahrtNachholenSicher, OffeneFahrt (+2) | 3 | app 4, lib 1 | 0 |
| lib/balkon.ts | 195 | SCAFFOLD OS – Balkone im Aufmaß | KONSOLE_BREITE_M, konsolenJeLage, balkoneFuerAbschnitt, BalkonWirkung, balkonWirkung (+4) | 1 | app 1, components 1, lib 4 | 2 |
| lib/bauphasen-planung.ts | 52 | SCAFFOLD OS – Bauphasen: Lager-Check und Personalvorschlag (reine Logik, ohne Datenbank) | LagerCheckZeile, lagerCheck, PersonalVorschlagTag, personalVorschlag | 3 | components 1 | 1 |
| lib/bauphasen.ts | 222 | SCAFFOLD OS – Bauphasen: Aufbau-/Abbau-Termine, Teilrückbau, Kostenaufteilung, Lager, Personal (reine Logik) | PhasenArt, Bauphase, BauphasenEinstellung, BAUPHASEN_STANDARD, PhaseErgebnis (+8) | 1 | components 2, lib 1 | 2 |
| lib/baustellen-ergebnis.ts | 73 | SCAFFOLD OS – Ergebnis je Baustelle (reine Logik) | PersonalZeile, BaustellenErgebnis, berechneBaustellenErgebnis | 0 | components 1 | 1 |
| lib/baustellenmappe.ts | 88 | SCAFFOLD OS – Baustellenmappe (reine Logik) – Unterlagen je Baustelle, erreichbar über Link/QR-Code ohne Login. | TOKEN_MUSTER, UUID_MUSTER, KATEGORIEN, ARBEITSSCHUTZ_KATEGORIEN, MediaMeta (+10) | 0 | app 11, components 1 | 1 |
| lib/besucher.ts | 79 | SCAFFOLD OS – Besucherzähler: reine Hilfsfunktionen (testbar) | ZAEHL_PFADE, pfadZaehlen, istBot, geraetVon, quelleVon (+3) | 0 | app 2 | 1 |
| lib/betriebsanweisung.ts | 26 | Betriebsanweisung: leeres Formular für Tätigkeit oder Arbeitsmittel. Inhalte trägt der Betrieb ein. | Betriebsanweisung, leereBetriebsanweisung, betriebsanweisungFehlt | 0 | components 1, lib 1 | 1 |
| lib/cron-auth.ts | 31 | SCAFFOLD OS – Zugriffsschutz für Cron-Routen (/api/cron/*) | pruefeCronAufruf | 0 | app 4 | 1 |
| lib/datum.ts | 22 | SCAFFOLD OS – Datum als "YYYY-MM-DD" in der LOKALEN Zeitzone | lokalesDatumIso, datumPlusTage | 0 | app 6, components 6 | 1 |
| lib/disposition-bestand.ts | 90 | SCAFFOLD OS – Disposition (Schritt 6): Bestand den Materialzeilen zuordnen | LagerMitOrt, ordneZentralbestand, BaustellenZeile, BaustellenInfo, ordneBaustellenbestand | 2 | app 1 | 1 |
| lib/dokumente.ts | 73 | SCAFFOLD OS – Dokumente-Übersicht (reine Logik) – Nutzt die bestehende Ablage (Tabelle project_media, Bucket | DokumentArt, MediaZeile, dokumentArt, DokumentZeile, filtereDokumente (+3) | 0 | app 2 | 1 |
| lib/einsatz-planung.ts | 86 | SCAFFOLD OS – Einsatzplanung (rein rechnerisch, ohne Datenbank) | PlanMitarbeiter, PlanEinsatz, PlanAbwesenheit, arbeitstage, istAbwesend (+4) | 0 | app 1, lib 3 | 1 |
| lib/einsatz-umplanen.ts | 60 | SCAFFOLD OS – Automatisch umplanen bei Urlaub / Krankmeldung | UmplanErgebnis, planeEinsaetzeUm | 1 | lib 1 | 0 |
| lib/email-crypto.ts | 40 | SCAFFOLD OS – Verschlüsselung für gespeicherte E-Mail-App-Passwörter – (Phase 48) | verschluesseln, entschluesseln | 0 | app 2 | 0 |
| lib/email-kunde.ts | 45 | SCAFFOLD OS – Neue Mail beim Kunden: kleine reine Hilfsfunktionen | textZuHtml, Empfaenger, empfaengerListe | 1 | app 1, components 1 | 1 |
| lib/email-verlauf.ts | 17 | SCAFFOLD OS – E-Mail-Verlauf: kleine reine Hilfsfunktionen | entferneTrackingPixel, istGueltigeEmail | 0 | app 2, components 2, lib 1 | 1 |
| lib/freigabe-status.ts | 57 | Freigabe-Status einer Baustelle – abgeleitet aus den Projekt-Ereignissen. – Reine Anzeige/Warnung, sperrt nichts (der Aufbau muss vor der Freigabe möglich sein). | FreigabeStufe, FreigabeEreignis, FreigabeStatus, FREIGABE_LABEL, berechneFreigabeStatus | 0 | app 1, components 1 | 1 |
| lib/gaeb-export.ts | 113 | SCAFFOLD OS – Leistungsverzeichnis als GAEB-Datei (X83, Angebotsaufforderung, GAEB DA XML 3.3) | gaebEinheit, gaebMenge, gaebPositionsNr, GaebExportOptionen, erzeugeGaebX83 | 1 | components 1 | 1 |
| lib/gaeb.ts | 252 | SCAFFOLD OS – GAEB-Ausschreibungen (Phase 40) | GaebPosition, parseGaebPositions, buildGaebX84 | 2 | app 1 | 1 |
| lib/gefaehrdungsbeurteilung-pdf.ts | 55 |  | generateGbuPDF | 1 | components 1 | 0 |
| lib/gefaehrdungsbeurteilung.ts | 48 | Objektbezogene Gefährdungsbeurteilung (eigenes, leeres Formular). – Die App gibt KEINE Gefährdungen oder Maßnahmen vor: Der Betrieb trägt sie selbst ein. | Wirksamkeit, GbuZeile, Gbu, WIRKSAM_LABEL, leereGbuZeile (+3) | 0 | components 1, lib 1 | 1 |
| lib/geruestklassen.ts | 103 | Lastklassen und Breitenklassen nach DIN EN 12811-1 für die Auswahl im Aufmaß. – Die Lastklasse wählt der Nutzer selbst; das Gewerk liefert nur einen VORSCHLAG. | LASTKLASSEN, BREITENKLASSEN, breitenklasseText, breitenklasseFuerBreite, vorschlagLastklasse (+8) | 0 | app 2, components 2, lib 3 | 2 |
| lib/geruestpruefung-pdf.ts | 116 |  | generateGeruestpruefungPDF | 1 | components 1 | 1 |
| lib/geruestpruefung.ts | 119 | Prüfprotokoll für Arbeits- und Schutzgerüste mit Checkliste (ausfüllbar, Ablage in der Baustellenmappe). – Die Prüfpunkte sind eine Arbeitsvorlage; die prüfende (befähigte) Person trägt das tatsächliche Ergebnis ein | Antwort, ANTWORT_LABEL, BAUARTEN, LASTKLASSEN, LASTKLASSE_KN (+12) | 0 | components 1, lib 1 | 1 |
| lib/geruesttypen.ts | 47 | SCAFFOLD OS – Gerüsttypen (zentrale Liste) + Auswahl "was bieten wir an" | Geruesttyp, ALLE_GERUESTTYPEN, leseAngeboteneTypen, sichtbareGeruesttypen | 0 | app 2 | 1 |
| lib/google-distance.ts | 75 | lib/google-distance.ts – SCAFFOLD OS – Echte Fahrstrecken über die Google Distance Matrix API | distanceMatrixKm | 0 | app 1 | 0 |
| lib/grundriss-parsing.ts | 189 | SCAFFOLD OS – gemeinsame Grundriss-Auswertungs-Helfer | parsePlanNumber, deterministicFromText, escapeRegExp, valueInText, pruefeUndFiltere (+2) | 0 | app 1, lib 1 | 0 |
| lib/impact.ts | 35 | SCAFFOLD OS – Impact-Tracking (Phase 17) | trackImpact | 0 | app 2 | 0 |
| lib/import-altdaten.ts | 118 | Übernahme von Altdaten (Baustellen, Rechnungen) aus CSV-Exporten anderer Programme. – Reine Prüf- und Umrechnungsfunktionen – der Datenbankzugriff liegt in den API-Routen. | parseZahl, parseDatum, BaustelleZeile, BaustellePruefung, pruefeBaustelle (+3) | 0 | app 2 | 1 |
| lib/import-auth.ts | 53 | Gemeinsame Helfer der Import-Routen (nur admin/disponent, Zugriff danach per Service-Rolle). | importUrl, importHeaders, MAX_IMPORT_ZEILEN, importPruefeRolle, importLeseZeilen (+2) | 1 | app 3 | 0 |
| lib/invoice-pdf-server.ts | 185 | SCAFFOLD OS – Rechnungs-PDF für E-Rechnung (Phase 39, Nachtrag) | generateInvoicePdfCompliant | 2 | app 2 | 1 |
| lib/invoice-pdf.ts | 477 | SCAFFOLD OS – Rechnungs-PDFs (aus app/rechnungen/page.tsx – hierher ausgelagert, damit auch die Kunden-Seite sie nutzen | Position, Invoice, TYPE_LABEL, fmtEur, fmtDate (+7) | 1 | app 7, components 3, lib 3 | 1 |
| lib/ki-dsgvo.ts | 100 | SCAFFOLD OS – KI-DSGVO-Härtung (Phase 64) | pseudonymisierungAktiv, pseudonymisiereText | 0 | app 1, lib 1 | 0 |
| lib/ki-fetch.ts | 74 | SCAFFOLD OS – KI-Aufruf mit automatischer Wiederholung bei – Ratenbegrenzung (429) | kiFetchMitRetry, KI_UEBERLASTET_MELDUNG | 1 | app 5, lib 1 | 0 |
| lib/kunde-vorbelegung.ts | 30 | SCAFFOLD OS – Aufmaß Schritt 1: Ansprechpartner aus dem Kundenstamm vorbelegen | KundeKontakt, AnsprechpartnerFelder, ansprechpartnerAusKunde | 0 | app 1 | 1 |
| lib/lager-zuordnung.ts | 89 | SCAFFOLD OS – Zuordnung KI-Materialzeile ↔ Lagerartikel (Angebots-Annahme) | LagerArtikelKurz, MaterialZeileKurz, LagerIndex, baueLagerIndex, findeLagerartikel (+2) | 0 | lib 3 | 1 |
| lib/lastansatz.ts | 80 | SCAFFOLD OS – Lastansatz nach DIN EN 12811-1 (Verkehrslasten auf Gerüstlagen) | Verkehrslast, VERKEHRSLASTEN, verkehrslast, ZWEITE_LAGE_ANTEIL, KRAN_FAKTOR (+6) | 0 | components 1, lib 2 | 1 |
| lib/leistungskatalog.ts | 104 | SCAFFOLD OS – Leistungskatalog (reine Logik) | LeistungKatalogEintrag, KATALOG_VORLAGE, parsePreis, KatalogImport, katalogAusTabelle (+3) | 1 | app 2, components 2 | 1 |
| lib/leistungsverzeichnis.ts | 876 | SCAFFOLD OS – Leistungsverzeichnis (LV) aus dem CAD-Modell | GRUNDSTANDZEIT_WOCHEN, LASTKLASSEN, LvStil, ZusatzArt, LvZusatz (+13) | 9 | app 1, components 2, lib 6 | 11 |
| lib/lidar-ebenen.ts | 33 | Vom LiDAR-Scan erkannte Wände → Auswahlliste für Abschnitte in Schritt 2. – Ebene 1 ist die Hauptfassade (steht oben in Länge/Höhe), ab Ebene 2 wird | LidarEbene, EbenenVorschlag, ebenenZuVorschlaegen, ebenenSignatur, flaecheM2 | 0 | app 1 | 1 |
| lib/lidar-teile-vorbelegung.ts | 46 | Gebäudeteile aus dem LiDAR-Scan → Vorschläge für Aufmaß Schritt 2 (Traufhöhe, Dachform, Garage/Nebengebäude). – Alles nur Vorschläge: Die Felder bleiben änderbar, der Hinweis im Formular fordert zum Prüfen auf. | LidarTeilEingabe, TeileVorbelegung, teileVorbelegung | 0 | app 1 | 1 |
| lib/lieferung-mengen.ts | 51 | SCAFFOLD OS – Liefermengen aus der Materialliste (Schritt 5) | MaterialZeileKurz, LieferMengen, lieferMengenAusMaterialliste | 0 | app 1 | 1 |
| lib/logistik-fahrzeug.ts | 27 | Fahrzeugwahl für die CAD-Logistik: nimmt die in der Datenpflege angelegten Fahrzeuge (vehicles.capacity_kg) – statt der festen Annahme „7,5-t-LKW mit 3,5 t Nutzlast“. | LogistikFahrzeug, fahrzeugeAus, waehleFahrzeug | 0 | app 1 | 1 |
| lib/lv-firmenwerte.ts | 95 | SCAFFOLD OS – Firmenwerte & Standardpreise für das Leistungsverzeichnis | FIRMENFELDER, Firmenfeld, LvStandardpreis, LvStandardpreise, LV_STANDARDPREIS_POSITIONEN (+4) | 0 | components 2, lib 1 | 1 |
| lib/lv-texte.ts | 121 | SCAFFOLD OS – Leistungstexte für das LV im Stil „Auftraggeber“ (Turmeinrüstung) | LV_TEXTE | 0 | lib 1 | 0 |
| lib/lv-zu-rechnung.ts | 57 | Rechnungsentwurf aus einem Leistungsverzeichnis: jede LV-Position wird eine Rechnungsposition – (Art, Listenpreis × Faktor → Einzelpreis). Gesamtpreis bleibt Menge × Einzelpreis. | artAusTitel, LvRechnungsEntwurf, rechnungAusLv | 2 | components 2 | 1 |
| lib/lv-zuordnung.ts | 199 | SCAFFOLD OS – Zuordnung der CAD-Werte zu einem fremden LV (z. B. vom Statiker) | LvVorlagePos, LV_VORLAGE_WUPPERTAL, LvZuordnungZeile, LvZuordnung, erzeugeLvZuordnung (+1) | 2 | – | 1 |
| lib/mahnung-steuerung.ts | 61 | SCAFFOLD OS – Mahnwesen steuern (reine Logik) | FRIST_MAHNUNG_1_TAGE, FRIST_MAHNUNG_2_TAGE, MahnAktion, MahnZustand, naechsteAutoAktion (+4) | 0 | app 1, components 1, lib 1 | 1 |
| lib/mahnung-versand.ts | 115 | SCAFFOLD OS – Zahlungserinnerung/Mahnung für eine Rechnung versenden (nur Server) – Gemeinsam genutzt vom täglichen Cron-Job und vom Knopf in der Baustellen-Übersicht. | VersandErgebnis, ladeMahnEinstellungen, sendeMahnschritt | 2 | app 2 | 0 |
| lib/mail-provider.ts | 91 | SCAFFOLD OS – Voreinstellungen für E-Mail-Anbieter | AnbieterId, Anbieter, ANBIETER, anbieterById, anbieterAusAdresse | 0 | components 1 | 1 |
| lib/media-client.ts | 329 | Spiegelbild der echten Live-Tabelle project_media: – id, project_id (text), storage_path, file_name, file_type, | ProjectMedia, uploadProjectMediaClient, uploadGrundrissClient, getGrundrisseClient, getProjectMediaClient (+6) | 1 | app 1, components 4 | 0 |
| lib/miete.ts | 120 | SCAFFOLD OS – Mietende: Erinnerung & Verlängerung (reine Logik) | ErinnerungsStufe, MietErinnerungen, istIso, wirksamesMietende, tageBis (+7) | 0 | app 7, components 2 | 1 |
| lib/mj-katalog.ts | 182 | SCAFFOLD OS – Hersteller-Artikelkatalog MJ-Gerüst und SCAFOM-RUX (Nachschlagewerk) | MjListe, MjArtikel, MjListeInfo, MjZulassung, MJ_LISTEN (+6) | 0 | app 2, components 1, lib 5 | 3 |
| lib/nachtrag-client.ts | 88 | Browser-Helfer für Nachträge: Fotos verkleinern + hochladen, PDF am Projekt ablegen. | ladeNachtragFotosHoch, ladeFotosFuerPdf, legeNachtragPdfAmProjektAb, legeNachtragVorOrtAn | 3 | app 1, components 1 | 0 |
| lib/nachtrag-pdf.ts | 144 | SCAFFOLD OS – Nachtrags-PDF (Nachtragsangebot / Nachweis) – Betrag netto, zzgl. gesetzlicher MwSt. Fotos optional (bereits | NachtragPdfFoto, NachtragPdfInput, erzeugeNachtragPdf | 1 | components 1 | 0 |
| lib/nachtrag.ts | 191 | SCAFFOLD OS – Nachträge am Auftrag (reine Logik) | NachtragStatus, NachtragArt, Verlaengerung, RegieZeile, NachtragFoto (+17) | 0 | app 1, components 5, lib 3 | 3 |
| lib/notify.ts | 222 | SCAFFOLD OS – E-Mail-Benachrichtigungen (Nr. 5, Stufe 1) | notifyAbsenceCreated, notifyAbsenceDecision, notifyAngebotRueckmeldung | 2 | app 1, lib 1 | 0 |
| lib/pflichtenuebertragung.ts | 28 | Pflichtenübertragung: der Unternehmer überträgt einer geeigneten Person bestimmte Aufgaben und Befugnisse. – Leeres Formular – Aufgaben und Befugnisse bestimmt der Betrieb. Die App prüft nicht, ob die Übertragung | Pflichtenuebertragung, leerePflichten, pflichtenFehlt | 0 | components 1, lib 1 | 1 |
| lib/plan-limits.ts | 59 | SCAFFOLD OS – Paket-Grenzen (Starter / Priority / Enterprise) | PlanId, PlanGrenzen, PLAN_GRENZEN, aktuellerPlan, UPGRADE_HINWEIS | 0 | app 3 | 0 |
| lib/plan-pruefung.ts | 68 | Plausibilitätsprüfung für Werte, die aus einem Plan gelesen oder abgeschrieben wurden (auch Handschrift auf Scans). – Idee: Einzelne Ziffern werden leicht falsch gelesen. Pläne enthalten aber Summen (Teile ergeben das Ganze). | PlanWerte, Summenregel, Pruefergebnis, pruefeSummen, TURM_REGELN | 0 | components 1 | 1 |
| lib/ply-achse.ts | 24 | SCAFFOLD OS – PLY: senkrechte Achse aus dem Datei-Kopf lesen | achseAusPlyKopf | 0 | app 1 | 1 |
| lib/ply-binary.ts | 104 | SCAFFOLD OS – Binäres PLY (little/big endian) lesen | istBinaerPly, parsePlyBinary | 0 | app 1 | 1 |
| lib/project-events-client.ts | 51 | SCAFFOLD OS – Foto-Upload für Projekt-Ereignisse (Phase 18) | EventPhoto, uploadEventPhotoClient, deleteEventPhotoClient | 1 | components 1 | 0 |
| lib/projekt-lv.ts | 55 | Gespeicherte Leistungsverzeichnisse je Baustelle (Hauptauftrag, Bestellwerterhöhung, Teilabbau, Nachtrag). | LV_ARTEN, LvArt, LV_ART_LABEL, LV_STATUS, LvStatus (+4) | 1 | app 1, components 2 | 1 |
| lib/pruefcheckliste.ts | 50 | SCAFFOLD OS – Prüf-Checkliste für das Prüfprotokoll (reine Logik) – Prüfpunkte sind eine Arbeitsvorlage der Firma; der Betrieb legt selbst fest, was er prüft | PRUEFPUNKTE, PunktStatus, Checkliste, STATUS_LABEL, LASTKLASSEN (+4) | 0 | components 1, lib 1 | 1 |
| lib/pruefprotokoll-pdf.ts | 153 | SCAFFOLD OS – Prüfprotokoll-PDF (Phase 24) | PruefungDetails, generatePruefprotokollPDF | 1 | components 1 | 0 |
| lib/pruefschild-pdf.ts | 67 |  | generatePruefschildPDF, generateSperrschildPDF | 1 | components 1 | 0 |
| lib/pruefschild.ts | 45 | Prüfschild (Kennzeichnung) – Daten aus der letzten Freigabe-Prüfung vorbelegen. – Die App erfindet nichts: Was in der Prüfung fehlt, bleibt leer und wird im Formular ergänzt. | SchildDaten, leeresSchild, schildAusEreignissen, schildFehlt | 0 | components 1, lib 1 | 1 |
| lib/rate-limit.ts | 167 | SCAFFOLD OS – Rate-Limiting für KI-Endpunkte (Phase 63) | KiRateLimitErgebnis, kiRateLimitPruefen, fensterPruefen, oeffentlichRateLimitPruefen | 1 | app 14 | 1 |
| lib/rechnung-anhang.ts | 61 | Anhänge an Rechnungen (Bilder, PDFs, Excel, E-Mails): Prüfung von Name, Typ und Größe, Speicherpfad. – Der Dateityp wird aus der Endung bestimmt, nicht vom Browser übernommen – so lässt sich kein HTML/Script als „Bild“ ablegen. | ANHANG_BUCKET, MAX_BYTES, MAX_VIDEO_BYTES, MAX_ANHAENGE, ERLAUBTE_TYPEN (+8) | 0 | app 2, components 1, lib 1 | 1 |
| lib/rechnung-position.ts | 152 | Strukturierte Rechnungspositionen: Art, Maße (L×B×H), Listenpreis × Faktor, Stundenlohn mit Mitarbeiter und Tätigkeit. – Der Gesamtpreis bleibt überall Menge × Einzelpreis – der Faktor ist ein Nachweis, wie der Einzelpreis zustand | POSITION_ARTEN, PositionArt, POSITION_ART_LABEL, StrukturPosition, bereinigePosition (+7) | 0 | app 5, components 2, lib 4 | 2 |
| lib/rechnung-pruefung.ts | 21 | Prüfung einer Rechnung durch den Auftraggeber (öffentlicher Prüflink). | ENTSCHEIDUNGEN, PruefEntscheidung, ENTSCHEIDUNG_LABEL, PruefEingabe, pruefeEingabe | 0 | app 4 | 1 |
| lib/rechnung-regeln.ts | 17 | SCAFFOLD OS – Regeln beim Anlegen von Rechnungen (reine Logik) | ABSCHLAG_OHNE_AUFTRAG_FEHLER, abschlagOhneAuftrag | 0 | app 1 | 1 |
| lib/rechnung-versand.ts | 20 | SCAFFOLD OS – Welche Rechnungen eines Projekts sind noch nicht verschickt? | RechnungKurz, MailKurz, unversendeteRechnungen | 0 | components 1 | 1 |
| lib/rollen.ts | 25 | SCAFFOLD OS – Rollen-Gruppen für API-Routen | ROLLEN, rolleErlaubt | 0 | app 16, lib 2 | 1 |
| lib/routing.ts | 97 | SCAFFOLD OS – Routing-Helfer (OpenStreetMap, kostenlos, ohne API-Key) | GeoPoint, geocodeAddress, geocodeAll, TableResult, buildTable (+1) | 0 | app 1 | 0 |
| lib/schlussrechnung.ts | 219 | SCAFFOLD OS – Schlussrechnung aus Auftrag (reine Logik) | RechnungsPosition, AnpassungenLike, RechnungsEingabe, RechnungsBasis, berechneAngebotBetraege (+10) | 1 | components 1, lib 1 | 2 |
| lib/statik-daten.ts | 121 | SCAFFOLD OS – Projektdaten für die Statik (Angaben des Planers) | WINDNORMEN, GELAENDEKATEGORIEN, UNTERGRUENDE, WINDZONEN, WINDZONEN_RICHTWERT_MS (+13) | 0 | app 1, components 2, lib 8 | 3 |
| lib/statik-pruefpunkte.ts | 70 | SCAFFOLD OS – Prüfpunkte für den Statiker | Pruefpunkt, TYPENSTATIK_HOEHE_HINWEIS_M, statikPruefpunkte | 4 | components 2, lib 2 | 2 |
| lib/statiker-auth.ts | 19 | Prüft für die Statiker-API-Routen: eingeloggt UND als Statiker gekennzeichnet – (Flag app_metadata.statiker, nur per Service-Schlüssel setzbar). Normale | pruefeStatiker | 2 | app 3 | 0 |
| lib/statiker-lv-einlesen.ts | 138 | SCAFFOLD OS – Angaben aus dem LV des Statikers (Excel) einlesen | Zelle, LvBlatt, StatikerLvErgebnis, LvVorgabePosition, leseStatikerLv (+2) | 1 | components 1 | 1 |
| lib/statiker.ts | 63 | SCAFFOLD OS – Statiker-Rolle (externe Ingenieurbüros) | STATIKER_ROLLE, STATIKER_STARTSEITE, STATIKER_ERLAUBTE_PFADE, STATIKER_GESPERRTE_PFADE, istStatiker (+4) | 0 | app 1, components 1, lib 1, proxy.ts 1 | 1 |
| lib/stueckliste-bearbeiten.ts | 55 | SCAFFOLD OS – Materialliste im Angebot bearbeiten (Schritt 6) | MaterialPosition, KostenErgebnis, uebernehmeMaterialBearbeitung | 0 | app 1 | 1 |
| lib/team-vorschlag.ts | 96 | SCAFFOLD OS – KI-Team-Vorschlag für neue, noch nicht zugewiesene – Aufträge (Phase 43) | TeamVorschlag, buildTeamVorschlag | 1 | app 2 | 0 |
| lib/uebergabeprotokoll-pdf.ts | 47 |  | generateUebergabeprotokollPDF | 1 | components 1 | 0 |
| lib/uebergabeprotokoll.ts | 27 | Übergabeprotokoll: dokumentiert die Übergabe des Gerüsts an den Auftraggeber. – Die App formuliert keine rechtlichen Wirkungen (z. B. Abnahme); es wird nur festgehalten, | Uebergabe, leereUebergabe, uebergabeFehlt | 0 | components 1, lib 1 | 1 |
| lib/umdisposition.ts | 138 | SCAFFOLD OS – KI-Umdisposition bei Ausfällen | UmdispositionVorschlag, UmdispositionResult, buildUmdispositionSuggestion | 0 | app 1, lib 1 | 0 |
| lib/unterweisung-pdf.ts | 52 |  | generateUnterweisungPDF | 1 | components 1 | 0 |
| lib/unterweisung.ts | 28 | Unterweisungsnachweis: Thema, Datum, Unterweisende Person und Teilnehmerliste mit Unterschrift. – Die App gibt keine Unterweisungsinhalte vor – das Thema und die Inhalte bestimmt der Betrieb. | Teilnehmer, Unterweisung, leereUnterweisung, unterweisungFehlt | 0 | components 1, lib 1 | 1 |
| lib/ust-hinweis.ts | 11 | Hinweis auf Rechnungen ohne Umsatzsteuer bei Steuerschuldnerschaft des Leistungsempfängers (§ 13b UStG). – Ob § 13b im Einzelfall greift, klärt die Firma mit dem Steuerberater. | HINWEIS_13B, notizMitUstHinweis | 0 | app 1 | 1 |
| lib/validation.ts | 131 | SCAFFOLD OS – Zentrale Input-Validierung mit Zod (Phase 60) | uuid, validiere, kolonneAnlegenSchema, kolonneMitgliedSchema, wochenplanungEinsatzSchema (+8) | 0 | app 13 | 1 |
| lib/verankerungsprotokoll-pdf.ts | 88 | Dokumentiert Ankerprüfungen, die eine Person vor Ort durchgeführt hat. – Prüfkräfte und Ergebnisse stammen aus dem Formular – kein KI-Gutachten. | generateVerankerungsprotokollPDF | 1 | components 1 | 0 |
| lib/verankerungsprotokoll.ts | 66 | Verankerungsprotokoll: Ergebnisse der Ankerprüfungen (Zugversuche) je Prüfzone. – Es gibt bewusst KEINE vorgegebenen Prüflasten oder Grenzwerte: Die Werte trägt die | AnkerErgebnis, AnkerZeile, Verankerung, ERGEBNIS_LABEL, leereZeile (+5) | 0 | components 1, lib 1 | 1 |
| lib/verlaengern-lager.ts | 53 | Verlängert man eine Baustelle, bleibt ihr Material länger dort. Offene Transportaufträge, die dieses Material – von der Baustelle zu einer anderen Baustelle bringen sollten, sind dann zu früh geplant. | OffenerTransport, LagerKonflikt, LagerWarnung, lagerKonflikteBeiVerlaengerung | 0 | app 1 | 1 |
| lib/vertrag-upload-client.ts | 41 | SCAFFOLD OS – Vertragsdokument-Upload (Phase 28) | HochgeladeneDatei, uploadVertragsdokument | 1 | app 6, components 11, lib 2 | 0 |
| lib/worktime.ts | 61 | SCAFFOLD OS – Arbeitszeit-/Pausen-Logik (Zeiterfassung Nr. 6) | BREAK_RULE_TEXT, autoBreakMinutes, computeNetHours, workdaysInMonth | 0 | app 3 | 0 |
| lib/zwischenaufmass.ts | 135 | SCAFFOLD OS – Zwischenaufmaß je Stichtag (reine Logik) | Zwischenaufmass, zwischenaufmassNr, naechsteZwischenaufmassNr, normalisiereZwischenaufmasse, letzteKumulierteFlaeche (+7) | 0 | components 2 | 1 |

## lib/actions (4 Dateien, 1263 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/actions/employees.ts | 737 | SCAFFOLD OS – Mitarbeiter-Planung Server Actions | getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee (+15) | 5 | app 3, components 1 | 0 |
| lib/actions/inventory.ts | 383 | SCAFFOLD OS – Lager-Modul Server Actions | getInventory, getInventoryItem, createInventoryItem, updateInventoryItem, deleteInventoryItem (+7) | 2 | app 1 | 0 |
| lib/actions/media.ts | 107 |  | ProjectMedia, uploadProjectMedia, getProjectMedia, deleteProjectMedia, attachPhotosToProject | 1 | – | 0 |
| lib/actions/project.ts | 36 |  | saveProject | 1 | – | 0 |

## lib/cad (58 Dateien, 9044 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/cad/ansicht-bild.ts | 7 | Dateiname für das gespeicherte Bild der 3D-Ansicht, z. B. „CAD-Ansicht-Praesentation-2026-10-23.png“. | ansichtDateiname | 0 | app 1 | 1 |
| lib/cad/arbeitsstand.ts | 71 | SCAFFOLD OS – CAD-Arbeitsstand im Browser | ARBEITSSTAND_KEY, Arbeitsstand, pruefeArbeitsstand, speichereArbeitsstand, ladeArbeitsstand (+3) | 1 | app 1, components 1 | 1 |
| lib/cad/aufmass-zu-cad.ts | 167 | SCAFFOLD OS – Aufmaß → CAD | AufmassFuerCad, CadUebernahme, aufmassZuCad, CAD_UEBERNAHME_KEY, CadUebergabe (+1) | 3 | app 2, components 1 | 1 |
| lib/cad/bauabschnitt.ts | 110 | SCAFFOLD OS – 2. Bauabschnitt: das Gerüst aus dem CAD-Modell auf eine geringere Höhe kappen. | GekapptesModell, kappeModellAufHoehe, kappeMaterial | 2 | lib 1 | 2 |
| lib/cad/baukoerper-erkennung.ts | 266 | SCAFFOLD OS – Gebäudeteile automatisch erkennen (Schiff, Turm, Chor, Anbau …) | ErkannterTeil, BaukoerperErgebnis, erkenneBaukoerper, abschnitteAusBaukoerpern | 2 | lib 3 | 2 |
| lib/cad/bauteil-farben.ts | 30 | Farben der Gerüst-Bauteile im Farbmodus „Nach Bauteil“ (3D und Legende). – Jede Bauteilart hat eine eigene, gut unterscheidbare Farbe. | BAUTEIL_FARBEN, FarbModus, bauteilFarbe | 0 | app 1, components 1 | 1 |
| lib/cad/dxf-umriss.ts | 826 | SCAFFOLD OS – DXF-Linien lesen: Gebäudeumriss aus einer CAD-Zeichnung (Grundriss) | DxfForm, DXF_FORM_NAME, DxfOptionen, DxfAbbildung, DxfTextAngaben (+12) | 5 | components 1, lib 2 | 3 |
| lib/cad/dxf-zeichnen.ts | 74 | SCAFFOLD OS – Umriss per Klick zeichnen: Fangen (Raster, Punkte, Waagerecht/Senkrecht) – und Umwandlung der gezeichneten Figuren in einen DXF-Text, der durch denselben Leseweg | ZPunkt, FangOptionen, FangArt, fangePunkt, kantenLaenge (+2) | 0 | components 2 | 1 |
| lib/cad/fassade-anpassung.ts | 149 | SCAFFOLD OS – Gerüst an die Fassade anpassen (Wandabstand aus der Gebäudehülle) | STANDARD_WANDABSTAND_M, WANDABSTAND_SCHRITT_M, AnpassungSchritt, AnpassungErgebnis, passeWandabstandAn (+3) | 3 | app 1 | 1 |
| lib/cad/feldtest-analyse.ts | 229 | SCAFFOLD OS – Feldtest: Datei einlesen und mit der BESTEHENDEN Erkennung auswerten | FELDTEST_ENDUNGEN, eingangstypAusName, AnalyseOptionen, FeldtestAnalyse, MAX_PUNKTE_BROWSER (+3) | 4 | app 1 | 1 |
| lib/cad/feldtest-stempel.ts | 10 | Versions-Stempel für das Feldtest-Protokoll: welche Software-Version hat gemessen? – Version aus package.json; Stand = Git-Commit des Builds, wenn die Plattform ihn bereitstellt | softwareStempel | 0 | app 1 | 0 |
| lib/cad/feldtest.ts | 186 | SCAFFOLD OS – Feldtest-Protokoll: Ist gegen Soll, Abweichung, Ampel | Ampel, WertArt, SollQuelle, SOLL_QUELLE_NAME, AMPEL_GRENZEN (+16) | 0 | app 1, lib 2 | 2 |
| lib/cad/geruest-entfernen.ts | 150 | SCAFFOLD OS – Gerüst aus dem Modell des echten Gebäudes entfernen (nur zur Anzeige) | RAND_M, GROSSES_DREIECK_M2, GeruestMaske, GebaeudeAnker, geruestMaske (+2) | 3 | lib 2 | 1 |
| lib/cad/geruest-modell.ts | 261 | SCAFFOLD OS – Turmschaft in Modellen mit eingebautem Gerüst erkennen | GeruestLagen, findeGeruestLagen, wandDrehung, AnbauDach, findeAnbauDach (+2) | 1 | lib 2 | 2 |
| lib/cad/glb-masse.ts | 107 | SCAFFOLD OS – Gerüstmaße direkt aus der GLB-Hülle eines einzelnen Hauses | GlbMasse, masseAusDreiecken, glbHatTurmKoerper | 0 | app 1, components 1 | 1 |
| lib/cad/glb-oeffnungen.ts | 52 | SCAFFOLD OS – Messpunkte aus GLB-Dreiecken für die Öffnungserkennung | GlbPlatzierung, punkteAusDreiecken | 0 | app 1 | 1 |
| lib/cad/glb-teile.ts | 15 | Bauteile in einer GLB-Datei erkennen, die wir beim Anzeigen ausblenden oder als Anker nutzen. – Modelle aus KI-Werkzeugen oder Blender-Exporten haben oft benannte Knoten („Geruest_…“, „Kirchturm_Baukörper“). | istGeruestKnoten, istSockelKnoten, sollEntfallen, istTurmKoerperKnoten | 0 | app 1, components 2 | 2 |
| lib/cad/gltf-dreiecke.ts | 149 | SCAFFOLD OS – glTF/GLB → Dreiecks-Suppe (Brücke zum bestehenden OBJ/STL-Weg) | GLTF_MAX_DREIECKE, GltfDachForm, GltfGebaeudeMasse, GltfErgebnis, gebaeudeMasseAusUserData (+2) | 0 | app 1, components 1, lib 1 | 2 |
| lib/cad/grundriss-erkennung.ts | 363 | SCAFFOLD OS – Grundriss (Umriss) automatisch aus 3D-Daten erkennen | Punkt2, Dreieck2, GrundrissForm, GrundrissErgebnis, huelle (+9) | 1 | components 1, lib 2 | 2 |
| lib/cad/haube.ts | 30 | Turmhaube (Zwiebelhaube mit Laterne und Spitze) – reine Darstellung, kein Einfluss auf Gerüst, Mengen oder LV. – Das Profil ist eine Standardform, aus der Ansicht eines Turms mit Zwiebelhaube im Maßstab 1:100 abgemessen | HaubenForm, HAUBEN_FORMEN, istHaubenForm, HAUBEN_PROFIL, walmSockelHoehe (+1) | 0 | components 1, lib 2 | 1 |
| lib/cad/huelle.ts | 80 | SCAFFOLD OS – Gebäudehülle aus der angezeigten Punktwolke, im Koordinatensystem des CAD-Modells | HuellePlatzierung, platziereAnzeigePunkte, huelleAusAnzeigePunkten, KappenErgebnis, kappeHuelle | 1 | app 1, components 1 | 2 |
| lib/cad/ifc-einleser.ts | 335 | SCAFFOLD OS – IFC lesen: BIM-Modell → Geschosse, Umriss, Gebäudeteile (reine Geometrie, keine KI) | IFC_MAX_BYTES, IFC_WARN_BYTES, IfcFehlerGrund, IfcFehlschlag, IfcGeschoss (+13) | 5 | components 1, lib 1 | 2 |
| lib/cad/ifc-grundriss.ts | 270 | SCAFFOLD OS – Grundriss aus projizierten Dreiecken (IFC-Import) | Punkt2, Raster, rasterFuer, neueMaske, fuelleDreiecke (+5) | 0 | lib 1 | 0 |
| lib/cad/ifc-import-client.ts | 163 | SCAFFOLD OS – IFC-Import über den Worker (Phase 89), Browser-Seite | IfcImportOptionen, IfcImportDeps, IfcImportErgebnis, dateiPruefen, baueSpeicherPfad (+2) | 4 | components 1 | 1 |
| lib/cad/ifc-import.ts | 54 | SCAFFOLD OS – IFC-Import über den Hetzner-Worker (Phase 89): gemeinsame Regeln für Route und Oberfläche | IFC_IMPORT_MAX_BYTES, IFC_IMPORT_BUCKET, KOPF_BYTES, ENDE_BYTES, speicherPfadGueltig (+3) | 1 | app 1, lib 1 | 1 |
| lib/cad/ifc-testmodelle.ts | 181 | SCAFFOLD OS – Synthetische Mini-IFCs mit bekannten Maßen (Testmodelle für den IFC-Import) | IfcGeschossSpez, IfcSpez, erzeugeIfc, HAUS_MASSE, hausZweiGeschosse (+4) | 0 | – | 2 |
| lib/cad/katalog-zuordnung.ts | 372 | SCAFFOLD OS – Zuordnung CAD-Bauteil → Hersteller-Katalogartikel (MJ-Gerüst, Layher) | SYSTEM_ZU_LISTE, katalogListeFuerSystem, artikelMassM, artikelGewichtKg, artikelBezeichnung (+10) | 3 | app 2, components 3, lib 3 | 2 |
| lib/cad/kirche-vorlage.ts | 73 | Eingaben für die Vorlage „Kirche mit Turm": Turm links am Kirchenschiff, optional ein Chor am anderen Ende. | KircheMasse, KIRCHE_STANDARD, pruefeKircheMasse, kircheAlsGebaeude, kircheUebernehmen | 2 | components 1 | 4 |
| lib/cad/kollision.ts | 233 | SCAFFOLD OS – Kollisionsprüfung: Gerüst gegen Gebäudenetz und Gerüstbauteile untereinander | KOLLISION_TOLERANZ_M, Obb, obbVonBauteil, NetzIndex, punktImNetz (+7) | 2 | lib 2 | 1 |
| lib/cad/lidar-teile.ts | 45 | Gebäudeteile (Haus, Garage, Anbau …) aus den Punkten einer LiDAR-Datei. – Gemeinsam genutzt von der Upload-Route und – als Bündel (workers/punktwolke/teile.js) – vom Punktwolken-Worker. | LidarTeil, LidarTeile, teileAusLidarPunkten | 1 | app 1 | 1 |
| lib/cad/lod2-citygml.ts | 249 | SCAFFOLD OS – Amtliche 3D-Gebäudemodelle (LoD2, CityGML 1.0/2.0) einlesen | Lod2Gebaeude, utm32AusWgs84, lod2KachelNrw, leseLod2Gebaeude, findeGebaeudeAmPunkt (+1) | 1 | components 1 | 1 |
| lib/cad/mj-geometrie.ts | 213 | SCAFFOLD OS – 3D-Formen nach dem Aussehen der MJ-Gerüst-Bauteile (COMBI/OPTIMA) | LOCHSCHEIBE_DURCHMESSER_M, STIEL_RADIUS_M, baueLochscheibe, baueFussspindel, baueUniRahmen (+3) | 0 | components 1 | 1 |
| lib/cad/modell-analyse.ts | 239 | SCAFFOLD OS – Gebäudemodell analysieren: eine Eingangsstelle für OBJ/STL (Dreiecke) und PLY (Punkte) | TeilTyp, TeilQuelle, GebaeudeTeil, ModellAnalyse, schaetzeEinheit (+9) | 5 | components 1, lib 6 | 8 |
| lib/cad/modell-aussehen.ts | 128 | SCAFFOLD OS – Aussehen des echten Gebäudes (nur zur Anzeige im 3D-Modell) | PUNKTE_MAX, AUSSEHEN_MAX_BYTES, Aussehen, AussehenErgebnis, istGlb (+2) | 1 | app 1, components 5, lib 4 | 1 |
| lib/cad/modell-import.ts | 186 | SCAFFOLD OS – 3D-Modell-Import (OBJ, STL) → Gebäude-Außenmaße | Achse, Einheit, EINHEIT_FAKTOR, Quader, quaderAusObj (+7) | 0 | app 1, components 1, lib 6 | 7 |
| lib/cad/modell-speicher.ts | 196 | SCAFFOLD OS – Zwischenspeicher für 3D-Modelle im Browser (IndexedDB) | SpeicherName, Speicher, GemerktesModell, NwdErgebnisEintrag, NWD_CACHE_MAX_EINTRAEGE (+13) | 1 | app 1, components 1, lib 1 | 2 |
| lib/cad/modell-veraltet.ts | 17 | SCAFFOLD OS – Zeigt, wenn das Gerüst nicht mehr zu den Eingaben passt | eingabeStandGeruest, istGeruestVeraltet | 1 | app 1 | 1 |
| lib/cad/nachbardach.ts | 57 | SCAFFOLD OS – Dach eines angrenzenden Gebäudeteils (Rückfall für Überbrückung und Dachschutz) | NACHBARDACH_BREITE_M, NachbarDach, nachbarDach, nachbarDachHinweis | 1 | lib 1 | 1 |
| lib/cad/netz-csg.ts | 168 | SCAFFOLD OS – Boolesche Operationen auf geschlossenen Netzen (Vereinigung, Differenz, Schnitt) | BoolOp, CSG_MAX_DREIECKE, CsgErgebnis, boolescheOperation | 1 | – | 2 |
| lib/cad/netz.ts | 211 | SCAFFOLD OS – Dreiecksnetze: Datentyp, Kennzahlen und Gebäudehülle aus einer Punktwolke | Netz, Box3, leeresNetz, anzahlDreiecke, netzGrenzen (+8) | 0 | components 2, lib 5 | 4 |
| lib/cad/nwd-client.ts | 137 | SCAFFOLD OS – NWD-Import im Browser: hochladen → Konvertierung abwarten → Ergebnis einlesen | NWD_ABFRAGE_MS, NWD_MAX_WARTEN_MS, NWD_MAX_BYTES_CLIENT, NWD_HINWEIS, NwdPhase (+6) | 3 | components 1 | 2 |
| lib/cad/obj-export.ts | 30 | SCAFFOLD OS – Dreiecke als OBJ-Text (für die Fehlersuche: „Modell speichern“) | dreieckeZuObj, netzZuObj | 0 | components 2 | 2 |
| lib/cad/obj-mtl-zu-glb.ts | 143 | SCAFFOLD OS – OBJ (+ MTL + Texturbilder) für die Anzeige des echten Gebäudes | DateiSatz, sortiereDateien, texturDateiname, aussehenAusDateien | 5 | app 1 | 1 |
| lib/cad/oeffnungen.ts | 164 | SCAFFOLD OS – Öffnungen (Türen, Fenster) in den Fassaden aus der Punktwolke erkennen – nur als VORSCHLAG | OeffnungsSeite, Oeffnung, WandBefund, OeffnungsErgebnis, OeffnungsGebaeude (+3) | 1 | app 1, components 1 | 2 |
| lib/cad/portal-erkennung.ts | 98 | SCAFFOLD OS – Portal / Vorbau an einer Turmwand erkennen (nur als VORSCHLAG für eine Tür) | SchaftLage, ErkanntesPortal, erkennePortale, portalAlsTuer | 1 | components 1, lib 1 | 1 |
| lib/cad/praesentation-material.ts | 125 | SCAFFOLD OS – Materialien für den Präsentationsmodus der 3D-Ansicht | PRAESENTATION_ROHR, PRAESENTATION_HINTERGRUND, getBacksteinTex, getGrasTex, getSchieferTex (+1) | 0 | components 1 | 0 |
| lib/cad/projektdatei.ts | 218 | SCAFFOLD OS – CAD-Projektdatei (speichern und wieder laden) | PROJEKTDATEI_FORMAT, PROJEKTDATEI_VERSION, Projektdatei, LeseErgebnis, erzeugeProjektdatei (+1) | 5 | app 1 | 4 |
| lib/cad/punktwolke-lesen.ts | 109 | SCAFFOLD OS – Scan-Dateien im Browser lesen (E57, PTX, LAS, XYZ/PTS/TXT/CSV) für „Echtes Gebäude laden“ | PunkteMitFarbe, SCAN_ENDUNGEN, istScanEndung, parseLasEinfach, fuerAnzeige (+2) | 2 | components 1, lib 1 | 1 |
| lib/cad/punktwolke-teile.ts | 12 | Einstiegspunkt für den KI-Worker (Punktwolke PLY): liefert die Gebäudeteile als einfaches JSON. – Der Worker bekommt diese Datei als gebündeltes JavaScript (workers/ki/teile.js, Skript: npm run build:worker-teile). | PunktwolkeTeile, teileAusPunkten | 1 | lib 1 | 0 |
| lib/cad/punktwolke-werkzeuge.ts | 113 | SCAFFOLD OS – Punktwolke bereinigen und messen | Maske, Box, maskeBox, maskeAusreisser, maskeHoeheBis (+8) | 0 | components 3 | 1 |
| lib/cad/pylon-geruest.ts | 115 | Gerüst um einen geneigten Körper (z. B. Pylonschenkel einer Schrägseilbrücke). | PylonEingabe, PylonLage, PylonErgebnis, rechnePylonGeruest | 0 | app 1 | 1 |
| lib/cad/registrierung.ts | 369 | SCAFFOLD OS – Scans zusammenführen (Registrierung) | V3, Starr, identitaet, wendeStarrAn, verkette (+13) | 0 | components 3, lib 1 | 2 |
| lib/cad/scan-zusammenfuehren.ts | 105 | SCAN-ZUSAMMENFÜHREN – Ablauf für die Oberfläche (reine Funktionen, ohne Browser-Bezug) | Draufsicht, erzeugeDraufsicht, hoeheAn, Weg, ScanZuordnung (+2) | 1 | components 3 | 1 |
| lib/cad/stabwerk.ts | 129 | SCAFFOLD OS – Stabwerk-Ansicht für den Statiker | StabArt, Punkt, Stab, StabwerkBauteil, Stabwerk (+2) | 0 | components 1 | 1 |
| lib/cad/teilabbau.ts | 160 | SCAFFOLD OS – Teilabbau: Was wird abgebaut, wie viel Material, wie viele Stunden, wie lange mit wie vielen Leuten? | TeilabbauAuswahl, TeilabbauSchritt, TeilabbauErgebnis, berechneTeilabbau | 2 | app 1, components 1 | 3 |
| lib/cad/treppen-geometrie.ts | 90 | SCAFFOLD OS – Geometrie des Treppenturms (Zickzack-Läufe) | TreppenMasse, treppenTeile | 0 | components 1 | 0 |
| lib/cad/umgebung-layout.ts | 167 | SCAFFOLD OS – Umgebung der 3D-Ansicht: Platzierung (reine Rechnung, keine Darstellung) | Rechteck, UMGEBUNG_ABSTAND, BaumArt, BaumPlatz, BuschPlatz (+7) | 1 | components 1 | 1 |
| lib/cad/verlauf.ts | 38 | Rückgängig / Wiederholen für einen Zustand (hier: die Gebäudedaten im CAD). – Reine Funktionen, damit sich das Verhalten testen lässt. Schnelle Folgeänderungen (z. B. Tippen in einem | Verlauf, VERLAUF_MAX, VERLAUF_ZUSAMMENFASSEN_MS, verlaufNeu, verlaufSetze (+2) | 0 | app 1 | 1 |

## lib/calculations (14 Dateien, 5712 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/calculations/article-prices.ts | 117 | lib/calculations/article-prices.ts – Lädt Artikelpreise aus Supabase (inventory-Tabelle) | ArticleMaster, ArticlePricesErgebnis, loadArticlePrices, loadArticlePricesMitQuelle | 0 | app 1, lib 1 | 1 |
| lib/calculations/cad-engine.ts | 2704 | lib/calculations/cad-engine.ts – SCAFFOLD OS – CAD Geometrie-Engine v3 | TREPPEN_PODEST_M, BuildingSection, BINDER_UNTERKANTE_M, DURCHGANG_ARTIKELNUMMER, GeruestOptionen (+56) | 5 | app 2, components 12, lib 32 | 49 |
| lib/calculations/cad-kosten.ts | 47 | SCAFFOLD OS – Lohn- und Transportkosten für Angebote aus dem CAD | CadKostenEinstellungen, CadKosten, berechneCadKosten | 0 | app 1 | 1 |
| lib/calculations/cad-lager.ts | 63 | SCAFFOLD OS – CAD-Stückliste mit den Lager-Daten der Firma | LagerZeile, LagerAnwendung, wendeLagerAn | 1 | app 1 | 2 |
| lib/calculations/cad-platzierung.ts | 116 | SCAFFOLD OS – Platzieren und Verschieben von Katalog-Bauteilen im CAD | platzierungAusTreffer, verschiebePlatzierung, gleicheLage, platzierungIdVon | 1 | app 1 | 1 |
| lib/calculations/cad-rules.ts | 413 | lib/calculations/cad-rules.ts – SCAFFOLD OS – CAD Regel-Engine | RuleSeverity, CADRule, RuleCheckParams, RuleCheckResult, CAD_RULES (+6) | 3 | app 2, lib 1 | 1 |
| lib/calculations/cad-umriss.ts | 163 | SCAFFOLD OS – Gebäude-Umriss (Polygon) für das CAD | UmrissPunkt, UmrissKante, UmrissEcke, UMRISS_MIN_PUNKTE, UMRISS_MAX_PUNKTE (+13) | 0 | components 2, lib 4 | 8 |
| lib/calculations/disposition.ts | 333 | lib/calculations/disposition.ts – SCAFFOLD OS – Dispositions- & Transport-Optimierungs-Engine | SiteStock, CentralStock, DispositionSuggestion, DispositionResult, OptimizedRoute (+1) | 1 | app 2, components 1, lib 1 | 0 |
| lib/calculations/geruest-systeme.ts | 248 | lib/calculations/geruest-systeme.ts – SCAFFOLD OS – Gerüstsysteme / Hersteller-Datenbank | SystemBauart, GeruestSystem, GERUEST_SYSTEME, CUSTOM_SYSTEM_ID, findeSystem (+1) | 1 | app 3, components 2, lib 4 | 5 |
| lib/calculations/ki-rules.ts | 499 | lib/calculations/ki-rules.ts – SCAFFOLD OS – KI-Regel-Engine | runKIRules, checkRule, getCriticalRules, getRulesForField | 1 | hooks 1 | 0 |
| lib/calculations/m2-abrechnung.ts | 45 | SCAFFOLD OS – Abrechnung nach m²: Grundpreis (je Gerüsttyp) + Aufpreise, mal Gerüstfläche. – Reine Rechenfunktionen (kein Zugriff auf Datenbank), damit sie getestet werden können. | AbrechnungArt, AbrechnungEintrag, MAX_PREIS_M2, pruefeAbrechnungEintrag, M2Ergebnis (+1) | 0 | app 1, components 1 | 1 |
| lib/calculations/modell-stand.ts | 117 | SCAFFOLD OS – Modellstand und Eingabekonsistenz | textHash, modellHash, stuecklisteFingerprint, stundenFingerprint, eingabeFingerprint (+3) | 2 | lib 2 | 2 |
| lib/calculations/scaffold-engine.ts | 723 | lib/calculations/scaffold-engine.ts – SCAFFOLD OS – KI-Materialberechnungs-Engine | geruesttypZuScaffoldType, CostSettings, artikelFuerFeldlaenge, calculateScaffoldMaterial | 2 | app 2, lib 1 | 4 |
| lib/calculations/topology-graph.ts | 124 | SCAFFOLD OS – Topologischer Knoten-Graph (Architektur-Dokument – Punkt 1: "Topologischer Achs-Graph") | GraphNode, GraphEdge, TopologieGraph, buildTopologyGraph, pruefeKnotenIsolation | 1 | app 1 | 0 |

## lib/data (2 Dateien, 259 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/data/katalog-serien.ts | 60 | SCAFFOLD OS – Serien aus den Preislisten (ohne eigenes CAD-System) | KatalogSerie, KATALOG_SERIEN, KATALOG_SERIE_PREFIX, findeKatalogSerie, angeboteneKatalogSerien (+1) | 1 | app 1, lib 2 | 1 |
| lib/data/zulassung-lastklassen.ts | 199 | SCAFFOLD OS – Lastklassen der Beläge laut allgemeiner bauaufsichtlicher Zulassung | LkStufe, BelagLastklasse, LastklassenTabelle, LASTKLASSEN_TABELLEN, maxLastklasse (+4) | 1 | lib 3 | 1 |

## lib/export (11 Dateien, 1712 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/export/dxf-export.ts | 78 | SCAFFOLD OS – DXF-Export des Gerüstplans | dxfText, ordneUntereinander, erzeugeDxf | 1 | lib 1 | 0 |
| lib/export/feldtest-pdf.ts | 115 | SCAFFOLD OS – Feldtest-Protokoll als lesbares PDF (zum JSON-Protokoll, gleiche Daten) – Echtes PDF (jsPDF). Standardschrift: Sonderzeichen über pdfText ersetzen. | AMPEL_TEXT, erzeugeFeldtestPdf | 2 | app 1 | 1 |
| lib/export/ifc-export.ts | 147 | SCAFFOLD OS – IFC-Export (Marktvergleich, Architektur-Dokument – Punkt 5: BIM/IFC-Export) | generateIFC, downloadIFC | 1 | app 1 | 0 |
| lib/export/lastannahmen-pdf.ts | 149 | SCAFFOLD OS – Lastannahmen-Blatt und Prüfprotokoll als PDF | pdfText, erzeugeLastannahmenPdf | 4 | lib 2 | 1 |
| lib/export/lastannahmen.ts | 179 | SCAFFOLD OS – Lastannahmen-Blatt für den Statiker (Daten) | LastannahmenOptionen, NICHT_ANGEGEBEN, LastZeile, LastSektion, LastannahmenDaten (+1) | 8 | lib 2 | 2 |
| lib/export/lv-export.ts | 230 | SCAFFOLD OS – Export des Leistungsverzeichnisses (PDF und Excel) | erzeugeLvPdf, erzeugeLvXlsx | 1 | components 2 | 0 |
| lib/export/pdf-export.ts | 446 | lib/export/pdf-export.ts – SCAFFOLD OS – PDF Export Service | PDFExportOptions, generatePDFHTML, downloadPDF, generateMontageplan, generateMontageplanHTML | 2 | app 2 | 0 |
| lib/export/plan-pdf.ts | 77 | SCAFFOLD OS – Gerüstplan als PDF (Vektorzeichnung) | PlanPdfOptionen, erzeugePlanPdf | 1 | lib 1 | 0 |
| lib/export/statik-excel.ts | 82 | SCAFFOLD OS – Statik-Daten als Excel-Datei (.xlsx) | erzeugeStatikExcel | 5 | lib 1 | 1 |
| lib/export/statiker-paket.ts | 104 | SCAFFOLD OS – Statiker-Paket | StatikerPaketEingabe, stuecklisteOhnePreiseCsv, paketDateien, erzeugeStatikerPaket | 10 | app 1 | 1 |
| lib/export/zip.ts | 105 | SCAFFOLD OS – minimaler ZIP-Schreiber (ohne Kompression, ohne Zusatzpaket) | ZipDatei, crc32, erzeugeZip | 0 | lib 1 | 1 |

## lib/geruest (4 Dateien, 906 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/geruest/plan-zeichnung.ts | 369 | SCAFFOLD OS – Gerüstplan als Zeichnung (Linien + Text) | PlanModus, ZLayer, ZLinie, ZText, ZGrenzen (+7) | 2 | lib 3 | 3 |
| lib/geruest/platzierung.ts | 189 | SCAFFOLD OS – Bauteile des Gerüstplans (Komponentenmodus) | BauteilTyp, PlanBauteil, SZENE_Z_VERSATZ_M, STAENDER_M, ansichtBauteile (+3) | 1 | lib 1 | 1 |
| lib/geruest/regelpruefung.ts | 229 | SCAFFOLD OS – Regelprüfung (Report-Modus) nach DIN EN 12811-1 | PruefStatus, Pruefergebnis, Pruefprotokoll, PRUEF_HINWEIS, SYSTEME_MIT_REGELAUSFUEHRUNG (+4) | 7 | components 1, lib 5 | 4 |
| lib/geruest/richtwert-regeln.ts | 119 | SCAFFOLD OS – Richtwert-Regeln aus den Zulassungs-Eckdaten des Katalogs | RichtwertKatalog, ECHTER_KATALOG, RichtwertOptionen, datumZahl, richtwertErgebnisse | 5 | lib 1 | 1 |

## lib/inventory (1 Dateien, 236 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/inventory/buchung.ts | 236 | lib/inventory/buchung.ts – SCAFFOLD OS – Zentrale Lagerbuchungs-Funktion | BucheParams, BucheErgebnis, bucheAusZentrallager, bestaetigeAnlieferung | 0 | app 3, lib 1 | 0 |

## lib/nwd (4 Dateien, 645 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/nwd/aps.ts | 226 | SCAFFOLD OS – Autodesk Platform Services (APS), Model Derivative: kleiner REST-Client für den NWD-Import | APS_BASIS, ApsKonfig, apsKonfig, ApsFehlerCode, ApsFehler (+17) | 0 | app 2, lib 1 | 3 |
| lib/nwd/job.ts | 275 | SCAFFOLD OS – NWD-Import: Auftrags-Ablauf (Job-Lebenszyklus), Kosten-Schutz, Aufräumen | NWD_MAX_BYTES, NWD_WARTEZEIT_MS, NWD_ABSTAND_MS, NWD_TAGESLIMIT_STANDARD, ERGEBNIS_MAX_BYTES (+23) | 2 | app 3 | 2 |
| lib/nwd/obj-verdichten.ts | 118 | SCAFFOLD OS – OBJ-Ergebnis von Autodesk verdichten (Streaming) | VERDICHTEN_MAX_DREIECKE, VERDICHTEN_ZELLEN, VerdichtErgebnis, verdichteObjStrom | 0 | lib 1 | 1 |
| lib/nwd/zugang.ts | 26 | Gleiche Rollen wie der CAD-Bereich (proxy.ts: /cad → admin, disponent, bauleiter). | NWD_ROLLEN, darfNwdKonvertieren, geheimnisGleich, ergebnisUrl | 2 | app 3 | 0 |

## lib/offline (2 Dateien, 75 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/offline/cache-leeren.ts | 15 | Beim Abmelden alle zwischengespeicherten Seiten und Dateien dieses Geräts löschen (geteilte Geräte, Datenschutz). – Läuft ohne Service Worker (z. B. Entwicklung) einfach ins Leere. | loescheOfflineKopien | 0 | app 1, components 3 | 0 |
| lib/offline/nachsenden.ts | 60 | SCAFFOLD OS – Offline Stufe 3: Auto-Speichern nachsenden, sobald wieder Netz da ist | NACHSENDEN_KEY, Ausstehend, leseAusstehend, anzahlAusstehend, merkeEntwurf (+6) | 0 | components 1, lib 2 | 1 |

## lib/provision (6 Dateien, 837 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/provision/kunden-schema.ts | 4 | GENERIERT aus supabase/kunden-schema.sql – NICHT von Hand ändern! – Erzeugt von scripts/build-kunden-schema.mjs (prebuild-Schritt). | KUNDEN_SCHEMA | 0 | lib 1 | 0 |
| lib/provision/orchestrate.ts | 344 | SCAFFOLD OS – Kunden-Setup-Paket – Provisionierungs-Orchestrator | TenantRow, loadTenant, runProvision | 5 | app 2 | 0 |
| lib/provision/smoketest.ts | 71 | SCAFFOLD OS – Smoke-Test nach der Provisionierung (Phase 17) | SmokeErgebnis, smokeTest | 0 | lib 1 | 0 |
| lib/provision/supabase-mgmt.ts | 201 | SCAFFOLD OS – Kunden-Setup-Paket – Supabase Management API (nur fetch, kein createClient!) | SupabaseProjectInfo, createSupabaseProject, waitForHealthy, getProjectApiKeys, runSqlOnProject (+4) | 0 | app 3, lib 1 | 0 |
| lib/provision/uptimerobot.ts | 65 | SCAFFOLD OS – UptimeRobot-Monitoring (Sprint 1, Automatisierung) | createUptimeMonitor, deleteUptimeMonitor | 0 | app 1, lib 1 | 0 |
| lib/provision/vercel.ts | 152 | SCAFFOLD OS – Kunden-Setup-Paket – Vercel API (nur fetch) | VercelEnvVar, createVercelProject, addDomainToProject, triggerInitialDeployment, deleteVercelProject | 0 | app 1, lib 1 | 0 |

## lib/supabase (2 Dateien, 40 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/supabase/client.ts | 8 |  | createClient | 0 | app 9, components 5, lib 4 | 0 |
| lib/supabase/server.ts | 32 |  | createClient | 0 | app 70, lib 10 | 0 |

## lib/touren (6 Dateien, 426 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| lib/touren/abholung.ts | 29 | SCAFFOLD OS – Abholfahrt (Abbau beim Kunden) | ABHOL_MARKER, AbholZeile, baueAbholNotiz, leseAbholNotiz | 0 | lib 3 | 1 |
| lib/touren/berechtigung.ts | 82 | SCAFFOLD OS – Zuständigkeits-Prüfung für Touren/Tour-Stopps (Phase 90) | darfStoppAendern, eigeneEmployeeId, istAdminOderDispo, standortErfassungAktiv | 2 | app 5 | 0 |
| lib/touren/fuehrerschein.ts | 59 | SCAFFOLD OS – Führerschein-Klassen ↔ Fahrzeuggewicht (Phase 91) | FUEHRERSCHEIN_KLASSEN, FuehrerscheinKlasse, erforderlicheKlasse, darfFahrzeugFahren | 0 | app 4, lib 1 | 0 |
| lib/touren/hof.ts | 64 | SCAFFOLD OS – Hilfsfunktionen "Vom Hof gefahren / Zurück auf dem Hof" | fahrtdauerMinuten, formatDauer, formatUhrzeit, istGueltigePosition, hofSpalteFehlt (+1) | 0 | app 4, lib 1 | 1 |
| lib/touren/packliste.ts | 99 | SCAFFOLD OS – Packliste einer Tour ("Meine Touren") | PackStopp, PackZeile, AbholOrt, KundenAbholung, TourPackliste (+2) | 1 | app 1 | 1 |
| lib/touren/stopp-gruppen.ts | 93 | SCAFFOLD OS – Stopps zu Karten zusammenfassen ("Meine Touren") | StoppLike, MaterialZeile, StoppGruppe, gruppiereStopps, uhrzeitKurz (+1) | 1 | app 1 | 2 |

## types (6 Dateien, 675 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| types/cad-dimensions.ts | 27 | types/cad-dimensions.ts – SCAFFOLD OS – Freie Bemaßung (CP-Pro-Marktvergleich) | CustomDimension | 0 | app 1, components 3 | 0 |
| types/cad-layers.ts | 65 | types/cad-layers.ts – SCAFFOLD OS – CAD-Ebenen/Layers (CP-Pro-Marktvergleich) | SideVisibility, kantenSchluessel, seitenBezeichnung, LevelVisibility, CADLayerState (+1) | 0 | app 1, components 3 | 1 |
| types/cad-notes.ts | 20 | types/cad-notes.ts – SCAFFOLD OS – CAD-Notizen/Anmerkungen an Bauteilen | CADNote | 0 | app 1, components 3, lib 1 | 0 |
| types/employees.ts | 140 | SCAFFOLD OS – Mitarbeiter-Planung TypeScript Types | EmployeeRole, EmployeeStatus, SkillLevel, AbsenceType, AbsenceStatus (+11) | 0 | app 3, lib 1 | 0 |
| types/inventory.ts | 128 | SCAFFOLD OS – Lager-Modul TypeScript Types | StockStatus, TransportStatus, TransportPriority, TransactionType, InventoryItem (+7) | 0 | app 1, lib 1 | 0 |
| types/scaffold.ts | 295 | types/scaffold.ts – SCAFFOLD OS – Zentrale Typ-Definitionen | TradeType, RoofForm, FacadeType, Obstacle, ScaffoldType (+18) | 0 | app 2, components 4, hooks 1, lib 16 | 13 |

## workers/ki (5 Dateien, 1870 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| workers/ki/ifc-import.js | 341 | SCAFFOLD OS – IFC-Import im Hetzner-Worker (Phase 89, Jobtyp 'cad-import') |  | 2 | workers 1 | 1 |
| workers/ki/ifc-lesen.js | 156 | SCAFFOLD OS – IFC lesen (gemeinsam für Browser-Import UND Hetzner-Worker, Phase 89) |  | 0 | lib 1, workers 1 | 1 |
| workers/ki/ifc-rahmen.js | 70 | SCAFFOLD OS – IFC-Rahmenprüfung (gemeinsam für Browser-Import UND Hetzner-Worker) |  | 0 | lib 2, workers 1 | 0 |
| workers/ki/index.js | 823 | SCAFFOLD OS – KI-Queue-Worker (Phase 65) — läuft auf Hetzner |  | 2 | – | 0 |
| workers/ki/teile.js | 480 | GENERIERT aus lib/cad/punktwolke-teile.ts – nicht von Hand ändern (npm run build:worker-teile) |  | 0 | workers 1 | 0 |

## workers/punktwolke (6 Dateien, 1576 Zeilen)

| Datei | Zeilen | Beschreibung (Dateikopf) | Exporte (Auszug) | nutzt | genutzt von | Tests |
|---|---|---|---|---|---|---|
| workers/punktwolke/analyse.js | 391 | ───────────────────────────────────────────────────────────────────────────── – SCAFFOLD OS – Punktwolken-Analyse (Worker-Version) |  | 4 | workers 1 | 3 |
| workers/punktwolke/index.js | 109 | ───────────────────────────────────────────────────────────────────────────── – SCAFFOLD OS – Punktwolken-Worker (läuft als Docker-Container, z. B. Hetzner) |  | 1 | – | 0 |
| workers/punktwolke/las-laz.js | 105 | SCAFFOLD OS – LAS und LAZ lesen (Drohnen-Punktwolken) |  | 0 | workers 1 | 1 |
| workers/punktwolke/ply-binary.js | 105 | SCAFFOLD OS – Binäres PLY (little/big endian) lesen (Worker-Kopie) |  | 0 | workers 1 | 1 |
| workers/punktwolke/teile.js | 515 | GENERIERT aus lib/cad/lidar-teile.ts – nicht von Hand ändern (npm run build:worker-teile) |  | 0 | workers 1 | 0 |
| workers/punktwolke/xyz-e57.js | 351 | SCAFFOLD OS – Punktwolken aus E57 und aus Textlisten (XYZ, PTS, TXT, CSV) lesen |  | 0 | lib 1, workers 1 | 2 |
