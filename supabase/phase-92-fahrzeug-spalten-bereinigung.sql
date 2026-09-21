-- Phase 92: Bereinigung doppelter Fahrzeug-Spalten
--
-- Hintergrund: phase-91-fahrzeug-fuehrerschein.sql hat versehentlich neue
-- Spalten vehicles.typ und vehicles.nutzlast_kg angelegt, ohne zu prüfen,
-- dass es dafür bereits gleichbedeutende Spalten aus dem ursprünglichen
-- Schema gab: vehicles.type (Text, Default 'transporter') und
-- vehicles.capacity_kg (Integer, Default 1000) - siehe kunden-schema.sql.
-- Beide Spaltenpaare beschreiben dasselbe: Fahrzeugtyp und Nutzlast.
--
-- Diese Migration führt das zusammen:
--   1. Eventuell über die Datenpflege-Seite bereits eingegebene Werte in
--      typ/nutzlast_kg werden nach type/capacity_kg übernommen (nur wo
--      dort ein Wert steht, um vorhandene type/capacity_kg-Werte aus dem
--      ursprünglichen Schema nicht zu überschreiben, falls doch schon mal
--      etwas gesetzt wurde).
--   2. Die redundanten Spalten typ/nutzlast_kg werden entfernt.
--
-- zulaessiges_gesamtgewicht_kg (zulässiges Gesamtgewicht, bestimmt die
-- nötige Führerschein-Klasse) bleibt unverändert bestehen - dafür gibt es
-- keine vorherige Spalte, das ist fachlich etwas anderes als die Nutzlast
-- (Zuladung).

-- 1. Vorhandene Werte übernehmen
UPDATE vehicles SET type = typ WHERE typ IS NOT NULL AND typ <> '';
UPDATE vehicles SET capacity_kg = ROUND(nutzlast_kg)::integer WHERE nutzlast_kg IS NOT NULL;

-- 2. Redundante Spalten entfernen
ALTER TABLE vehicles DROP COLUMN IF EXISTS typ;
ALTER TABLE vehicles DROP COLUMN IF EXISTS nutzlast_kg;
