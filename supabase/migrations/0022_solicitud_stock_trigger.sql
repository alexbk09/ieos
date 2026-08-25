-- ============================================================
-- Migración 0022: Stock automático por estado de solicitud
--
-- Resta stock cuando una solicitud pasa a 'completed'.
-- Devuelve stock si sale de 'completed' (para corregir/deshacer).
-- Las cancelaciones de solicitudes NO completadas no afectan stock.
-- ============================================================

-- 1) Función que ajusta el stock según el cambio de estado
create or replace function public.adjust_stock_on_solicitud_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  si public.solicitud_items%rowtype;
begin
  -- Transición → completed: restar stock (evita stock negativo).
  if new.status = 'completed' and old.status is distinct from 'completed' then
    for si in
      select * from public.solicitud_items where solicitud_id = new.id
    loop
      update public.products
        set stock = stock - si.quantity
        where id = si.product_id
          and stock >= si.quantity;
    end loop;
  end if;

  -- Transición desde completed → otro estado: devolver stock (deshacer venta).
  if old.status = 'completed' and new.status is distinct from 'completed' then
    for si in
      select * from public.solicitud_items where solicitud_id = new.id
    loop
      update public.products
        set stock = stock + si.quantity
        where id = si.product_id;
    end loop;
  end if;

  return new;
end;
$$;

-- 2) Trigger AFTER UPDATE de status
drop trigger if exists solicitudes_adjust_stock on public.solicitudes;
create trigger solicitudes_adjust_stock
after update of status on public.solicitudes
for each row execute procedure public.adjust_stock_on_solicitud_status();