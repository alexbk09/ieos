-- Jerarquia aditiva: las categorias existentes pasan a ser subcategorias
-- pendientes de asignar a un hobby principal. Los slugs y URLs no cambian.
alter table public.categories
  add column if not exists tipo text not null default 'subcategoria',
  add column if not exists parent_id uuid references public.categories(id) on delete restrict;

-- Las rutas principales y las landings de nicho viven en espacios distintos:
-- /desk-setup y /categoria/desk-setup pueden conservar el mismo slug.
alter table public.categories drop constraint if exists categories_slug_key;
create unique index if not exists idx_categories_tipo_slug_unique
  on public.categories(tipo, slug);

alter table public.categories
  drop constraint if exists categories_tipo_check;

alter table public.categories
  add constraint categories_tipo_check check (tipo in ('principal', 'subcategoria')),
  drop constraint if exists categories_principal_sin_padre_check;

alter table public.categories
  add constraint categories_principal_sin_padre_check
  check (tipo <> 'principal' or parent_id is null),
  drop constraint if exists categories_no_self_parent_check;

alter table public.categories
  add constraint categories_no_self_parent_check
  check (parent_id is null or parent_id <> id);

create index if not exists idx_categories_parent_id on public.categories(parent_id);

create or replace function public.validate_category_hierarchy()
returns trigger
language plpgsql
as $$
declare
  parent_tipo text;
begin
  if new.tipo not in ('principal', 'subcategoria') then
    raise exception 'Tipo de categoria no valido.';
  end if;

  if tg_op = 'UPDATE' and new.tipo is distinct from old.tipo then
    raise exception 'El nivel de una categoria existente es inmutable para preservar sus rutas.';
  end if;

  if tg_op = 'UPDATE' and new.slug is distinct from old.slug then
    raise exception 'El slug de una categoria existente es inmutable para preservar sus URLs.';
  end if;

  if new.tipo = 'principal' and new.parent_id is not null then
    raise exception 'Una categoria principal no puede tener padre.';
  end if;

  if new.parent_id is not null then
    select tipo into parent_tipo
    from public.categories
    where id = new.parent_id;

    if parent_tipo is distinct from 'principal' then
      raise exception 'La categoria padre debe ser principal.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists categories_validate_hierarchy on public.categories;
create trigger categories_validate_hierarchy
before insert or update on public.categories
for each row execute function public.validate_category_hierarchy();

create or replace function public.validate_product_category_kind()
returns trigger
language plpgsql
as $$
declare
  category_tipo text;
begin
  select tipo into category_tipo
  from public.categories
  where id = new.category_id;

  if category_tipo is distinct from 'subcategoria' then
    raise exception 'Los productos deben asignarse a una subcategoria.';
  end if;

  return new;
end;
$$;

drop trigger if exists product_categories_validate_kind on public.product_categories;
create trigger product_categories_validate_kind
before insert or update on public.product_categories
for each row execute function public.validate_product_category_kind();

-- Hobbies principales basados en la propuesta y en los nichos actualmente publicados.
insert into public.categories (name, slug, description, activa, tipo)
values
  ('Gaming', 'gaming', 'Consolas, videojuegos y accesorios para jugar.', true, 'principal'),
  ('Coleccionismo', 'coleccionismo', 'Colecciones, figuras y objetos de aficion.', true, 'principal'),
  ('Electronica', 'electronica', 'Dispositivos, componentes y accesorios electronicos.', true, 'principal'),
  ('Bricolaje', 'bricolaje', 'Herramientas, reparacion y proyectos DIY.', true, 'principal'),
  ('Modelismo', 'modelismo', 'Modelos, maquetas y herramientas de construccion.', true, 'principal'),
  ('Fotografia', 'fotografia', 'Camaras, iluminacion y accesorios fotograficos.', true, 'principal'),
  ('Musica', 'musica', 'Instrumentos y accesorios para crear musica.', true, 'principal'),
  ('Desk setup', 'desk-setup', 'Accesorios para escritorios y espacios de trabajo.', true, 'principal'),
  ('Automocion', 'automocion', 'Accesorios para automoviles y cuidado vehicular.', true, 'principal'),
  ('Mascotas', 'mascotas', 'Productos y tecnologia para el cuidado de mascotas.', true, 'principal'),
  ('Cafe y barismo', 'cafe-barismo', 'Equipos y accesorios para preparar cafe y espresso.', true, 'principal'),
  ('Hogar y cocina', 'hogar-cocina', 'Organizacion, cocina y soluciones practicas para el hogar.', true, 'principal'),
  ('Bienestar y cuidado personal', 'bienestar-cuidado-personal', 'Dispositivos y productos para el cuidado personal y el bienestar.', true, 'principal')
