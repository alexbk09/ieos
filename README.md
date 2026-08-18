# ilumax

Aplicación Next.js para ilumaX: catálogo de iluminación, solicitudes y paneles protegidos por Supabase.

## Desarrollo

```bash
pnpm dev
```

## Supabase

El runtime usa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con fallback a `NEXT_PUBLIC_SUPABASE_ANON_KEY`. La creación de solicitudes pasa por `POST /api/solicitudes`, donde el servidor valida sesión, cantidades, stock y precios actuales antes de insertar `solicitudes` y `solicitud_items`.

Para habilitar imágenes desde administración, configura el bucket público `productos-bucket` y estas políticas:

```sql
insert into storage.buckets (id, name, public) values ('productos-bucket', 'productos-bucket', true) on conflict (id) do update set public = true;
create policy "Public product images" on storage.objects for select using (bucket_id = 'productos-bucket');
create policy "Admins upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'productos-bucket' and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "Admins update product images" on storage.objects for update to authenticated using (bucket_id = 'productos-bucket' and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')) with check (bucket_id = 'productos-bucket' and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
```

Los roles se resuelven desde `profiles.role`, nunca desde metadata editable del usuario. El aviso administrativo puede conectarse posteriormente a un proveedor de correo/webhook mediante variables de servidor; no se exponen secretos al cliente.
