-- Phase 142: Land bei Kunde und Baustelle (Anschrift auf Angebot/Rechnung, Steuervorschlag Luxemburg)
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar).
-- Leer = Deutschland.
alter table customers add column if not exists land text;
alter table projects add column if not exists land text;
