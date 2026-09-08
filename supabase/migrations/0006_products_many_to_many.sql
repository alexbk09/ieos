-- Migración 0006: Relación N:N productos ↔ categorías + imágenes múltiples
-- Crea tablas puente: product_categories (N:N) y product_images (1:N)

-- ============================================================
-- Tabla puente: productos ↔ categorías (N:N)
-- ============================================================
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (product_id, category_id)
);

alter table public.product_categories enable row level security;

-- ============================================================
-- Tabla de imágenes de producto (1:N)
-- ============================================================
create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.product_images enable row level security;

-- ============================================================
-- Índices para acelerar consultas frecuentes
-- ============================================================
create index if not exists idx_product_categories_product_id on public.product_categories(product_id);
create index if not exists idx_product_categories_category_id on public.product_categories(category_id);
create index if not exists idx_product_images_product_id on public.product_images(product_id);
create index if not exists idx_products_featured on public.products(featured) where featured = true;

-- ============================================================
-- Políticas RLS: product_categories
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'product_categories' and policyname = 'Product categories read public'
  ) then
    create policy "Product categories read public"
    on public.product_categories for select
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'product_categories' and policyname = 'Product categories admin all'
  ) then
    create policy "Product categories admin all"
    on public.product_categories for all
    using (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    )
    with check (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
  end if;
end $$;

-- ============================================================
-- Políticas RLS: product_images
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'product_images' and policyname = 'Product images read public'
  ) then
    create policy "Product images read public"
    on public.product_images for select
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'product_images' and policyname = 'Product images admin all'
  ) then
    create policy "Product images admin all"
    on public.product_images for all
    using (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    )
    with check (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    );
  end if;
end $$;

-- ============================================================
-- Sincronizar datos existentes
-- ============================================================
-- 1) Copiar category_id de products a product_categories
--    (products.category_id puede ser text; se castea a uuid cuando tiene formato válido)
insert into public.product_categories (product_id, category_id)
select p.id, p.category_id::uuid
from public.products p
where p.category_id is not null
  and p.category_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (product_id, category_id) do nothing;

-- 2) Copiar image_url de products a product_images como primera imagen
insert into public.product_images (product_id, url, sort_order)
select p.id, p.image_url, 0
from public.products p
where p.image_url is not null
on conflict do nothing;