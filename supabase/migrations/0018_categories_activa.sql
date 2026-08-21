-- ============================================================
-- Migración 0018: Categorías activas/inactivas
--
-- Agrega la columna "activa" a la tabla categories para que el
-- administrador pueda activar o desactivar categorías igual que
-- en marcas y proveedores. Las categorías inactivas no aparecen
-- en los filtros del catálogo público.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS
-- ============================================================

alter table public.categories
  add column if not exists activa boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- Índice para filtrar categorías activas rápido
create index if not exists idx_categories_activa on public.categories(activa);