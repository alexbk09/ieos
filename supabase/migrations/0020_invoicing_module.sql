-- Migración 0020: Módulo de Facturación (independiente)
-- 1) Agrega el módulo 'facturacion' a public.modules
-- 2) Asigna permisos completos al rol admin
-- 3) Corrige descripción del módulo configuración

insert into public.modules (name, slug, description)
values ('Facturación', 'facturacion', 'Emisión, gestión, impresión y envío de facturas electrónicas (SENIAT)')
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'facturacion'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

update public.modules
set name = 'Configuración',
    description = 'Ajustes generales del sitio (marca, logo, textos, redes)'
where slug = 'configuracion';