on conflict (tipo, slug) do nothing;

-- Asignacion inicial revisada por nicho. Las etiquetas promocionales o ambiguas
-- (Best Seller, novedades, PVC, Importados AliExpress, etc.) quedan sin padre
-- para mantener su URL y permitir una decision editorial posterior.
with assignments(parent_slug, child_slug) as (
  values
    ('gaming', 'retro-handheld-game-console'),
    ('gaming', 'protective-case-travel-console'),
    ('gaming', 'arcade-diy-kit-usb'),
    ('gaming', 'controller-ps5'),
    ('gaming', 'replacement-screen-gaming'),
    ('coleccionismo', 'anime-figure-collectible'),
    ('coleccionismo', 'acrylic-stand-anime'),
    ('coleccionismo', 'action-figure-display-case'),
    ('electronica', 'earphones'),
    ('electronica', 'hearphones'),
    ('electronica', 'solar-power-bank-outdoor'),
    ('electronica', '3-in-1-magnetic-wireless-charger'),
    ('electronica', 'foldable-charging-station-wireless'),
    ('electronica', 'inkless-bluetooth-printer'),
    ('electronica', 'wireless-pocket-printer'),
    ('electronica', 'portable-thermal-printer'),
    ('electronica', 'tuya-smart-home-devices'),
    ('electronica', 'tuya-wifi-temperature-humidity-sensor'),
    ('electronica', 'smart-smartlife-ir-remote-control'),
    ('electronica', 'outdoor-solar-tech'),
    ('desk-setup', 'rgb-led-light-bar'),
    ('desk-setup', 'monitor-light-bars'),
    ('desk-setup', 'desk-setup'),
    ('desk-setup', 'desk-setup-ergonomics'),
    ('desk-setup', 'desk-cable-organizer-silicone'),
    ('desk-setup', 'mechanical-keyboards-customization'),
    ('desk-setup', 'mechanical-keyboard-diy'),
    ('desk-setup', 'keycaps'),
    ('desk-setup', 'magnetic-charging-cable'),
    ('cafe-barismo', 'electric-coffee-scale-timer'),
    ('cafe-barismo', 'coffee-distributor-58mm'),
    ('cafe-barismo', 'milk-frothing-pitcher'),
    ('cafe-barismo', 'bottomless-portafilter'),
    ('mascotas', 'pet-hair-remover-brush-self-cleaning'),
    ('mascotas', 'automatic-cat-feeder'),
    ('mascotas', 'automatic-pet-feeder-wifi'),
    ('mascotas', 'cat-grooming-deshedding-tool'),
    ('mascotas', 'moving-dog-toy-smart'),
    ('mascotas', 'interactive-cat-toy-ball'),
    ('mascotas', 'smart-pet-tech'),
    ('hogar-cocina', 'reusable-silicone-food-bags'),
    ('hogar-cocina', 'stainless-steel-portable-food-warmer'),
    ('hogar-cocina', 'kitchen-storage-organizer-shelf'),
    ('hogar-cocina', 'electric-heating-lunch-box'),
    ('hogar-cocina', 'wall-mounted-bathroom-organizer'),
    ('hogar-cocina', 'stretch-silicone-lids-food-wrap'),
    ('automocion', 'car-detailing-clay-bar'),
    ('automocion', 'led-car-bulb-canbus'),
    ('automocion', 'foam-cannon-lance'),
    ('automocion', 'wireless-car-polisher'),
    ('bienestar-cuidado-personal', 'adjustable-posture-corrector'),
    ('bienestar-cuidado-personal', 'health-wearables-gadgets'),
    ('bienestar-cuidado-personal', 'ultrasonic-skin-scrubber'),
    ('bienestar-cuidado-personal', 'led-face-massager-microcurrent'),
    ('bienestar-cuidado-personal', 'mini-massage-gun-portable')
)
update public.categories as child
set parent_id = parent.id,
    updated_at = now()
from assignments
join public.categories as parent
  on parent.tipo = 'principal'
 and parent.slug = assignments.parent_slug
where child.tipo = 'subcategoria'
  and child.slug = assignments.child_slug;