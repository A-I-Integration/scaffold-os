-- Phase 95: Optionales DATEV-Einzeldebitorenkonto pro Kunde
--
-- Hintergrund (offener Punkt aus dem DATEV-Audit, "Sammeldebitor"):
-- Der DATEV-Buchungsstapel-Export (app/rechnungen/page.tsx,
-- buildDatevEXTF) bucht bisher JEDEN Kunden auf dasselbe feste
-- Debitoren-Sammelkonto (DATEV_DEBITOR_START, aktuell 10000) -
-- DATEV kann Rechnungen so nicht einem einzelnen Kunden zuordnen,
-- offene Posten je Kunde sind im Buchungsstapel nicht auswertbar.
--
-- Fix: neues, rein optionales Feld customers.datev_konto. Ist es für
-- einen Kunden gesetzt (vom Steuerberater vergebene Kontonummer,
-- z.B. Debitoren-Kontenkreis 10000-69999 in SKR03), bucht der Export
-- auf dieses individuelle Konto. Ist es NICHT gesetzt, bleibt exakt
-- das bisherige Verhalten (Sammelkonto) erhalten - keine bestehende
-- Buchung ändert sich, bis jemand bewusst eine Kontonummer einträgt.
-- Die tatsächliche Nummernvergabe/den Kontenkreis legt bewusst NICHT
-- diese Migration fest, sondern der Steuerberater über das neue Feld
-- im Kundenstamm (app/kunden/[id]/page.tsx, Reiter "Kunde").
--
-- REIN ADDITIV: keine bestehende Spalte/Tabelle wird verändert.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS datev_konto text;

COMMENT ON COLUMN public.customers.datev_konto IS
  'Optionale DATEV-Einzeldebitorenkontonummer (vom Steuerberater vergeben). Leer = Buchung läuft weiter über das Sammeldebitorenkonto im DATEV-Export.';
