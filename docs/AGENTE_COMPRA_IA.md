# Asistente de Catálogo y Afiliados (IA)

## Qué es
Widget de chat flotante (`components/agent-chat.tsx`) que usa DeepSeek (Vercel AI SDK 4) con function calling, con **alcance restringido a la tienda**:
- Responde dudas de productos, categorías y compras por afiliado (AliExpress/Amazon).
- Busca productos y categorías reales en Supabase (tools ejecutadas en el servidor).
- Agrega al carrito los productos que el cliente aprueba; el pago se cierra en el marketplace vía el enlace de afiliado.
- **Rechaza cualquier tema ajeno** (cultura general, noticias, código, consejos personales, etc.).

## Alcance (off-topic guard)
El alcance se impone desde `AGENT_SYSTEM_PROMPT` en `services/agent.ts`. No se usan listas negras de palabras (frágiles): se instruye al modelo a responder SOLO sobre:
1. Productos: características, precio, stock, colores y disponibilidad.
2. Categorías de la tienda y qué productos las componen.
3. Compras por afiliado: cómo comprar, enlaces, redirección a AliExpress/Amazon, envío, garantía y devoluciones del marketplace.
4. Uso de la tienda: carrito, búsqueda y navegación.

Fuera de eso responde: "Solo puedo ayudarte con productos, categorías y compras por afiliados de zonahobbies." y reconduce al catálogo.

## Herramientas (tools)
- `buscarProductos({ query?, categorySlug?, maxResults? })` — ejecuta en servidor. Busca productos con `is_available = true` por texto (`name`/`description` ilike) y/o por categoría (`product_categories`). Devuelve un snapshot con precio, stock, colores, `pricing_type` y los **enlaces de afiliado** (`url_afiliado_ali` / `url_afiliado_amazon` / `url_afiliado_store` + `has_affiliate_link`).
- `buscarCategorias({ query?, maxResults? })` — ejecuta en servidor. Lista o busca categorías activas (`id, name, slug, description`).
- `agregarAlCarrito({ productId, quantity, unit?, colorName? })` — SIN `execute`: la resuelve el frontend vía `onToolCall` y emite el evento `ilumax:add-to-cart`.

## Flujo
1. El usuario escribe en `components/agent-chat.tsx`; `useChat()` envía el historial a `POST /api/chat`.
2. `app/api/chat/route.ts` usa el proveedor central (`services/ai-provider.ts` → `createDeepSeekProvider()` + `DEEPSEEK_CHAT_MODEL`) y `streamText` con `AGENT_SYSTEM_PROMPT` y `AGENT_TOOLS`. Temperatura y número de pasos salen de `lib/constants.ts` (sin magic numbers).
3. El modelo llama `buscarCategorias` y/o `buscarProductos`; el servidor consulta Supabase con `createPublicClient` (RLS de lectura pública).
4. El stream se renderiza letra a letra; los `tool-invocations` se pintan como chips de categoría (enlaces a `/categoria/[slug]`) y tarjetas de producto con botón **Comprar en AliExpress/Amazon** (abre la URL de afiliado en pestaña nueva y registra `affiliate_click`).
5. Si el cliente aprueba, el modelo llama `agregarAlCarrito`; el frontend lo resuelve con `emitAddToCart` (`lib/cart-bridge.ts`) y la vista activa (`storefront.tsx`, `catalog-view.tsx`, `category-page-view.tsx`) ejecuta su `add()` de `useCart`. Los enlaces de afiliado viajan dentro del ítem del carrito.
6. Al finalizar, el checkout híbrido (`hooks/use-cart.ts` → `finishAffiliateCheckout`) abre los enlaces de afiliado y/o muestra `AffiliateRedirectModal`.

## Analítica
- `track_agent_search` (RPC) registra el término buscado (`source = agent`) y las impresiones (`ai_impressions_count`) de los productos mostrados.
- Las búsquedas de categorías se registran con la misma RPC (sin impresiones).
- El clic real de salida al marketplace lo registra `trackAffiliateClick` (evento `affiliate_click`).
- Panel: `/admin/analytics-productos`.

## Reglas arquitectónicas respetadas
- Ningún componente llama `supabase.from()`: toda la data del agente vive en `services/agent.ts`.
- Constantes centralizadas en `lib/constants.ts`: `AGENT_MAX_PRODUCT_RESULTS`, `AGENT_MAX_CATEGORY_RESULTS`, `AGENT_MIN_QUERY_LENGTH`, `AGENT_MAX_STEPS`, `AGENT_TEMPERATURE`, `AGENT_CATEGORY_PATH_PREFIX`.
- UI desacoplada: `AgentProductCard` y `AgentCategoryChips` son presentacionales (no consultan Supabase).

## Configuración (variables de entorno)
En `.env.local` o `.env.development.local`:

    DEEPSEEK_API_KEY=sk-...
    DEEPSEEK_BASE_URL=https://api.deepseek.com/v1   # opcional
    DEEPSEEK_MODEL=deepseek-chat                    # opcional

Requiere que `products.is_available`, `categories.activa` y las políticas RLS de lectura pública estén activas (ver `SUPABASE_QUERIES.md`).

## Archivos
- `services/agent.ts` — prompt con alcance, tools y snapshot con enlaces de afiliado.
- `services/ai-provider.ts` — proveedor DeepSeek centralizado.
- `app/api/chat/route.ts` — orquestador serverless (`streamText`).
- `components/agent-chat.tsx` — widget flotante, chips de categoría y tarjetas con CTA de afiliado.
- `lib/constants.ts` — límites y configuración del agente.
- `lib/cart-bridge.ts` + `hooks/use-agent-add-to-cart.ts` — puente IA → carrito.
