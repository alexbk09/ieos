# ilumaX

Plataforma Next.js para ilumaX: catálogo de iluminación y revestimientos, solicitudes de compra y paneles protegidos por Supabase.

## Stack principal

- Next.js 16, React y TypeScript
- Tailwind CSS
- Supabase Auth, Postgres y Storage
- Vercel-ready

## Desarrollo

```bash
pnpm install
pnpm dev
```

Compilar y ejecutar producción:

```bash
pnpm build
pnpm start
```

## Variables de entorno

El runtime usa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, con fallback a `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Todas las variables deben apuntar al mismo proyecto de Supabase.

## Supabase

La creación de solicitudes pasa por `POST /api/solicitudes`, donde el servidor valida sesión, cantidades, stock y precios actuales antes de insertar `solicitudes` y `solicitud_items`. Los roles se resuelven desde `profiles.role`, nunca desde metadata editable del usuario.

Para habilitar imágenes desde administración, configura el bucket público `productos-bucket` y estas políticas:

```sql
insert into storage.buckets (id, name, public)
values ('productos-bucket', 'productos-bucket', true)
on conflict (id) do update set public = true;

create policy "Public product images"
on storage.objects for select
using (bucket_id = 'productos-bucket');

create policy "Admins upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'productos-bucket'
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

create policy "Admins update product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'productos-bucket'
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
)
with check (
  bucket_id = 'productos-bucket'
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
```

El aviso administrativo puede conectarse posteriormente a un proveedor de correo o webhook mediante variables de servidor; no se exponen secretos al cliente.

## Rutas clave

- `/` — catálogo principal
- `/login` — inicio de sesión y registro
- `/dashboard` — panel de cliente
- `/admin` — panel administrativo
- `/api/solicitudes` — creación validada de solicitudes

## Estructura

```text
ilumax/
├── app/
│   ├── admin/
│   ├── api/solicitudes/
│   ├── auth/
│   ├── dashboard/
│   ├── login/
│   └── page.tsx
├── components/
│   ├── storefront.tsx
│   └── ui/
├── lib/supabase/
├── public/products/
├── package.json
└── README.md
```

## Solución de problemas

Si Supabase no conecta, verifica que `NEXT_PUBLIC_SUPABASE_URL` y la clave pública pertenezcan al mismo proyecto. Si no aparecen productos o solicitudes, confirma que las tablas públicas y sus políticas RLS estén creadas en ese proyecto.

La aplicación usa Supabase como backend y está preparada para desplegarse en Vercel.

## Licencia

Proyecto orientado a uso interno del equipo de desarrollo y/o propiedad del cliente.
