-- Nur für die Test-Datenbank des End-to-End-Tests! Bildet die Supabase-Umgebung nach (auth, storage, Basistabellen projects/customers, die in den Migrationen nur vorausgesetzt werden).
drop schema if exists public cascade; drop schema if exists auth cascade; drop schema if exists storage cascade;
create schema public; create schema auth; create schema storage;
create schema extensions;
create function public.gen_random_bytes(n int) returns bytea language sql as $$ select decode(repeat(md5(random()::text), 2), 'hex') $$;
create function extensions.gen_random_bytes(n int) returns bytea language sql as $$ select decode(repeat(md5(random()::text), 2), 'hex') $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n,'/') $$;
-- Basistabellen, die in den Migrationen nur vorausgesetzt werden (im Supabase-Projekt vorab angelegt)
create table public.projects (id uuid primary key default gen_random_uuid(), name text, adresse text, status text default 'active', data jsonb default '{}'::jsonb, customer_id uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table public.customers (id uuid primary key default gen_random_uuid(), name text, email text, created_at timestamptz default now());
