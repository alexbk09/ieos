-- ============================================================
-- Migración 0016: Módulo de Cotizaciones
--
-- Crea:
--   1. quote_settings   → configuración de cotizaciones (singleton id=1):
--      % de descuento por pago en efectivo en divisas, días de validez,
--      nota por defecto y contador correlativo.
--   2. quotes           → cotizaciones emitidas con descuentos, totales en
--      USD y VES, datos del cliente, vigencia y estado.
--   3. quote_items      → ítems de la cotización (snapshot de producto).
--   4. RPC consume_next_quote_number → genera el correlativo COT-0001.
--   5. Módulo 'cotizaciones' + permisos admin.
--   6. Columnas de descuento en `solicitudes` (subtotal_usd,
--      discount_percent, discount_amount_usd) para que la conversión de
--      cotización → solicitud arrastre el descuento.
--
-- Flujo: cotización (draft) → enviada (sent) → aceptada (accepted)
--        → convertida a solicitud (converted).
-- ============================================================

-- ============================================================
-- 1) Tabla de configuración de cotizaciones (singleton id=1)
-- ============================================================
create table if not exists public.quote_settings (
  id integer primary key default 1 check (id = 1),

  -- % de descuento adicional por pago en EFECTIVO en divisas.
  -- Se aplica automáticamente al total cuando el cliente elige ese método.
  cash_divisa_discount_percent numeric(5,2) not null default 20.00
    check (cash_divisa_discount_percent >= 0 and cash_divisa_discount_percent <= 100),

  -- Días de validez de la cotización (default 15 días hábiles).
  validity_days integer not null default 15 check (validity_days between 1 and 90),

  -- Nota visible al pie de la cotización.
  default_notes text not null default 'Cotización sujeta a disponibilidad de inventario. Los precios pueden variar sin previo aviso.',

  -- Correlativo actual de cotizaciones (COT-0001, COT-0002, …)
  quote_current_number integer not null default 0 check (quote_current_number >= 0),
  quote_prefix text not null default 'COT',
  quote_digits integer not null default 4 check (quote_digits between 4 and 12),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quote_settings enable row level security;

-- ============================================================
-- 2) Tabla de cotizaciones
-- ============================================================
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,

  -- Cliente que recibe la cotización (opcional: puede ser venta directa).
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  customer_address text,

  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'converted', 'cancelled')),

  -- Totales en USD (precios del catálogo).
  subtotal_usd numeric(12,2) not null default 0,
  -- Descuento manual aplicado por el vendedor (%).
  discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  discount_amount_usd numeric(12,2) not null default 0,
  total_usd numeric(12,2) not null default 0,

  -- Tasa BCV capturada al momento de crear la cotización.
  exchange_rate numeric(12,4) not null default 0,
  -- Total convertido a bolívares.
  total_ves numeric(12,2) not null default 0,

  -- Método de pago que declaró el cliente (afecta el descuento).
  payment_method text not null default 'other' check (payment_method in ('cash_divisa', 'transfer_divisa', 'other')),

  -- Vigencia de la cotización.
  validity_days integer not null default 15,
  valid_until date,

  -- Nota visible al pie.
  notes text,

  -- Snapshot de la configuración usada (para trazabilidad histórica).
  cash_divisa_discount_percent numeric(5,2) not null default 20.00,
  shows_cash_divisa_note boolean not null default true,

  sent_at timestamptz,
  converted_to_solicitud_id uuid references public.solicitudes(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quotes enable row level security;

-- ============================================================
-- 3) Tabla de ítems de cotización
-- ============================================================
create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_usd numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.quote_items enable row level security;

-- Índices
create index if not exists idx_quotes_created on public.quotes (created_at desc);
create index if not exists idx_quotes_user on public.quotes (user_id);
create index if not exists idx_quote_items_quote on public.quote_items (quote_id);

