-- ============================================================
-- Migración 0043: URLs de afiliado por marketplace (AliExpress/Amazon)
--
-- El sistema soporta un catálogo HÍBRIDO de afiliados:
--   - url_afiliado_ali     → enlace de afiliado de AliExpress
--   - url_afiliado_amazon  → enlace de afiliado de Amazon
--   - url_afiliado_store   → enlace legado genérico de la store
--                           (se conserva por compatibilidad; se define
--                           como la tienda propia/afiliado tradicional).
--
-- Todos los campos son opcionales: un producto puede tener solo uno,
-- varios o ninguno (flujo de venta local por solicitud/WhatsApp).
-- ============================================================

-- ============================================================
-- 1) Columnas nuevas de afiliado en products
-- ============================================================
alter table public.products
  add column if not exists url_afiliado_ali text,
  add column if not exists url_afiliado_amazon text;

-- ============================================================
-- 2) Índices parciales para filtrar por marketplace
-- ============================================================
create index if not exists idx_products_url_afiliado_ali
  on public.products(url_afiliado_ali)
  where url_afiliado_ali is not null;

create index if not exists idx_products_url_afiliado_amazon
  on public.products(url_afiliado_amazon)
  where url_afiliado_amazon is not null;

-- ============================================================
-- 3) Documentación de las columnas
-- ============================================================
comment on column public.products.url_afiliado_ali is
  'URL de afiliado de AliExpress (con tag de seguimiento) del producto. NULL si el producto se vende local o no aplica.';
comment on column public.products.url_afiliado_amazon is
  'URL de afiliado de Amazon (con tag de seguimiento) del producto. NULL si el producto se vende local o no aplica.';