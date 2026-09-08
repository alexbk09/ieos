# Asistente de Compra Inteligente por Contexto (IA)

## Que es
Widget de chat flotante que usa DeepSeek (via Vercel AI SDK 4) con function calling para:
- Consultar el catalogo REAL de productos en Supabase (herramienta buscarProductos, ejecutada en servidor).
- Agregar al carrito fisico de la tienda los productos que el cliente aprueba (herramienta agregarAlCarrito, ejecutada en el FRONTEND via onToolCall + CustomEvent).

## Arquitectura / Flujo
1. El usuario escribe en components/agent-chat.tsx. useChat() envia el historial a POST /api/chat.
2. El route handler inicializa DeepSeek con createOpenAICompatible (base https://api.deepseek.com/v1) y llama streamText con system + tools (services/agent.ts).
3. Si el LLM decide buscar, streamText ejecuta buscarProductos EN EL SERVIDOR con createPublicClient (Supabase): busca por ilike en products.is_available = true y devuelve un snapshot completo (precios, colores, imagenes, pricing_type, stock_grams). Resultado optimizado para pocos tokens.
4. La respuesta fluye como data stream: useChat renderiza letra a letra y los tool-invocations (buscarProductos) como mini-tarjetas de producto.
5. Si el cliente aprueba, el LLM invoca agregarAlCarrito. Como esa tool NO tiene execute, el SDK la envia al cliente y dispara onToolCall.
6. En onToolCall (frontend) se busca el snapshot del producto en el cache de la conversacion y se llama emitAddToCart (CustomEvent ilumax:add-to-cart). Se devuelve { ok: true } como tool result.
7. La vista activa (storefront.tsx o catalog-view.tsx) escucha ese evento con useAgentAddToCart(add) y ejecuta su propio add() del carrito: abre el drawer, muestra el toast y persiste en localStorage.

## Por que este diseno
- Sin backend Node intermedio: las tools de consulta viven en Route Handlers de Next (serverless) y el carrito sigue en Supabase/localStorage.
- Regla de oro: ningun componente llama supabase.from() - services/agent.ts es la unica capa de datos del agente.
- El carrito sigue siendo un hook local en cada vista (useCart). Para que el agente (que vive en cualquier pagina) lo mute, se usa un puente de eventos global (lib/cart-bridge.ts) en lugar de un Provider global: cero riesgos de regresion y sin duplicar la logica de negocio del carrito.
- Costos minimos de tokens: buscarProductos limita a 6 resultados, el system prompt es corto y el snapshot mapeado solo envia campos utiles.
- Los productos por peso (pricing_type=weight) se recomiendan con su price_per_kilo_usd y min_order_grams para que el usuario confirme gramos/kilos.

## Archivos nuevos/modificados
- services/agent.ts: prompt del sistema, schema zod, tool buscarProductos (execute) y agregarAlCarrito (declarativa).
- app/api/chat/route.ts: orquestador serverless streamText + DeepSeek (modelo deepseek-chat).
- components/agent-chat.tsx: chat flotante responsive (Tailwind, dark mode incluido), estados streaming/error, render de tool-invocations y onToolCall.
- hooks/use-agent-add-to-cart.ts + lib/cart-bridge.ts: puente de eventos IA → carrito.
- app/page.tsx flujo: Storefront y CatalogView ahora montan <AgentChat /> y escuchan el puente.

## Configuracion requerida (variables de entorno)
Añadir a .env.local :

DEEPSEEK_API_KEY=sk-...
# Opcional si usas otro endpoint compatible OpenAI:
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

Nota: el cliente usa Next.js + Supabase URL/publishable key ya existentes. products requiere RLS de lectura publica (ya definida en SUPABASE_QUERIES.md).
