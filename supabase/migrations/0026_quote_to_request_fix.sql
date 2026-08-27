-- ============================================================
-- Migración 0026: Fix flujo conversión cotización → solicitud
--
-- Corrige:
--   1) `solicitudes.user_id` NOT NULL → opcional. Una cotización
--      puede pertenecer a una venta directa sin cliente registrado
--      (quotes.user_id es NULL) y al convertir a solicitud el INSERT
--      fallaba por la restricción NOT NULL.
--   2) Columnas de cliente, notas, vigencia y total en Bs. en
--      `solicitudes` para que la conversión arrastre TODA la
--      información de la cotización (customer_name/email/phone/
--      address, total_ves, validity_days, valid_until, notes,
--      cash_divisa_discount_percent, shows_cash_divisa_note).
--   3) `solicitud_items.product_id` NOT NULL → opcional. Coincide con
--      quote_items.product_id (nullable, on delete set null) y evita
--      fallos al convertir cotizaciones con productos eliminados.
--   4) Política RLS "Solicitud items insert admin": permitir que un
--      admin inserte ítems en solicitudes de cualquier cliente
--      (flujo de conversión). Antes solo "Solicitud items insert own"
--      permitía insertar cuando solicitante = auth.uid().
--   5) Política RLS "Solicitudes delete admin": permitir limpiar la
--      solicitud huérfana cuando falla el insert de sus ítems.
-- ============================================================

-- ============================================================
-- 1) user_id opcional (cotización sin cliente registrado)
-- ============================================================
alter table public.solicitudes
  alter column user_id drop not null;

-- ============================================================
-- 2) Datos del cliente + notas + totales (snapshot de la cotización)
-- ============================================================
alter table public.solicitudes
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists customer_address text,
  add column if not exists total_ves numeric(12,2) not null default 0,
  add column if not exists validity_days integer not null default 15,
  add column if not exists valid_until date,
  add column if not exists notes text,
  add column if not exists cash_divisa_discount_percent numeric(5,2) not null default 20.00,
  add column if not exists shows_cash_divisa_note boolean not null default true;

-- ============================================================
-- 3) product_id opcional (ítem cuyo producto fue eliminado)
-- ============================================================
alter table public.solicitud_items
  alter column product_id drop not null;

-- ============================================================
-- 4) Política RLS: admin puede insertar ítems en solicitudes de cualquier cliente
-- ============================================================
drop policy if exists "Solicitud items insert admin" on public.solicitud_items;
create policy "Solicitud items insert admin"
  on public.solicitud_items for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ============================================================
-- 5) Política RLS: admin puede eliminar solicitudes (limpieza de huérfanas)
-- ============================================================
drop policy if exists "Solicitudes delete admin" on public.solicitudes;
create policy "Solicitudes delete admin"
  on public.solicitudes for delete
  using (public.is_admin());