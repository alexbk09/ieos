-- La columna products.category_id es legacy, pero sigue escribiendose junto
-- con product_categories. Ambas relaciones deben aceptar solo subcategorias.
create or replace function public.validate_product_category_kind()
returns trigger
language plpgsql
as $$
declare
  category_tipo text;
begin
  if new.category_id is null then
    return new;
  end if;

  select tipo into category_tipo
  from public.categories
  where id = new.category_id;

  if category_tipo is distinct from 'subcategoria' then
    raise exception 'Los productos deben asignarse a una subcategoria.';
  end if;

  return new;
end;
$$;

drop trigger if exists products_validate_category_kind on public.products;
create trigger products_validate_category_kind
before insert or update on public.products
for each row execute function public.validate_product_category_kind();