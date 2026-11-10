# Statik-Dokumente (Büro ↔ Statiker)

**Anlass:** Ausschreibungen verlangen Ausführungspläne (10 Werktage vor Montagebeginn), Statik für Abweichungen, Konformitätsprüfung, Bescheinigung der Standfestigkeit und Verankerungsprotokoll. Die Planunterlagen des Bauherrn kommen als IFC/PDF.

**Was neu ist** (Kundenseite → Tab Dokumente, je Auftrag; und Statiker-Bereich je freigegebenem Projekt):
- Dateien ablegen mit Art (Entwurf, Bestand, Ausführungsplan, Berechnung, Montageanweisung, Konformität, Bescheinigung, Verankerungsprotokoll, Sonstiges) und Hinweis. Erlaubt: PDF, IFC, DWG, DXF, Bilder, Excel, Word, CSV, ZIP bis 50 MB. Upload über einen einmaligen, serverseitig erzeugten Link (keine 4,5-MB-Grenze der Server-Funktion).
- Schritte mit Datum: Pläne eingereicht, Pläne freigegeben, Konformitätsprüfung, Standfestigkeit bescheinigt. Dazu der Montagebeginn.
- Fristhinweis: Pläne spätestens 10 Werktage vor Montagebeginn einreichen; rot, wenn die Frist verpasst ist oder am Montagetag keine Freigabe steht.
- Rechte: Büro (Admin, Disposition, Bauleiter) alles. Statiker: nur seine freigegebenen Projekte, eigene Dateien löschen, Schritte „Konformitätsprüfung“ und „Bescheinigung“. Mitarbeiter und Lager: kein Zugriff.
- Nichts wird ausgelesen oder berechnet; SCAFFOLD OS legt ab und zeigt den Stand.

**Annahmen:** Werktage = Montag–Freitag, Feiertage nicht berücksichtigt (warnt eher zu früh). Dateien liegen im bestehenden Bucket project-media (öffentliche, nicht erratbare Adressen wie bei den bisherigen Dokumenten).

**Nicht getestet:** der Upload eines Statiker-Logins direkt in den Speicher mit dem Einmal-Link (hängt von der Speicher-Einstellung der Datenbank ab) und die Darstellung auf dem Bildschirm.

**SQL:** `supabase/phase-115-statik-dokumente.sql` (zwei Tabellen) vor dem Merge ausführen. Für neue Kunden-Datenbanken muss das Kundenschema später neu exportiert werden (wie bei Phase 112–114).
