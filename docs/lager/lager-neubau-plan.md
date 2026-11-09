# Lager-Neubau nach Belegprinzip – Plan

## Prinzip
- Bestand steht je **Artikel × Lagerort × Zustand** (`bestand`). Einzige Wahrheit nach Umstellung.
- Jede Bewegung ist ein **unveränderlicher Beleg** (`materialbelege` + `materialbeleg_positionen`) mit fester **Bewegungsart**. Fehler werden **storniert**, nie geändert.
- Gebucht wird nur über `buche_beleg()` / `storniere_beleg()` (eine Transaktion, Zeilensperren in fester Reihenfolge, kein negativer Bestand).
- Lagerorte: Standort → Lagerbereich → Lagerplatz (Regalplätze, mehrere Standorte), dazu Fahrzeug, Baustelle, Werkstatt, Sperrlager.
- Zustände: frei, reserviert, gesperrt, in_pruefung, defekt, reparatur.

## Bewegungsarten (Stufe 1)
AB Anfangsbestand · WE Wareneingang · AU Ausgabe/Zuteilung an Baustelle · AN Anlieferung · RN Rücknahme · UL Umlagerung · ZW Zustandswechsel · VL Verlust · IP/IM Inventurdifferenz · ST Storno (nur intern).

## Stufen
1. **Phase-108 (diese Lieferung):** nur neue Tabellen/Funktionen, Anfangsbestand aus `inventory`/`site_stock` übernommen (alte Tabellen unverändert). `v_bestand_abgleich` zeigt Abweichungen. Keine Bildschirme/Buchungswege geändert.
2. Verbraucher einzeln umstellen (je mit Kettentest): Umbuchen/Zustände + LKW (erste sichtbare Funktion), dann reserve, Tourabschluss, return, count, reorder, transport-orders, angebot-annahme. Altfelder `inventory.quantity`/`site_stock` werden dabei aus `bestand` mitgeführt (Cache).
3. Alte Schreibwege abschalten, wenn Abgleich über längere Zeit 0 zeigt.

## Abbildung der heutigen Reservierung
`site_stock.reserved_quantity` (für Projekt zugeteilt, noch nicht auf der Baustelle) → `bestand` am Baustellen-Lagerort, Zustand `reserviert`. `site_stock.quantity` → Baustellen-Lagerort / `frei`. `inventory.quantity` → Hauptlager / `frei`.

## Getestet (echtes Postgres 16, `supabase/tests/phase-108-lager-belege.test.sql`)
Migration läuft und ist wiederholbar; Anfangsbestand stimmt (Abgleich 0); Überbuchung wird abgelehnt; Mehrpositionsbeleg ist alles-oder-nichts; ZW/UL-Regeln; Storno inkl. Doppelstorno-Sperre; Belege unveränderlich; direktes Schreiben für `authenticated` verwehrt; 20 parallele Ausbuchungen auf 50 Stück → genau 10 erfolgreich, Bestand 0.

## Offen
- Entscheidung 3 (Umfang erste sichtbare Funktion): Empfehlung Umbuchen + Zustände + LKW.
- Eigentum eigen/gemietet zurückgestellt.
