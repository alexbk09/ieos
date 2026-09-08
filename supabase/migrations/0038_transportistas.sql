-- ============================================================
-- Migración 0038: Módulo de Transportistas (independiente)
--
-- 1) Crea el módulo 'transportistas' con permisos propios.
-- 2) Re-asigna las políticas RLS de la tabla public.transportistas
--    para que usen las funciones has_permission('transportistas',...)
--    en lugar de depender del módulo 'despachos'.
-- La tabla transportistas ya existe (creada en la migración 0030).
-- ============================================================

insert into public.modules (name, slug, description)
values (
  'Transportistas',
  'transportistas',
  'Gestión de transportistas internos y externos con vehículo, placa y estado.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'transportistas'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

-- Re-crear políticas de transportistas con el módulo propio
drop policy if exists "Transportistas read authorized" on public.transportistas;
create policy "Transportistas read authorized" on public.transportistas for select
using (
  public.has_permission('transportistas', 'read')
  or public.has_permission('despachos', 'read')
  or public.is_admin()
);

drop policy if exists "Transportistas write authorized" on public.transportistas;
create policy "Transportistas write authorized" on public.transportistas for all
using (
  public.has_permission('transportistas', 'write')
  or public.has_permission('despachos', 'write')
  or public.is_admin()
)
with check (
  public.has_permission('transportistas', 'write')
  or public.has_permission('despachos', 'write')
  or public.is_admin()
);