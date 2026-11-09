# Materialmanager (Verladeliste je Bauabschnitt)

**Was neu ist:** Seite `/materialmanager` (Admin, Disposition, Bauleiter; Lager nur lesen und exportieren).

- Stückliste eines Projekts in beliebig viele Abschnitte teilen (bis 30). Mengen je Position und Abschnitt von Hand,
  „Gleichmäßig verteilen“ (Summe bleibt exakt, ganze Stück) oder „Rest hierher“.
- Rest = noch keinem Abschnitt zugeordnet. Wird mehr verteilt als vorhanden, steht eine Warnung – es wird nichts still gekürzt.
- Ausgabe als PDF (je Abschnitt eigene Seite, Abhak-Kästchen, Unterschriftenzeilen, optional Bauteilbild) und Excel (ein Blatt je Abschnitt).
- Keine Preise in den Listen.

**Speicherung:** neue Tabelle `material_abschnitte` (Migration `supabase/phase-112-material-abschnitte.sql`), nur über die API.
Bewusst nicht in `projects.data`: sonst Überschreib-Risiko und eine Projektversion bei jedem Speichern.

**Regeln:** Position = Artikelnummer, sonst Name (klein, getrimmt); doppelte Zeilen werden addiert. Gewichte aus der Stückliste.

**Grenzen / offen**
- Bauteilbilder liegen nur im Browser (klein skaliert) und erscheinen nur im PDF, nicht in Excel. Ein zentraler Bildspeicher je Artikel ist ein eigener Schritt.
- Keine automatische Buchung ins Lager: die Liste ist eine Ladehilfe; Reservierung/Transport laufen weiter über die Angebotsannahme.
- Das CAD-„2. Bauabschnitt“ (Höhe kappen) ist unabhängig davon und bleibt unverändert.
- Nachkommastellen-Eingabe in den Mengenfeldern (z. B. Meterware) kann beim Tippen das Komma verschlucken; Stückzahlen sind nicht betroffen.

**Tests:** `__tests__/materialmanager.test.ts` (Teilung, Rundung, Warnungen, Excel/PDF, Prüfung der Daten), Rechte in `rechte-routen.test.ts`.
