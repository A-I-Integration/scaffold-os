# Kolonnen-System (für 15-20 Teams mit eigenem Bauleiter)

## Was gebaut wurde

Neues Organisationskonzept: **Kolonnen** (feste Teams mit einem
Bauleiter), zusätzlich zur bestehenden Wochenplanung.

**Neue Seite "Kolonnen"** (Sidebar → Mitarbeiter):
- Admin/Disposition: Kolonnen anlegen, Bauleiter zuweisen, Mitarbeiter
  verteilen – **jederzeit änderbar**, wie gefordert
- Bauleiter: sieht **nur seine eigene** Kolonne (rein lesend)

**Wochenplanung jetzt automatisch eingeschränkt:**
- Bauleiter sieht/plant in der Wochenplanung **nur seine eigene
  Kolonne** – bei 15-20 Kolonnen sonst völlig unübersichtlich und
  nicht seine Zuständigkeit
- Admin/Disposition sehen weiterhin **alle** Mitarbeiter/Kolonnen
- Zusätzliche Absicherung: Ein Bauleiter kann über die API auch nicht
  versehentlich/absichtlich einen fremden Mitarbeiter einplanen –
  wird serverseitig geprüft, nicht nur in der Oberfläche versteckt

## Zwei echte Fehler bei mir selbst gefunden, bevor sie ausgeliefert wurden

1. Ich hatte fälschlich angenommen, es gäbe ein Feld
   `profiles.employee_id` zur Verknüpfung Login↔Mitarbeiter – die
   echte Verknüpfung läuft über `employees.user_id` (bestätigtes
   Muster aus der bestehenden `/api/me`-Route). Korrigiert.
2. Ein verschachtelter Datenbank-Abruf (Kolonne + ihre Mitglieder in
   einer Anfrage) hätte einen exakten, nur geschätzten
   Datenbank-Constraint-Namen gebraucht – bei zwei Beziehungen
   zwischen denselben zwei Tabellen (Bauleiter UND Mitglieder) ist das
   riskant. Auf zwei getrennte, sichere Abfragen umgestellt.

Build lokal geprüft, keine Fehler (133 Seiten). Tests laufen weiter
sauber (20/20).

## Installation

```sql
-- Supabase SQL Editor:
-- (Inhalt von supabase/phase-55-kolonnen.sql)
```

- `app/api/kolonnen/route.ts` (neu)
- `app/kolonnen/page.tsx` (neu)
- `app/api/wochenplanung/route.ts` (ersetzen)
- `components/SidebarLayout.tsx` (ersetzen)

```bash
git pull
git add app/api/kolonnen app/kolonnen app/api/wochenplanung/route.ts components/SidebarLayout.tsx supabase/phase-55-kolonnen.sql
git commit -m "Kolonnen-System: Bauleiter sieht nur eigenes Team, Admin/Disposition alle"
git push
```
