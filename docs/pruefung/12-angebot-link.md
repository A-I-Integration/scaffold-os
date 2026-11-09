# Angebots-Link: Ablauf und Widerruf

- Neuer Link gilt 60 Tage. Erneuter Versand des Angebots setzt die Frist neu (derselbe Link bleibt in alten Mails nutzbar).
- Links ohne Ablaufdatum (vor dieser Änderung versendet) gelten weiter, bis sie widerrufen werden – so bricht kein laufendes Angebot ab.
- Widerruf (Kundenseite, Bereich „Angebots-Link"): Link sofort gesperrt. Er wird nie wiederbelebt; erneutes Bereitstellen erzeugt einen neuen Link.
- Abgelaufen, widerrufen und unbekannt zeigen dem Kunden dieselbe Meldung (nichts verraten).
- API `/api/access-token`: GET Status, POST bereitstellen/verlängern, DELETE widerrufen (Admin, Disposition, Bauleiter).
- SQL: `supabase/phase-113-angebot-link-ablauf.sql` (zwei Spalten). Vor dem Merge ausführen; ohne die Spalten verhält sich alles wie bisher.
- Offen: Ablauf nach Annahme des Angebots ist nicht gesondert geregelt (Link läuft nach 60 Tagen wie jeder andere ab).
