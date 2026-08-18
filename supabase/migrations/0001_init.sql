-- ============================================================
-- Migración 0001: Esquema base (tablas + RLS habilitado)
-- Idempotente: CREATE TABLE IF NOT EXISTS + ALTER TABLE ... ENABLE RLS
-- ============================================================

-- 1) Extensión base
create extension if not exists pgcrypto;

-- ============================================================
-- Tabla de roles
-- ============================================================
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.roles enable row level security;

-- ============================================================
-- Tabla de módulos
-- ============================================================
create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.modules enable row level security;

-- ============================================================
-- Tabla de permisos por rol y módulo
-- ============================================================
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  can_read boolean not null default false,
  can_write boolean not null default false,
  can_delete boolean not null default false,
  created_at timestamptz not null default now(),
  unique (role_id, module_id)
);

alter table public.role_permissions enable row level security;

-- ============================================================
-- Tabla de perfiles de usuario
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'client' check (role in ('admin', 'client', 'user')),
  role_id uuid references public.roles(id),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ============================================================
-- Tabla de categorías
-- ============================================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

-- ============================================================
-- Tabla de productos
-- ============================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price_usd numeric(10,2) not null default 0,
  stock integer not null default 0,
  image_url text,
  colors text[] not null default '{}',
  specifications jsonb not null default '{}',
  category_id uuid references public.categories(id) on delete set null,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

-- ============================================================
-- Tabla de solicitudes
-- ============================================================
create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total_usd numeric(12,2) not null default 0,
  exchange_rate numeric(10,2) not null default 36.5,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'shipped', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.solicitudes enable row level security;

-- ============================================================
-- Tabla de items de la solicitud
-- ============================================================
create table if not exists public.solicitud_items (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_usd numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.solicitud_items enable row level security;