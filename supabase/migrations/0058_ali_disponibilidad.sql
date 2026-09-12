-- ============================================================
-- Migración 0058: Disponibilidad de productos afiliados AliExpress
--
-- POR QUÉ:
--   Hasta ahora, cuando un producto desaparecía de AliExpress (o se quedaba sin
--   precio comprable), `services/aliEnrich.ts` solo escribía un log: la ficha
--   seguía publicada con precio viejo y el JSON-LD seguía emitiendo InStock,
--   lo que es un "content mismatch" que Google penaliza y, además, mandaba
--   clics a un enlace muerto.
--
--   Estas columnas permiten al botón "Verificar disponibilidad"
--   (services/aliAvailability.ts) DEGRADAR la ficha de forma SEO-safe:
--     - NUNCA se oculta el producto (is_available sigue true) → la URL
--       indexada se conserva y no se generan soft-404.
--     - NUNCA se inventan datos: solo se registra el resultado real de la API.
--
-- Columnas nuevas en public.products:
--   ali_status          → 'ok' | 'unavailable' (espejo de lib/ali-availability.mjs).
--   ali_missing_checks  → ausencias CONSECUTIVAS del detalle (protege de falsos
--                         positivos por rate limit/error de lote de la API).
--   ali_last_checked_at → última verificación (base de la rotación reanudable).
--   ali_unavailable_since → desde cuándo está caído (auditoría y política de
--                         gracia; permite decidir después ocultar/redirigir).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ============================================================

alter table public.products
  add column if not exists ali_status text not null default 'ok',
  add column if not exists ali_missing_checks smallint not null default 0,
  add column if not exists ali_last_checked_at timestamptz,
  add column if not exists ali_unavailable_since timestamptz;

-- Guard defensivo: el estado solo admite los valores del evaluador puro.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_ali_status_valid'
  ) then
    alter table public.products
      add constraint products_ali_status_valid
      check (ali_status in ('ok', 'unavailable'));
  end if;
end $$;

-- Índice parcial: el panel y los listados solo consultan los caídos/afectados
-- (evita indexar el 100% del catálogo, que es 'ok' por defecto).
create index if not exists idx_products_ali_status
  on public.products(ali_status)
  where ali_status <> 'ok';

-- Rotación de la verificación: "los menos revisados primero".
create index if not exists idx_products_ali_last_checked_at
  on public.products(ali_last_checked_at nulls first);

comment on column public.products.ali_status is
  'Disponibilidad en AliExpress: ok | unavailable. Degrada la ficha (OutOfStock) sin ocultarla.';
comment on column public.products.ali_missing_checks is
  'Ausencias consecutivas del detalle en la API de AliExpress. Al llegar al umbral se degrada la ficha.';
comment on column public.products.ali_last_checked_at is
  'Última verificación de disponibilidad contra la API oficial (rotación reanudable del botón).';
comment on column public.products.ali_unavailable_since is
  'Fecha en que se detectó el producto como no disponible en AliExpress (NULL si está ok).';
