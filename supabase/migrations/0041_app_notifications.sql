-- ============================================================
-- Migración 0041: Centro de notificaciones in-app
--
-- 1) Tabla app_notifications: bandeja por usuario autenticado.
--      - Destinatario: user_id (admin, clientes o ambos según el rol)
--      - Tipo semántico para renderizado con icono/color
--      - href opcional para navegación (deep link al módulo relacionado)
--      - read_at para conteo de no leídas (NULL = no leída)
-- 2) Funciones helper (SECURITY DEFINER):
--      public.notify_user(user_id, title, type, body, href) → notifica a un usuario
--      public.notify_admins(title, type, body, href)          → notifica a todos los admins
--    IMPORTANTE: los parámetros sin DEFAULT van PRIMERO; PostgreSQL exige
--    que, tras un parámetro con valor por defecto, todos los siguientes
--    también lo tengan.
-- 3) RLS: SELECT/UPDATE/DELETE limitados al dueño de cada fila.
-- 4) Realtime habilitado para el broadcast (campana).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION
-- ============================================================

-- ============================================================
-- 1) Tabla de notificaciones
-- ============================================================
create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null default 'system' check (type in (
    'system', 'solicitud', 'cotizacion', 'factura', 'despacho',
    'cuentas_cobrar', 'pago', 'producto', 'usuario', 'tasa', 'mensaje'
  )),
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_user_unread_idx
  on public.app_notifications (user_id) where read_at is null;

create index if not exists app_notifications_user_created_idx
  on public.app_notifications (user_id, created_at desc);

comment on table public.app_notifications is
  'Bandeja de notificaciones por usuario para el centro de alertas in-app.';

-- ============================================================
-- 2) Función helper: notifica a UN usuario
--    Firmas sin default obligatorias primero para cumplir la regla SQL.
-- ============================================================
create or replace function public.notify_user(
  p_user_id uuid,
  p_title text,
  p_type text default 'system',
  p_body text default null,
  p_href text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.app_notifications (user_id, type, title, body, href)
  values (p_user_id, coalesce(p_type, 'system'), p_title, p_body, p_href)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.notify_user(uuid, text, text, text, text) to authenticated, service_role;

-- ============================================================
-- 2b) Función para notificar a TODOS los administradores.
--      Útil para el feed del panel (nueva solicitud, factura emitida,
--      pago recibido...) sin depender de conocer un admin concreto.
-- ============================================================
create or replace function public.notify_admins(
  p_title text,
  p_type text default 'system',
  p_body text default null,
  p_href text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := '{}';
  v_row uuid;
begin
  -- Perfiles con role 'admin' (legacy/check) o con rol asociado a nombre 'admin'.
  for v_row in
    select p.id
    from public.profiles p
    where p.role = 'admin'
       or p.role_id in (select r.id from public.roles r where r.name = 'admin')
  loop
    insert into public.app_notifications (user_id, type, title, body, href)
    values (v_row, coalesce(p_type, 'system'), p_title, p_body, p_href);
    v_ids := array_append(v_ids, v_row);
  end loop;

  return v_ids;
end;
$$;

grant execute on function public.notify_admins(text, text, text, text) to authenticated, service_role;

-- ============================================================
-- 3) Row Level Security
-- ============================================================
alter table public.app_notifications enable row level security;

drop policy if exists "app_notifications_select_own" on public.app_notifications;
create policy "app_notifications_select_own"
  on public.app_notifications for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "app_notifications_update_own" on public.app_notifications;
create policy "app_notifications_update_own"
  on public.app_notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "app_notifications_delete_own" on public.app_notifications;
create policy "app_notifications_delete_own"
  on public.app_notifications for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================
-- 4) Realtime para nuevas notificaciones propias
-- ============================================================
alter publication supabase_realtime add table public.app_notifications;