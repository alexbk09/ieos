-- ============================================================
-- Migración 0012: Facturación venezolana (SENIAT)
--
-- Crea:
--   1. invoice_settings  → configuración del emisor (singleton id=1):
--      razón social, RIF, dirección, régimen, IVA, correlativos,
--      número de control y resolución/autorización.
--   2. invoices          → facturas emitidas vinculadas a solicitudes.
--   3. RPC consume_next_invoice_number  → toma atómica del siguiente
--      correlativo (bloquea la fila para evitar duplicados).
--   4. RPC consume_next_control_number  → siguiente número de control.
--
-- Cumple la Providencia Administrativa de facturación del SENIAT:
--   - Número de factura: {prefijo}-{serie/punto de emisión}-{correlativo 8 dígitos}
--   - Número de control con serie autorizada
--   - Datos del emisor (razón social, RIF, domicilio fiscal)
--   - Datos del receptor (nombre, RIF/CI, dirección)
--   - Desglose de IVA (base imponible, alícuota, monto)
--   - Tasa de cambio BCV cuando la factura se emite en divisas
--   - Leyenda del contribuyente
-- ============================================================

-- ============================================================
-- 1) Tabla de configuración de facturación (singleton id=1)
-- ============================================================
create table if not exists public.invoice_settings (
  id integer primary key default 1 check (id = 1),

  -- Datos del emisor (contribuyente)
  issuer_name text not null default 'ilumaX C.A.',
  issuer_rif text not null default 'J-00000000-0',
  issuer_address text not null default 'Caracas, Venezuela',
  issuer_city text not null default 'Caracas',
  issuer_state text not null default 'Distrito Capital',
  issuer_phone text not null default '584122649707',
  issuer_email text not null default 'hola@ilumax.ve',

  -- Régimen fiscal
  regimen text not null default 'contribuyente_formal'
    check (regimen in ('contribuyente_formal', 'no_contribuyente')),

  -- IVA (alícuota general Venezuela: 16% desde marzo 2024)
  iva_rate numeric(5,2) not null default 16.00 check (iva_rate >= 0 and iva_rate <= 100),
  -- true: el precio unitario del catálogo ya incluye IVA (se desglosa)
  -- false: el IVA se suma al precio (precio neto)
  prices_include_iva boolean not null default true,

  -- Correlativo de facturas: FAC-0001-00000001
  invoice_prefix text not null default 'FAC',
  invoice_series text not null default '0001',
  invoice_current_number integer not null default 0 check (invoice_current_number >= 0),
  invoice_digits integer not null default 8 check (invoice_digits between 4 and 12),

  -- Número de control (asignado por la imprenta autorizada)
  control_series text not null default 'B',
  control_current_number integer not null default 0 check (control_current_number >= 0),

  -- Resolución / autorización (opcional)
  resolution_number text,
  resolution_date date,

  -- Leyenda / pie de factura
  footer_note text not null default 'Gracias por su compra.',

  -- Mostrar la tasa de cambio BCV en la factura (cuando es en divisas)
  show_rate_on_invoice boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoice_settings enable row level security;

-- ============================================================
-- 2) Tabla de facturas emitidas
-- ============================================================
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid references public.solicitudes(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,

  -- Número de factura correlativo único: FAC-0001-00000001
  invoice_number text not null unique,
  -- Número de control único (opcional)
  control_number text unique,

  status text not null default 'issued' check (status in ('issued', 'cancelled')),
  issued_at timestamptz not null default now(),
  due_date date,

  -- Snapshot del emisor
  issuer_rif text not null,
  issuer_name text not null,
  issuer_address text,

  -- Receptor
  customer_name text,
  customer_document_type text check (customer_document_type in ('rif', 'ci', 'pasaporte')),
  customer_document text,
  customer_address text,
  customer_email text,
  customer_phone text,

  -- Totales (desglose SENIAT)
  subtotal numeric(12,2) not null default 0,   -- base imponible
  iva_amount numeric(12,2) not null default 0,
  exento_amount numeric(12,2) not null default 0,
  iva_rate numeric(5,2) not null default 16.00,
  total numeric(12,2) not null default 0,

  -- Moneda y tasa (facturas en divisas usan tasa BCV)
  currency text not null default 'USD' check (currency in ('USD', 'VES')),
  exchange_rate numeric(12,4) not null default 0,

  -- Snapshot de los ítems de la solicitud
  items jsonb not null default '[]'::jsonb,

  notes text,
  cancelled_at timestamptz,
  cancelled_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoices enable row level security;

-- Índices para consultas rápidas
create index if not exists idx_invoices_solicitud on public.invoices (solicitud_id);
create index if not exists idx_invoices_user on public.invoices (user_id);
create index if not exists idx_invoices_created on public.invoices (created_at desc);

-- ============================================================
-- 3) Fila inicial de configuración de facturación
-- ============================================================
insert into public.invoice_settings (
  id, issuer_name, issuer_rif, issuer_address, issuer_city, issuer_state,
  issuer_phone, issuer_email, regimen, iva_rate, prices_include_iva
)
values (
  1, 'ilumaX C.A.', 'J-00000000-0', 'Caracas, Venezuela', 'Caracas',
  'Distrito Capital', '584122649707', 'hola@ilumax.ve',
  'contribuyente_formal', 16.00, true
)
on conflict (id) do nothing;

