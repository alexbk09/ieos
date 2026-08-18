-- ============================================================
-- Migración 0005: Sincronizar columnas faltantes
--
-- Soluciona el caso donde las tablas ya existían en la base
-- antes de ejecutar las migraciones, y CREATE TABLE IF NOT EXISTS
-- no agregó las columnas nuevas.
-- ============================================================

-- ============================================================
-- profiles: agregar columnas faltantes si no existen
-- ============================================================
alter table public.profiles
  add column if not exists phone text,
  add column if not exists role_id uuid references public.roles(id),
  add column if not exists avatar_url text,
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================
-- products: agregar columnas faltantes si no existen
-- ============================================================
alter table public.products
  add column if not exists colors text[] not null default '{}',
  add column if not exists specifications jsonb not null default '{}',
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists featured boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================
-- solicitudes: agregar columnas faltantes si no existen
-- ============================================================
alter table public.solicitudes
  add column if not exists exchange_rate numeric(10,2) not null default 36.5,
  add column if not exists updated_at timestamptz not null default now();