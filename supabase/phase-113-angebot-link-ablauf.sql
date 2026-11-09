-- Phase 113: Angebots-Link – Ablaufdatum und Widerruf
-- Bereits versendete Links behalten kein Ablaufdatum (gelten weiter, bis sie widerrufen werden);
-- beim nächsten Versand des Angebots bekommen sie 60 Tage. Mehrfach ausführbar.
alter table public.project_access_tokens add column if not exists expires_at timestamptz;
alter table public.project_access_tokens add column if not exists revoked_at timestamptz;
