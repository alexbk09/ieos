# Indexación automática en buscadores (Google + IndexNow)

> Módulo `seo_indexing` · Panel: **Catálogo → Indexación en Buscadores**
> API: `GET|POST|DELETE /api/admin/seo-indexing` · Migración: `0060_seo_indexing.sql`

---

## 1. Lo primero: qué permite Google y qué no (y por qué)

Antes de escribir código se revisó la documentación oficial. El resultado cambia
por completo el diseño:

| Canal | ¿Se puede automatizar? | Alcance real hoy |
|---|---|---|
| **Indexing API** (`indexing.googleapis.com`) | Sí, pero **restringido** | Solo páginas con `JobPosting` o `BroadcastEvent` (VideoObject). |
| **Ping de sitemaps** (`/ping?sitemap=`) | **Eliminado** (2023) | Ya no existe: Google lo retiró sin sustituto público. |
| **"Solicitar indexación"** (botón de Search Console) | **No** | No hay API pública; es solo interfaz. |
| **Sitemap + `lastmod`** | Sí (ya implementado) | Canal correcto para páginas normales: Google decide el recrawl. |
| **Search Console API** → `sitemaps.put` | Sí | Reenvía el sitemap y refresca los `lastmod`. |
| **Search Console API** → `urlInspection.index:inspect` | Sí (**solo lectura**) | Estado real de cada URL: `coverageState`. Cuota ~2.000/día. |
| **IndexNow** (Bing, Yandex, Seznam, Naver) | Sí, sin restricción de tipo | Empuje inmediato en lote (hasta 10.000 URLs por POST). |

Las dos frases oficiales que gobiernan este módulo:

> "The Indexing API can only be used to crawl pages with either JobPosting or
> BroadcastEvent embedded in a VideoObject."
> — <https://developers.google.com/search/apis/indexing-api/v3/quickstart>

> "Any attempts to abuse the Indexing API, including the use of multiple accounts
> or other means to exceed usage quotas, may result in access being revoked."

**Conclusión:** enviar productos, categorías o guías por la Indexing API va contra
las directrices y arriesga el acceso del proyecto. Por eso el módulo:

1. Empuja **cada publicación** a **IndexNow** (canal permitido para cualquier tipo).
2. Deja que **Google** lo reciba por el **sitemap** (con `lastmod` real) y por el
   **reenvío del sitemap** desde Search Console.
3. **Audita** el estado real de cada URL con la **URL Inspection API** (lectura).
4. Solo usa la **Indexing API** para tipos soportados (`job_posting`,
   `broadcast_event`) con una **guardia de política** activada por defecto.

---

## 2. Arquitectura (reglas de oro respetadas)

```
Publicación (IA o panel)
  └─ services/catalog.ts · services/entries.ts · services/aliProducts.ts (pipeline IA)
       └─ notificarPublicacionIndexable()      ← WEBHOOK interno (jamás lo llama un componente)
            ├─ 1. Encola la URL en seo_indexing_urls (prioridad alta, auditable)
            └─ 2. Envía YA si hay cuota: IndexNow + (Google solo si el tipo lo permite)

Panel /admin/seo-indexing → /api/admin/seo-indexing → services/seo-indexing.ts
                                                      ├─ services/indexnow.ts
                                                      └─ services/google-indexing.ts
                                                           ├─ Indexing API (JobPosting/BroadcastEvent)
                                                           ├─ URL Inspection API (solo lectura)
                                                           └─ Search Console Sitemaps API (reenvío)

Lógica pura y testeable: lib/indexing-rules.mjs (+ .d.ts) → tests/indexing-rules.test.mjs
Constantes y límites:    lib/constants.ts (INDEXING_DAILY_LIMIT = 100, SEO_INDEXING_BATCH_SIZE = 25…)
```

**Ningún componente llama a Supabase ni a Google.** El manager solo consume la API
RBAC del módulo; los servicios del catálogo solo llaman al webhook.

