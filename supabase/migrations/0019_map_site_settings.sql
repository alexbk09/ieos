-- ============================================================
-- Migración 0019: Configuración del mapa de la tienda (inicio)
-- Agrega latitud/longitud/zoom a site_settings para el mapa
-- que se muestra en la sección de contacto del inicio.
-- Idempotente: usa ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
-- ============================================================

alter table public.site_settings
  add column if not exists map_lat double precision not null default 10.4806,
  add column if not exists map_lng double precision not null default -66.9036,
  add column if not exists map_zoom integer not null default 13;

-- Índice de apoyo (opcional, la tabla es singleton pero por consistencia).
create index if not exists site_settings_id_idx
  on public.site_settings (id);

-- Actualiza la fila existente con las coordenadas por defecto si aún no tiene valores.
update public.site_settings
set
  map_lat = coalesce(map_lat, 10.4806),
  map_lng = coalesce(map_lng, -66.9036),
  map_zoom = coalesce(map_zoom, 13)
where id = 1;