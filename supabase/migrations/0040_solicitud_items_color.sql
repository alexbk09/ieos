-- ============================================================
-- Migración 0040: Color seleccionado en ítems de solicitud
--
-- Guarda el color exacto que el cliente eligió en el catálogo
-- para cada ítem de la solicitud. Se guarda como snapshot
-- (texto) al crear la solicitud, igual que unit_label.
-- ============================================================

alter table public.solicitud_items
  add column if not exists color_name text;

comment on column public.solicitud_items.color_name is
  'Color exacto elegido por el cliente en el catálogo (snapshot al crear la solicitud).';

-- ============================================================
-- quote_items: también guardamos el color para las cotizaciones
-- que se convierten en solicitudes (mismo flujo de carrito).
-- ============================================================
alter table public.quote_items
  add column if not exists color_name text;

comment on column public.quote_items.color_name is
  'Color exacto del ítem cotizado (snapshot).';