-- ============================================================
-- 4) RPC: generar el siguiente número de cotización (atómico)
-- ============================================================
create or replace function public.consume_next_quote_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_number text;
  v_prefix text;
  v_digits integer;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede generar cotizaciones';
  end if;

  update public.quote_settings
  set quote_current_number = quote_current_number + 1,
      updated_at = now()
  where id = 1
  returning quote_current_number into v_next;

  if v_next is null then
    raise exception 'Configuración de cotizaciones no encontrada';
  end if;

  select quote_prefix, quote_digits into v_prefix, v_digits
  from public.quote_settings where id = 1;

  v_number := v_prefix || '-' || lpad(v_next::text, v_digits, '0');
  return v_number;
end;
$$;

grant execute on function public.consume_next_quote_number() to authenticated;

-- ============================================================
-- 5) Fila inicial de configuración
-- ============================================================
insert into public.quote_settings (
  id, cash_divisa_discount_percent, validity_days, default_notes,
  quote_current_number, quote_prefix, quote_digits
)
values (1, 20.00, 15, 'Cotización sujeta a disponibilidad de inventario. Los precios pueden variar sin previo aviso.', 0, 'COT', 4)
on conflict (id) do nothing;

-- ============================================================
-- 6) Columnas de descuento en solicitudes (para conversión)
-- ============================================================
alter table public.solicitudes
  add column if not exists subtotal_usd numeric(12,2) not null default 0,
  add column if not exists discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  add column if not exists discount_amount_usd numeric(12,2) not null default 0,
  add column if not exists payment_method text not null default 'other'
    check (payment_method in ('cash_divisa', 'transfer_divisa', 'other'));

-- ============================================================
-- 7) Triggers de updated_at
-- ============================================================
drop trigger if exists quote_settings_set_updated_at on public.quote_settings;
create trigger quote_settings_set_updated_at
before update on public.quote_settings
for each row execute procedure public.set_updated_at();

drop trigger if exists quotes_set_updated_at on public.quotes;
create trigger quotes_set_updated_at
before update on public.quotes
for each row execute procedure public.set_updated_at();

-- ============================================================
-- 8) Módulo 'cotizaciones' + permisos admin
-- ============================================================
insert into public.modules (name, slug, description)
values ('Cotizaciones', 'cotizaciones', 'Creación, envío y conversión de cotizaciones a solicitudes')
on conflict (slug) do update
  set name = excluded.name, description = excluded.description;

insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
select r.id, m.id, true, true, true
from public.roles r
cross join public.modules m
where r.name = 'admin'
  and m.slug = 'cotizaciones'
on conflict (role_id, module_id)
do update set can_read = true, can_write = true, can_delete = true;

-- ============================================================
-- 9) Políticas RLS
-- ============================================================

-- quote_settings: lectura autenticados, escritura solo admin
drop policy if exists "Quote settings read authenticated" on public.quote_settings;
create policy "Quote settings read authenticated"
  on public.quote_settings for select
  using (auth.role() = 'authenticated');

drop policy if exists "Quote settings admin all" on public.quote_settings;
create policy "Quote settings admin all"
  on public.quote_settings for all
  using (public.is_admin())
  with check (public.is_admin());

-- quotes: lectura admin (o dueño si user_id existe), escritura admin
drop policy if exists "Quotes read admin or owner" on public.quotes;
create policy "Quotes read admin or owner"
  on public.quotes for select
  using (public.is_admin() or (user_id is not null and user_id = auth.uid()));

drop policy if exists "Quotes admin all" on public.quotes;
create policy "Quotes admin all"
  on public.quotes for all
  using (public.is_admin())
  with check (public.is_admin());

-- quote_items: lectura admin o dueño, escritura admin
drop policy if exists "Quote items read admin or owner" on public.quote_items;
create policy "Quote items read admin or owner"
  on public.quote_items for select
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and (public.is_admin() or (q.user_id is not null and q.user_id = auth.uid()))
    )
  );

drop policy if exists "Quote items admin all" on public.quote_items;
create policy "Quote items admin all"
  on public.quote_items for all
  using (public.is_admin())
  with check (public.is_admin());