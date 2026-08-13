-- ============================================================
-- SCAFFOLD OS – Phase 12: Stripe-Abo (249 €/Monat)
-- NUR AUF DER MASTER-INSTANZ ausführen!
--
-- Verknüpft Stripe-Abos mit der tenants-Registry:
-- Kauft ein Kunde auf scaffoldos.de, schreibt der Webhook hier
-- den Abo-Status. Kündigt der Kunde oder schlägt die Zahlung
-- fehl, steht das hier – und am tenant.status.
-- ============================================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),

  -- Verknüpfung zur Kunden-Registry (wird nach Provisionierung gesetzt)
  tenant_id uuid references public.tenants(id) on delete set null,

  -- Wer hat gekauft?
  customer_email text not null,
  company_name text,

  -- Stripe-Referenzen
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,

  -- Abo-Status (Stripe-Status: trialing, active, past_due, canceled, ...)
  status text not null default 'incomplete',
  trial_end timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Schnelle Suche nach E-Mail und Stripe-IDs
create index if not exists subscriptions_email_idx on public.subscriptions(customer_email);
create index if not exists subscriptions_tenant_idx on public.subscriptions(tenant_id);

-- updated_at automatisch pflegen
create or replace function public.touch_subscriptions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.touch_subscriptions_updated_at();

-- Zugriff nur über den Service-Key (API-Routen). Keine RLS-Freigabe
-- für normale Nutzer – diese Tabelle ist rein intern.
alter table public.subscriptions enable row level security;
