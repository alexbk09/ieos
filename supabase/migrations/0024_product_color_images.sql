-- ============================================================
-- Migración 0024: Datos físicos del producto (peso, tamaño) e
-- imágenes por color.
-- - `products.peso`: peso del producto (texto libre, ej: "0.8 kg")
-- - `products.tamaño`: tamaño / dimensiones (texto libre, ej: "50 x 50 cm")
-- - `product_images.color_name`: vincula una imagen a un color exacto.
-- ============================================================

-- 1) Peso y tamaño del producto (opcionales)
alter table public.products
  add column if not exists peso text,
  add column if not exists tamaño text;

-- 2) Columna de color en imágenes de producto
alter table public.product_images
  add column if not exists color_name text;

-- 3) Índice para búsqueda rápida de imágenes por color
create index if not exists idx_product_images_color_name
  on public.product_images(color_name);

-- 4) Documentación de las columnas
comment on column public.products.peso is
  'Peso del producto como texto libre (ej: 0.8 kg). Opcional.';
comment on column public.products.tamaño is
  'Tamaño o dimensiones del producto como texto libre (ej: 50 x 50 cm). Opcional.';
comment on column public.product_images.color_name is
  'Nombre del color al que pertenece la imagen (null = imagen general del producto).';
