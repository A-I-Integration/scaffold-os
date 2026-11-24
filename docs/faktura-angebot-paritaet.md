# Angebotswert: eine gemeinsame Rechnung

Aufmaß Schritt 6 (`calcAngebot`) rechnete Miete, Nachtrag, Statik, Rabatt und Festpreis mit `parseFloat`; Rechnung, Auftragsstand und Dashboard rechneten mit `zahlAusEingabe`. Bei Komma-Eingaben ("1,5 Wochen", "1.234,50") wich der Wert im Angebot daher von der Rechnung ab.

Jetzt rechnet `calcAngebot` über `berechneAngebot` (`lib/schlussrechnung.ts`), dieselbe Grundlage wie Rechnung und Dashboard. Verhalten sonst unverändert (Endpreis nie negativ, Skonto 2 % nur ausgewiesen). Absicherung: `__tests__/pruefung/angebot-paritaet.test.ts` (Schritt-6-Rechnung = Rechnungspositionen = Auftragsstand/Dashboard).

Wirkung: Angebote mit Komma-Eingaben in Miete/Nachtrag/Rabatt zeigen im Angebot (PDF, Kopfwert) jetzt den richtigen, mit der Rechnung übereinstimmenden Betrag. Bereits versendete Angebote werden nicht verändert.
