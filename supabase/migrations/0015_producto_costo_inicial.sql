-- ============================================================
-- Migración 0015: Campo costo_inicial en productos
--
-- Agrega la columna costo_inicial a la tabla products.
-- Valor por defecto 0 para no romper registros existentes.
-- ============================================================

alter table public.products
  add column if not exists costo_inicial numeric(10,2) not null default 0;