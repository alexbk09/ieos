-- ============================================================
-- Migración 0011: Historial de cambios de estado de solicitudes
--
-- Crea la tabla solicitud_status_history que registra cada cambio
-- de estado con: quién lo hizo (changed_by), cuándo (created_at)
-- y la transición (previous_status → new_status).
-- Un trigger AFTER UPDATE registra automáticamente cada cambio.
-- ============================================================

-- 1) Tabla de historial de estados
create table if not exists public.solicitud_status_history (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  previous_status text,
  new_status text not null check (new_status in ('pending', 'confirmed', 'shipped', 'completed', 'cancelled')),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.solicitud_status_history enable row level security;

-- 2) Índice para consultas rápidas por solicitud
create index if not exists idx_solicitud_status_history_solicitud
  on public.solicitud_status_history (solicitud_id, created_at desc);

-- 3) Función que registra el cambio de estado
create or replace function public.log_solicitud_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo registra cuando el estado realmente cambia
  if old.status is distinct from new.status then
    insert into public.solicitud_status_history (solicitud_id, previous_status, new_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

-- 4) Trigger que se dispara al actualizar el estado de una solicitud
drop trigger if exists solicitudes_log_status_change on public.solicitudes;
create trigger solicitudes_log_status_change
after update of status on public.solicitudes
for each row execute procedure public.log_solicitud_status_change();

-- 5) Políticas RLS
-- Lectura: el dueño de la solicitud o un admin
create policy "Status history read own or admin"
  on public.solicitud_status_history for select
  using (
    exists (
      select 1 from public.solicitudes s
      where s.id = solicitud_id
        and (s.user_id = auth.uid() or public.is_admin())
    )
  );

-- Admin puede insertar/actualizar/eliminar (por si se necesita corregir)
create policy "Status history admin all"
  on public.solicitud_status_history for all
  using (public.is_admin())
  with check (public.is_admin());