-- ============================================================
-- 4) Triggers de updated_at
-- ============================================================
drop trigger if exists invoice_settings_set_updated_at on public.invoice_settings;
create trigger invoice_settings_set_updated_at
before update on public.invoice_settings
for each row execute procedure public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row execute procedure public.set_updated_at();

-- ============================================================
-- 5) RPC: consumir el siguiente número de factura (atómico)
-- ============================================================
create or replace function public.consume_next_invoice_number(
  p_prefix text,
  p_series text,
  p_digits integer default 8
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_number text;
begin
  -- Solo administradores pueden emitir facturas (asignar correlativo)
  if not public.is_admin() then
    raise exception 'Solo un administrador puede emitir facturas';
  end if;

  if p_digits not between 4 and 12 then
    raise exception 'La cantidad de dígitos del correlativo debe estar entre 4 y 12';
  end if;

  -- UPDATE ... RETURNING bloquea la fila y es atómico por sesión.
  update public.invoice_settings
  set invoice_current_number = invoice_current_number + 1,
      updated_at = now()
  where id = 1
  returning invoice_current_number into v_next;

  if v_next is null then
    raise exception 'Configuración de facturación no encontrada';
  end if;

  v_number := p_prefix || '-' || p_series || '-' || lpad(v_next::text, p_digits, '0');
  return v_number;
end;
$$;

grant execute on function public.consume_next_invoice_number(text, text, integer) to authenticated;

-- ============================================================
-- 6) RPC: consumir el siguiente número de control (atómico)
-- ============================================================
create or replace function public.consume_next_control_number(
  p_series text,
  p_digits integer default 8
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_number text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede asignar números de control';
  end if;

  if p_digits not between 4 and 12 then
    raise exception 'La cantidad de dígitos del número de control debe estar entre 4 y 12';
  end if;

  update public.invoice_settings
  set control_current_number = control_current_number + 1,
      updated_at = now()
  where id = 1
  returning control_current_number into v_next;

  if v_next is null then
    raise exception 'Configuración de facturación no encontrada';
  end if;

  v_number := p_series || '-' || lpad(v_next::text, p_digits, '0');
  return v_number;
end;
$$;

grant execute on function public.consume_next_control_number(text, integer) to authenticated;

-- ============================================================
-- 7) Políticas RLS
-- ============================================================

-- invoice_settings: lectura para autenticados, escritura solo admin
drop policy if exists "Invoice settings read authenticated" on public.invoice_settings;
create policy "Invoice settings read authenticated"
  on public.invoice_settings for select
  using (auth.role() = 'authenticated');

drop policy if exists "Invoice settings admin all" on public.invoice_settings;
create policy "Invoice settings admin all"
  on public.invoice_settings for all
  using (public.is_admin())
  with check (public.is_admin());

-- invoices: lectura para admin o dueño del pedido, escritura solo admin
drop policy if exists "Invoices read admin or owner" on public.invoices;
create policy "Invoices read admin or owner"
  on public.invoices for select
  using (
    public.is_admin()
    or (
      user_id = auth.uid()
      and exists (
        select 1 from public.solicitudes s
        where s.id = solicitud_id and s.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Invoices admin all" on public.invoices;
create policy "Invoices admin all"
  on public.invoices for all
  using (public.is_admin())
  with check (public.is_admin());