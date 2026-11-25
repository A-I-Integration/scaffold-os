-- Phase 139: Land der Baustelle (für die Auswertung der Zeiterfassung nach Land)
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen (idempotent, mehrfach ausführbar)
-- Leer = nicht gesetzt; die Auswertung behandelt "nicht gesetzt" als Deutschland.
alter table projects add column if not exists land text;
