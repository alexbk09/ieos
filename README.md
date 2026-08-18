# ilumax
# ilumaX

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).
Plataforma de catálogo y ventas para productos de iluminación y revestimientos, construida con Next.js y Supabase.

## Built with v0
## Descripción

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.
ilumaX es una tienda digital orientada a mostrar productos premium, gestionar solicitudes de compra y permitir autenticación de usuarios administradores y clientes. La app está desarrollada en Next.js y usa Supabase como backend para autenticación, base de datos y almacenamiento asociado.

[Continue working on v0 →](https://v0.app/chat/projects/prj_RzS5h3DgjVo0TNVqGFnJ9iazteaA)
## Stack principal

## Getting Started
- Next.js 15+
- React
- TypeScript
- Tailwind CSS
- Supabase
- Vercel-ready

First, run the development server:
## Requisitos previos

Antes de iniciar, asegúrate de tener instalado:

- Node.js 18 o superior
- npm o pnpm
- Git
- Acceso a un proyecto de Supabase

## Instalación local

1. Clona el repositorio:

```bash
git clone <url-del-repositorio>
cd ilumax
```

2. Instala dependencias:

```bash
npm install
```

O usando pnpm:

```bash
pnpm install
```

3. Crea el archivo de variables de entorno:

```bash
cp .env.example .env.local
```

Si no existe `.env.example`, crea manualmente `.env.local` con esta estructura:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://tu-proyecto.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="tu-anon-key"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="tu-publishable-key"
SUPABASE_SERVICE_ROLE_KEY="tu-service-role-key"
```

> Importante: todas las variables deben apuntar al mismo proyecto de Supabase. Si mezclas dos proyectos distintos, la app no podrá conectarse correctamente.

## Configuración de Supabase

### 1) Crear el proyecto

- Inicia sesión en Supabase
- Crea un nuevo proyecto
- Copia la URL del proyecto y las claves desde `Project settings > API`

### 2) Habilitar autenticación

En el panel de Supabase:

- Ve a `Authentication > Settings`
- Habilita `Email authentication` si vas a usar login con correo y contraseña
- Configura un redirect URL local si lo necesitas:

```text
http://localhost:3000/auth/callback
```

### 3) Crear las tablas requeridas

Abre el SQL Editor en Supabase y ejecuta este bloque:

```sql
create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price_usd numeric(10,2) not null default 0,
  stock integer not null default 0,
  image_url text,
  colors text[] default '{}',
  specifications jsonb default '{}',
  category_id text,
  featured boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.solicitudes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total_usd numeric(12,2) not null default 0,
  exchange_rate numeric(10,2) default 36.5,
  status text not null default 'pendiente',
  created_at timestamptz default now()
);

alter table public.products enable row level security;
alter table public.solicitudes enable row level security;

create policy "products read"
on public.products
for select
using (true);

create policy "solicitudes select own"
on public.solicitudes
for select
using (auth.uid() = user_id);

create policy "solicitudes insert own"
on public.solicitudes
for insert
with check (auth.uid() = user_id);

create policy "solicitudes update own"
on public.solicitudes
for update
using (auth.uid() = user_id);
```

### 4) Verificar la configuración

La aplicación consulta estas tablas:

- `public.products`
- `public.solicitudes`

Si no existen, la app no podrá cargar el catálogo ni registrar solicitudes.

> La creación de tablas no se hace desde React o Next.js. Debe hacerse en Supabase.

## Comandos principales

Iniciar servidor de desarrollo:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
Compilar para producción:

```bash
npm run build
```

Iniciar proyecto compilado:

```bash
npm run start
```

## Rutas clave

- `/` — catálogo principal
- `/login` — inicio de sesión y registro
- `/dashboard` — panel de usuario
- `/admin` — panel administrativo


### Error de conexión a Supabase

Verifica que:

- la `NEXT_PUBLIC_SUPABASE_URL` sea correcta
- el `anon key` pertenezca al mismo proyecto
- no haya dos proyectos mezclados en el archivo `.env.local`

### Las tablas no existen

Ejecuta el SQL anterior desde el SQL Editor de Supabase en el proyecto correcto.

### Login no funciona

Revisa que:

- la autenticación por email esté habilitada
- el redirect URL esté bien configurado
- el usuario se esté creando en el proyecto correcto

## Despliegue

Este proyecto está preparado para desplegarse en Vercel.

1. Conecta el repositorio a Vercel
2. Agrega las variables de entorno en el panel de Vercel
3. Haz deploy

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More
Proyecto orientado a uso interno del equipo de desarrollo y/o propiedad del cliente.

To learn more, take a look at the following resources:
## Nota final

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
La aplicación usa Supabase como base de datos y autenticación. Si la conexión falla o la app no muestra contenido, lo primero que debes validar es que el proyecto activo en `.env.local` sea exactamente el mismo en el que creaste las tablas y la autenticación.

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
