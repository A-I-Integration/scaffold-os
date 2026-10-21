-- ============================================================
-- SCAFFOLD OS – Phase 104: Abrechnung nach m² (Datenpflege → CAD)
--
-- Im Supabase SQL Editor ausführen (einmal). Kann gefahrlos wiederholt werden:
-- legt nur eine NEUE Tabelle an, verändert nichts Bestehendes.
-- RLS an, keine Policies → Zugriff nur über die API (Service-Role-Key).
--
-- Eine Zeile = ein Preis je m² Gerüstfläche:
--   art = 'grundpreis' → Preis je Gerüsttyp (z. B. „Fassadengerüst“)
--   art = 'aufpreis'   → Zuschlag je m² (z. B. „Höhe über 20 m“, „Netze/Planen“)
-- Im CAD (nur Admin): Gerüstfläche × (Grundpreis + gewählte Aufpreise).
-- ============================================================

create table if not exists public.abrechnung_m2 (
  id          uuid primary key default gen_random_uuid(),
  art         text not null check (art in ('grundpreis', 'aufpreis')),
  name        text not null,
  preis_m2    numeric(10, 2) not null check (preis_m2 >= 0 and preis_m2 <= 10000),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.abrechnung_m2 enable row level security;

create index if not exists abrechnung_m2_art_idx on public.abrechnung_m2 (art, name);
