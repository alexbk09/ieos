-- ============================================================
-- Migración 0017: Política RLS para inserción de solicitudes por admin
--
-- Corrige: cuando una cotización se convierte a solicitud para un
-- cliente distinto al admin logueado, la política "Solicitudes insert own"
-- (auth.uid() = user_id) bloquea la inserción.
--
-- Agrega una política que permite al admin insertar solicitudes para
-- cualquier user_id (flujo de conversión de cotizaciones).
-- También verifica los permisos del módulo de cotizaciones.
-- ============================================================

-- ============================================================
-- 1) Política: admin puede insertar solicitudes para cualquier cliente
-- ============================================================
drop policy if exists "Solicitudes insert admin" on public.solicitudes;
create policy "Solicitudes insert admin"
  on public.solicitudes for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ============================================================
-- 2) Verificar permisos admin en módulo cotizaciones
-- ============================================================
insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'cotizaciones'
on conflict (role_id, module_id)
do update set can_read = true, can_write = true, can_delete = true;