-- Migracion 0016: RIF opcional en proveedores
-- Permite crear proveedores solo con nombre.
-- El RIF se puede editar despues desde el modulo.

alter table public.proveedores
  alter column rif drop not null;