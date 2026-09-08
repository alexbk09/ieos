-- ============================================================
-- Migración 0036: Facturación XML SENIAT
-- 1) Columnas XML en invoices.
-- 2) Tabla envio_facturas_seniat (historial de envíos).
-- 3) RPC generar_xml_factura (genera y guarda el XML).
-- 4) Registro del módulo 'facturacion_xml' + permisos + RLS.
-- ============================================================

alter table public.invoices
  add column if not exists xml_generado text,
  add column if not exists xml_version text not null default '1.0',
  add column if not exists uuid_xml uuid default gen_random_uuid();

create table if not exists public.envio_facturas_seniat (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  estado text not null default 'generado' check (estado in ('generado', 'firmado', 'enviado', 'rechazado', 'anulado')),
  payload_xml text,
  respuesta_seniat jsonb not null default '{}',
  intentos integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.envio_facturas_seniat enable row level security;

create index if not exists idx_envio_facturas_invoice on public.envio_facturas_seniat (invoice_id);

-- RPC: generar XML de una factura emitida
create or replace function public.generar_xml_factura(
  p_invoice_id uuid,
  p_xml text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permitido boolean;
  v_invoice public.invoices%rowtype;
  v_envio_id uuid;
begin
  select public.has_permission('facturacion_xml', 'write')
  into v_permitido;
  if not coalesce(v_permitido, false) then
    raise exception 'No tienes permisos para generar XML de facturas.';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id;
  if v_invoice.id is null then
    raise exception 'Factura no encontrada.';
  end if;

  if p_xml is null or length(p_xml) < 10 then
    raise exception 'El XML generado es inválido.';
  end if;

  update public.invoices
  set xml_generado = p_xml,
      xml_version = '1.0'
  where id = p_invoice_id;

  insert into public.envio_facturas_seniat (invoice_id, estado, payload_xml)
  values (p_invoice_id, 'generado', p_xml)
  returning id into v_envio_id;

  return jsonb_build_object('ok', true, 'envio_id', v_envio_id);
end;
$$;

grant execute on function public.generar_xml_factura(uuid, text) to authenticated, service_role;

insert into public.modules (name, slug, description)
values (
  'Facturación XML SENIAT',
  'facturacion_xml',
  'Emisión de facturas electrónicas mediante formatos XML directos para cumplir con las providencias de la Gaceta Oficial del SENIAT.'
)
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'facturacion_xml'
on conflict (role_id, module_id)
do update set
  can_read = true,
  can_write = true,
  can_delete = true;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'envio_facturas_seniat' and policyname = 'Envio SENIAT read authorized') then
    create policy "Envio SENIAT read authorized" on public.envio_facturas_seniat for select
    using (public.has_permission('facturacion_xml', 'read') or public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'envio_facturas_seniat' and policyname = 'Envio SENIAT write authorized') then
    create policy "Envio SENIAT write authorized" on public.envio_facturas_seniat for all
    using (public.has_permission('facturacion_xml', 'write') or public.is_admin())
    with check (public.has_permission('facturacion_xml', 'write') or public.is_admin());
  end if;
end $$;