### Archivos creados

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0060_seo_indexing.sql` | Tablas cola+log, RPCs (`claim_batch`, `release_stale`, `summary`), RLS y módulo RBAC. |
| `lib/indexing-rules.mjs` · `.d.ts` | Reglas puras: política de Google, validación de URLs, cuota, lotes, reintentos, mapeo de `coverageState`. |
| `lib/runtime-flags.ts` | Lectura centralizada de flags booleanos del entorno. |
| `services/google-indexing.ts` | OAuth2 (JWT RS256 con `node:crypto`), Indexing API, URL Inspection y reenvío de sitemap. |
| `services/indexnow.ts` | Envío de lotes a IndexNow (Bing, Yandex, Seznam, Naver). |
| `services/seo-indexing.ts` | Cola, sincronización con el sitemap, envío por lotes, auditoría y **webhook de publicación**. |
| `app/api/admin/seo-indexing/route.ts` | API del módulo con `requireAdmin()` + `hasPermission()`. |
| `app/(internal)/admin/seo-indexing/page.tsx` | Server component: RBAC + datos iniciales. |
| `components/seo-indexing-manager.tsx` | UI: tarjetas, acciones por lotes, filtros, tabla y auditoría. |
| `tests/indexing-rules.test.mjs` | Pruebas económicas de la lógica crítica. |
| `scripts/generate-indexnow-key.mjs` | Genera `public/<INDEXNOW_KEY>.txt` desde el `.env` (se ejecuta solo en `predev`/`prebuild`). |

---

## 3. Puesta en marcha

### 3.1 Google Cloud / Search Console

1. **Habilitar las APIs** en el proyecto `hobbies-indexing-api`: *Indexing API* y
   *Google Search Console API*.
2. **Cuenta de servicio**: `hobbie-apis@hobbies-indexing-api.iam.gserviceaccount.com`.
3. **Search Console**: esa cuenta debe figurar como **Propietario** de la propiedad
   (ya configurado). Sin eso, `sitemaps.put` y `urlInspection` devuelven 403.
4. **Cuota de la Indexing API**: el proyecto arranca con **200/día** para pruebas;
   para producción Google exige solicitar aprobación y cuota adicional.

### 3.2 Variables de entorno

En local van en `.env.local` (ya están). **En producción (Vercel) hay que crearlas
a mano**, porque los `.env*` están en `.gitignore`:

```env
GOOGLE_INDEXING_PROJECT_ID="hobbies-indexing-api"
GOOGLE_INDEXING_CLIENT_EMAIL="hobbie-apis@hobbies-indexing-api.iam.gserviceaccount.com"
GOOGLE_INDEXING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
GOOGLE_SEARCH_CONSOLE_SITE_URL="https://zonadehobbies.online/"
GOOGLE_INDEXING_STRICT="true"
INDEXING_AUTO_DISPATCH_ENABLED="1"
INDEXNOW_ENABLED="1"
INDEXNOW_KEY="9f3a1c7e5b2d86401fa6c93e7d5b18a4"
INDEXNOW_ENDPOINT="https://api.indexnow.org/indexnow"
```

- La clave privada va en **una sola línea** con `\n` escapados (el servicio los
  convierte; también acepta base64).
- `GOOGLE_INDEXING_STRICT=true` (por defecto) = nunca se envían a la Indexing API
  tipos que Google no admite. Ponerlo en `false` es una decisión consciente y el
  panel la marca en rojo como riesgo de política.
- `INDEXING_AUTO_DISPATCH_ENABLED=0` deja las URLs en cola sin enviar (útil en
  importaciones masivas; luego se envían en lotes desde el panel).
- Los topes (**100/día**, lotes de **25**) viven en `lib/constants.ts` para que la
  UI y el servidor usen exactamente el mismo número.

### 3.3 Base de datos

```bash
npm run supabase:setup      # aplica la migración 0060 (idempotente)
npm run supabase:verify     # verifica el estado
```

### 3.4 IndexNow

El archivo de verificación **no está fijo en el repositorio**: se genera desde el
entorno para que cada instalación use su propia clave.

```bash
npm run indexnow:key          # genera public/<INDEXNOW_KEY>.txt
npm run indexnow:key:dry      # muestra qué haría, sin escribir nada
```

- Se ejecuta **automáticamente** antes de `npm run dev` y `npm run build`
  (`predev` / `prebuild`), así que también se genera durante el despliegue.
- Si cambias `INDEXNOW_KEY`, el script **borra el archivo anterior** y crea el
  nuevo (nunca se sirve una clave obsoleta).
- Nunca aborta el build: una clave ausente o mal formada solo se avisa por
  consola (una función SEO opcional no debe tumbar el despliegue) y el panel la
  señala en el **Diagnóstico**.
- La clave de IndexNow **no es un secreto**: el buscador descarga ese archivo para
  validarla. Aun así, no la publiques fuera del dominio.

---

## 4. Uso del panel

1. **Sincronizar sitemap** — importa a la cola todas las URLs que hoy declara
   `/sitemap.xml` (incluidos los idiomas). Solo **agrega** lo que falta: nunca
   reinicia el trabajo hecho.
2. **Enviar tanda (25)** — empuja 25 URLs pendientes por los canales permitidos.
3. **Enviar todo (hasta 100/día)** — repite tandas hasta agotar la cuota diaria.
4. **Auditar en Google** — consulta el `coverageState` real de 25 URLs (indexado /
   sin indexar / excluido por noindex) y lo guarda en la cola.
5. **Reenviar sitemap** — `sitemaps.put` sobre la propiedad de Search Console.
6. **Limpiar registro / quitar URL** — requieren permiso `delete`.

Cada acción exige el permiso del módulo: `read` para ver, `write` para enviar y
auditar, `delete` para borrar. Todo queda auditado en `seo_indexing_log` con canal,
código HTTP, resultado y correo del operador.

### Flujo automático al publicar

| Acción | Qué ocurre |
|---|---|
| La IA (pipeline AliExpress) crea un producto | `createProduct` → webhook → IndexNow inmediato + fila en la cola. |
| Se crea/edita una categoría o se genera su hub SEO | `createCategory` / `updateCategory` / `updateCategorySeo` → webhook. |
| Se publica una guía o comparativa | `createEntry` / `updateEntryEstado('publicado')` → webhook (los borradores no se anuncian). |
| Importación masiva | Sin envío inmediato (`revalidar: false`); el panel sincroniza y envía en lotes. |

---

## 5. Límites, cuotas y buenas prácticas

- **100 URLs/día** de empuje (`INDEXING_DAILY_LIMIT`), en lotes de **25**
  (`SEO_INDEXING_BATCH_SIZE`). El contador se reinicia a las **00:00 UTC** y el
  panel muestra los envíos restantes.
- **IndexNow**: un POST por tanda (máx. 25) en vez de miles de peticiones.
- **URL Inspection API**: ~2.000 consultas/día por propiedad; las auditorías van de
  25 en 25 y **no** consumen la cuota de empuje.
- **Indexing API de Google**: 200/día por defecto (ampliable solo con aprobación).
- **Reintentos**: 429, 5xx y fallos de red vuelven a `pendiente`; 400/422 se marcan
  como `error` definitivo (reintentar no arregla un payload inválido).
- **Lotes abandonados**: si una request muere a mitad, las filas quedan `enviando` y
  `seo_indexing_release_stale()` las devuelve a `pendiente` a los 15 minutos.
- **Reclamo atómico**: `seo_indexing_claim_batch()` usa `FOR UPDATE SKIP LOCKED`, así
  dos operadores nunca envían la misma URL.
- **Nada de "spam a escala"**: solo se envían URLs propias y publicadas (las que
  están en el sitemap), con los topes de arriba y auditoría completa.

---

## 6. ⚠️ Seguridad de la credencial

La clave privada de la cuenta de servicio se compartió por chat para configurarla y
**debe considerarse comprometida**. Antes de desplegar:

1. Google Cloud → *IAM y administración* → *Cuentas de servicio* → `hobbie-apis` →
   *Claves* → **eliminar la clave** `c30e8ad793969a944bc4021555710e0370880bd1`.
2. Crear una **clave nueva (JSON)** y actualizar `GOOGLE_INDEXING_PRIVATE_KEY` (solo
   en `.env.local` y en las variables de Vercel; nunca en el repositorio).
3. Rotar también `INDEXNOW_KEY` si alguna vez se filtró.

---

## 7. Verificación

```bash
npm test                                  # incluye tests/indexing-rules.test.mjs
npx tsc --noEmit                          # sin errores en los archivos del módulo
```

Checklist funcional en el panel:

- [ ] «Sincronizar sitemap» inserta URLs nuevas y el total de la cola sube.
- [ ] «Enviar tanda» deja las filas en `Enviado` y baja la cuota restante.
- [ ] «Auditar en Google» marca `Indexado` / `Sin indexar` (o `Excluido` si hay noindex).
- [ ] «Reenviar sitemap» responde 200 de Search Console.
- [ ] El log muestra cada movimiento con su canal y código HTTP.
- [ ] Publicar una guía nueva dispara una fila `Enviado` vía IndexNow.

---

## 8. Instalar en otro dominio / para otro usuario

**No hay ningún dato del dominio, del correo ni de la clave quemado en el código**:
todo sale del entorno. Checklist para una instalación nueva:

1. **Dominio**: `NEXT_PUBLIC_SITE_URL` (canonical, sitemap, robots y las URLs que se
   envían a buscadores).
2. **Google**: crea tu propio proyecto, habilita *Indexing API* y *Google Search
   Console API*, crea una cuenta de servicio y añádela como **Propietario** en
   Search Console. Después define:
   - `GOOGLE_INDEXING_PROJECT_ID`, `GOOGLE_INDEXING_CLIENT_EMAIL`,
     `GOOGLE_INDEXING_PRIVATE_KEY`, `GOOGLE_SEARCH_CONSOLE_SITE_URL`.
3. **IndexNow**: genera tu clave (8-128 caracteres `[a-zA-Z0-9-]`), define
   `INDEXNOW_KEY` y ejecuta `npm run indexnow:key` (o deja que `prebuild` la genere
   en el despliegue).
4. **Límites** (opcionales): `NEXT_PUBLIC_INDEXING_DAILY_LIMIT` (por defecto 100) y
   `NEXT_PUBLIC_INDEXING_BATCH_SIZE` (por defecto 25).
5. **Base de datos**: `npm run supabase:setup` crea las tablas, las RPC y el módulo
   RBAC `seo_indexing` (el rol `admin` recibe read/write/delete).
6. **Diagnóstico**: en el panel, pulsa **Diagnóstico** — verifica de verdad que
   `/<clave>.txt` responde 200 con la clave y que la cuenta de servicio obtiene
   token. Si algo falla, el mensaje dice exactamente qué corregir.
7. **Directrices**: mantén `GOOGLE_INDEXING_STRICT=true` y no subas los límites más
   de lo razonable; la auditoría queda en `seo_indexing_log`.

### Resumen de variables por instalación

| Variable | Obligatoria | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Sí | Dominio canónico del sitio. |
| `GOOGLE_INDEXING_CLIENT_EMAIL` | Sí (para Google) | Cuenta de servicio. |
| `GOOGLE_INDEXING_PRIVATE_KEY` | Sí (para Google) | Firma del JWT OAuth2. |
| `GOOGLE_SEARCH_CONSOLE_SITE_URL` | Recomendada | Propiedad verificada (`https://dominio/` o `sc-domain:dominio`). |
| `GOOGLE_INDEXING_PROJECT_ID` | Opcional | Solo informativa en el panel. |
| `INDEXNOW_KEY` | Sí (para IndexNow) | Clave pública del protocolo. |
| `INDEXNOW_ENABLED` | Opcional (`1`) | Permite apagar IndexNow sin tocar código. |
| `INDEXNOW_ENDPOINT` | Opcional | Por defecto `https://api.indexnow.org/indexnow`. |
| `GOOGLE_INDEXING_STRICT` | Opcional (`true`) | Guardia de política de Google. |
| `INDEXING_AUTO_DISPATCH_ENABLED` | Opcional (`1`) | Envío inmediato al publicar. |
| `NEXT_PUBLIC_INDEXING_DAILY_LIMIT` | Opcional (`100`) | Tope diario de envíos. |
| `NEXT_PUBLIC_INDEXING_BATCH_SIZE` | Opcional (`25`) | URLs por tanda. |




