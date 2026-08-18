# ilumaX

Plataforma de catálogo y ventas para productos de iluminación y revestimientos, construida con Next.js y Supabase.

## Descripción

ilumaX es una tienda digital orientada a mostrar productos premium, gestionar solicitudes de compra y permitir autenticación de usuarios administradores y clientes. La app está desarrollada en Next.js y usa Supabase como backend para autenticación, base de datos y almacenamiento asociado.

## Stack principal

- Next.js 15+
- React
- TypeScript
- Tailwind CSS
- Supabase
- Vercel-ready

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

## Estructura del proyecto

```text
ilumax/
├── app/
│   ├── admin/
│   ├── auth/
│   ├── dashboard/
│   ├── login/
│   └── page.tsx
├── components/
│   ├── storefront.tsx
│   └── ui/
├── lib/
│   └── supabase/
├── public/
│   └── products/
├── package.json
├── next.config.mjs
├── tsconfig.json
├── .env.local
├── README.md
└── ...
```

## Comandos principales

Iniciar servidor de desarrollo:

```bash
npm run dev
```

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

## Solución de problemas

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

## Licencia

Proyecto orientado a uso interno del equipo de desarrollo y/o propiedad del cliente.

## Nota final

La aplicación usa Supabase como base de datos y autenticación. Si la conexión falla o la app no muestra contenido, lo primero que debes validar es que el proyecto activo en `.env.local` sea exactamente el mismo en el que creaste las tablas y la autenticación.
