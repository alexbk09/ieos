# Plan de Trabajo — Logística, Finanzas y Contabilidad (ilumaX)

> Documento guía de implementación. Cada módulo nuevo se construye siguiendo el patrón establecido:
> **Migración SQL → Servicio → API → Página → Componente Manager → Menú + Permisos → Tests.**

---

## 0. Base y estándares (preparación transversal)

Se ejecuta una sola vez y sirve para los 3 puntos.

### 0.1 Patrón de módulo con permisos (referencia obligatoria)

Cada módulo nuevo debe replicar el patrón de la migración `0021_margin_adjustment.sql`:

1. **Tabla(s)** con `enable row level security`.
2. **RPC** (si la acción es transaccional): validar con `public.has_permission('<slug>', 'write')` dentro de la función y `grant execute` a `authenticated`.
3. **Registro del módulo** en `public.modules` con `on conflict (slug) do update`.
4. **Permisos completos al rol admin**:
   ```sql
   insert into public.role_permissions (role_id, module_id, can_read, can_write, can_delete)
   select r.id, m.id, true, true, true
   from public.roles r cross join public.modules m
   where r.name = 'admin' and m.slug = '<slug_modulo>'
   on conflict (role_id, module_id) do update set can_read = true, can_write = true, can_delete = true;
   ```
5. **Políticas RLS** leyendo `public.has_permission('<slug>', 'read')` (o la consulta directa a `role_permissions` como en 0021) + fallback `public.is_admin()`.

### 0.2 Archivos a modificar por cada módulo

| Archivo | Acción |
|---|---|
| `supabase/migrations/NNNN_<modulo>.sql` | Nueva migración (tablas + permisos + RLS) |
| `services/<modulo>.ts` | Capa única de acceso a Supabase (nunca `supabase.from()` en componentes) |
| `app/api/admin/<modulo>/route.ts` | API route con `requireAdmin()` + `hasPermission()` |
| `app/admin/<modulo>/page.tsx` | Server component: verifica `can_read`, renderiza `AdminShell` + Manager |
| `components/<modulo>-manager.tsx` | "use client": DataTable + Modal + FormInput, estados de carga y errores toast |
| `components/admin-shell.tsx` | Agregar items al grupo de navegación correspondiente |
| `lib/constants.ts` | Agregar slug/constantes del módulo (evitar strings quemados) |
| `lib/<calculadora>.mjs` | Lógica pura de cálculo (independiente de Supabase) |
| `lib/<calculadora>.d.ts` | Tipos TypeScript para la calculadora pura |
| `tests/<calculadora>.test.mjs` | Tests económicos (solo cálculo, validación y flujos clave) |
| `MANUAL_USUARIO.html` | Documentar cada módulo nuevo |

### 0.3 Nuevos grupos de menú en `admin-shell.tsx`

```
General   → Resumen
Catálogo  → Productos, Categorías, Marcas, Proveedores
Ventas    → Cotizaciones, Facturación, Solicitudes
Logística → Almacenes, Despacho y Rutas, Zonas de Envío      ← NUEVO
Finanzas  → Cuentas por Cobrar, Conciliación Bancaria, Pasarelas de Pago  ← NUEVO
Contabilidad → Libros Fiscales, Facturación XML, Reporte de Margen Neto   ← NUEVO
Usuarios  → Usuarios, Roles y permisos
Sistema   → Ajuste de precios, Configuración
```

---

## 1. Logística, Despacho y Multi-Almacén

### 1.1 Multi-almacén (slug: `almacenes`)

**Objetivo:** Gestionar stock separado por sucursales / depósitos / bodegas.

- **Migración `0029_almacenes.sql`:**
  - Tabla `public.almacenes`: `id`, `nombre`, `codigo`, `tipo` (`sucursal` | `deposito` | `bodega`), `direccion`, `ciudad`, `telefono`, `responsable`, `activo boolean default true`, `created_at`, `updated_at`.
  - Tabla `public.producto_stock_almacen`: `id`, `almacen_id FK`, `product_id FK`, `stock integer default 0`, `stock_grams numeric(12,2) default 0`, `stock_minimo`, `stock_maximo`, `updated_at`, `unique (almacen_id, product_id)`.
  - Registro de módulo `'almacenes'` + permisos admin + RLS (lectura: quien tenga `can_read`; escritura: `can_write`).
- **Servicio** `services/almacenes.ts`: CRUD de almacenes, asignación de stock por producto, transferencias entre almacenes (RPC transaccional `transferir_stock_almacen` que valida `has_permission('almacenes','write')` y mueve stock sin negativos).
- **Página/UI** `app/admin/almacenes/`: `AlmacenesManager` — DataTable de almacenes + modal para stock por producto (selector de producto, cantidad, tipo stock unidad/gramos) + dialog de transferencia entre almacenes.
- **Integración:** El trigger de stock actual (`adjust_stock_on_solicitud_status`) debe ampliarse para restar del almacén asignado a la solicitud (`solicitudes.almacen_id` nueva columna opcional). Si `almacen_id` es null, se mantiene el comportamiento actual (stock global).

### 1.2 Despacho y asignación de rutas (slug: `despachos`)

**Objetivo:** Organizar entregas diarias, asignar transportistas y actualizar estados de envío.

- **Migración `0030_despachos.sql`:**
  - Columna en `solicitudes`: `direccion_entrega text`, `telefono_entrega text` (opcional, para el checkout).
  - Tabla `public.transportistas`: `id`, `nombre`, `tipo` (`interno` | `externo`), `telefono`, `vehiculo`, `placa`, `activo`.
  - Tabla `public.despachos`: `id`, `solicitud_id FK`, `almacen_origen FK`, `transportista_id FK nullable`, `ruta text`, `estado` (`programado`, `en_ruta`, `entregado`, `fallido`), `fecha_programada date`, `fecha_entrega timestamptz`, `notas`, `created_by`, `created_at`.
  - Tabla `public.despacho_estados` (historial): `id`, `despacho_id FK`, `estado_anterior`, `estado_nuevo`, `ubicacion text`, `observaciones`, `updated_by`, `created_at`.
  - Registro de módulo `'despachos'` + permisos admin + RLS.
- **Servicio** `services/despachos.ts`: listar solicitudes pendientes de despacho (`confirmed`/`shipped`), crear despacho, asignar transportista, avanzar estado (RPC `avanzar_estado_despacho` valida `has_permission('despachos','write')` y registra historial).
- **Página/UI** `app/admin/despachos/`: `DespachosManager` — tabla de despachos del día con filtro por estado, modal de creación (solicitud + almacén + ruta), modal para asignar transportista y avanzar estado.
- **Notificación:** Al marcar `entregado`, se cambia `solicitudes.status` a `completed` (reutilizando el trigger de stock) y se envía correo opcional con `nodemailer` (patrón de `services/invoicing.ts`).

### 1.3 Cálculo de envío por zonas (slug: `envios`)

**Objetivo:** Costos dinámicos de delivery según peso volumétrico y destino.

- **Migración `0031_zonas_envio.sql`:**
  - Tabla `public.zonas_envio`: `id`, `nombre` (ej: "Zona A - Caracas"), `descripcion`, `estados text[]`, `ciudades text[]`, `tarifa_flat_usd numeric(10,2)`, `tarifa_por_kg_usd numeric(10,2)`, `tiempo_estimado text`, `activo`, `created_at`.
  - Tabla `public.envio_rangos_peso`: `id`, `zona_id FK`, `peso_min_kg numeric`, `peso_max_kg numeric`, `tarifa_usd numeric(10,2)` (rangos opcionales para tarifas escalonadas).
  - Registro de módulo `'envios'` + permisos admin + RLS.
- **Calculadora pura** `lib/shipping-calculator.mjs` + `lib/shipping-calculator.d.ts`:
  - `pesoVolumetrico(cm_ancho, cm_alto, cm_largo, factor = 5000)`: peso volumétrico para paquetería (factor estándar aéreo 5000).
  - `calcularTarifaEnvio(pesoTotalKg, zona)`: usa peso mayor entre real y volumétrico; aplica rango si existe, si no `tarifa_flat + pesoTotalKg * tarifa_por_kg`.
  - `calcularPesoPedido(items)`: suma `items[].weight_grams` (peso real de la venta; ya existe `weight_grams` en `solicitud_items` por 0027).
  - Tests: `tests/shipping-calculator.test.mjs`.
- **Servicio** `services/envios.ts`: CRUD de zonas y rangos; cálculo de envío para un pedido dado (zona + ítems) expuesto vía `POST /api/envios/calcular` (público para el checkout).
- **Página/UI** `app/admin/envios/`: `ZonasEnvioManager` — DataTable de zonas + modal para rangos de peso + vista previa de cálculo (selector zona + peso simulado).

---

## 2. Automatización Financiera y de Pagos

### 2.1 Cuentas por cobrar (slug: `cuentas_cobrar`)

**Objetivo:** Abonos a facturas, plazos de pago y límites de crédito aprobados.

- **Migración `0032_cuentas_cobrar.sql`:**
  - Columna en `profiles`: `limite_credito_usd numeric(12,2) default 0`, `dias_plazo_default integer default 0`, `es_credito boolean default false`.
  - Columna en `invoices`: `tiene_credito boolean default false`, `dias_plazo integer default 0`, `fecha_vencimiento date`.
  - Tabla `public.abonos`: `id`, `invoice_id FK`, `monto_usd numeric(12,2)`, `metodo text` (`transferencia`, `movil`, `efectivo`, `tarjeta`, `paypal`, `zelle`), `referencia text`, `fecha timestamptz default now()`, `registrado_por uuid FK`, `notas`, `created_at`.
  - Tabla `public.cuentas_por_cobrar` (saldo por factura): `id`, `invoice_id FK unique`, `total_usd`, `abonado_usd numeric(12,2) default 0`, `saldo_usd numeric(12,2)`, `estado` (`pendiente`, `parcial`, `pagada`, `vencida`, `cancelada`), `updated_at`.
  - Registro de módulo `'cuentas_cobrar'` + permisos admin + RLS.
- **Lógica pura** en `lib/credit-calculator.mjs` + `.d.ts`:
  - `calcularSaldo(total, abonado)`: saldo y estado automático.
  - `calcularDiasVencido(fechaVencimiento)`: determina `vencida`.
  - `validarLimiteCredito(cliente, montoFactura)`: comprueba límite y saldo usado.
  - Tests: `tests/credit-calculator.test.mjs`.
- **RPC** `registrar_abono(p_invoice_id, p_monto, p_metodo, p_referencia, p_notas)`: valida `has_permission('cuentas_cobrar','write')`, inserta abono en transacción y actualiza `cuentas_por_cobrar` (abonado, saldo, estado).
- **Servicio** `services/cuentas-cobrar.ts`: listar facturas con saldo, registrar abonos, ver detalle por cliente.
- **Página/UI** `app/admin/cuentas-cobrar/`: `CuentasCobrarManager` — tabla de cuentas con estado/vencimiento, modal de abono, detalle de abonos por factura, indicador de límite de crédito por cliente.

### 2.2 Conciliación bancaria express (slug: `conciliacion`)

**Objetivo:** Validar pagos móviles y transferencias vía lectura de notificaciones/APIs bancarias.

- **Migración `0033_conciliacion.sql`:**
  - Tabla `public.banco_configuraciones`: `id`, `nombre_banco`, `tipo_integracion` (`manual`, `api`), `api_endpoint text`, `api_key text`, `api_token text`, `activo`, `ultima_sincronizacion timestamptz`, `created_at`.
  - Tabla `public.movimientos_bancarios`: `id`, `banco_id FK`, `referencia text`, `fecha_movimiento timestamptz`, `monto_usd numeric(12,2)`, `emisor text`, `beneficiario text`, `detalle text`, `estado` (`nuevo`, `conciliado`, `descartado`, `duplicado`), `abono_id FK nullable`, `raw_json jsonb`, `created_at`, `unique (banco_id, referencia)`.
  - Registro de módulo `'conciliacion'` + permisos admin + RLS.
- **Servicio** `services/conciliacion.ts`:
  - Crear movimientos manuales (carga Excel con la librería `xlsx` ya instalada o entrada manual).
  - `POST /api/admin/conciliacion/sincronizar`: llama al endpoint bancario si está configurado (con `fetch`, timeout y manejo de error visible).
  - **Conciliación automática**: RPC `conciliar_movimientos()` que cruza `movimientos_bancarios.referencia` con `abonos.referencia` y marca como conciliados; los que coinciden se pueden enlazar a su abono.
  - Listar movimientos por estado con filtros de fecha.
- **Página/UI** `app/admin/conciliacion/`: `ConciliacionManager` — DataTable de movimientos (filtro por estado/banco), botón "Sincronizar banco", modal de carga manual (uno o por Excel), acción "Conciliar" y "Descartar" por fila o en lote.

### 2.3 Pasarelas de pago internacionales (slug: `pasarelas`)

**Objetivo:** Botones de pago directo para tarjetas, PayPal y billeteras digitales.

- **Migración `0034_pasarelas.sql`:**
  - Tabla `public.pasarelas_configuracion`: `id`, `nombre` (`paypal`, `stripe`, `zelle`, `binance`, `cripto`), `activo`, `llave_publica text`, `llave_secreta_enc text` (cifrada con `pgcrypto`), `modo` (`sandbox` | `produccion`), `monedas text[] default '{USD}'`, `comision_porcentual numeric(5,2) default 0`, `config jsonb`, `updated_at`.
  - Tabla `public.pagos`: `id`, `solicitud_id FK`, `invoice_id FK nullable`, `user_id FK`, `pasarela_id FK nullable`, `referencia_pasarela text`, `monto_usd numeric(12,2)`, `moneda text default 'USD'`, `estado` (`pendiente`, `aprobado`, `rechazado`, `reembolsado`, `expirado`), `payload jsonb`, `created_at`, `updated_at`.
  - Registro de módulo `'pasarelas'` + permisos admin + RLS.
- **Servicio** `services/pasarelas.ts`:
  - CRUD de configuración de pasarelas (las llaves secretas se cifran/descifran con `pgcrypto` vía RPC; nunca se exponen al cliente).
  - `POST /api/pagos/crear` (cliente): crea un `pagos` con estado `pendiente` y devuelve la referencia del botón (para PayPal/Stripe usar los SDKs oficiales con las llaves públicas del servidor).
  - `POST /api/pagos/webhook`: endpoint público que valida firma del proveedor, actualiza estado y —si `aprobado`— marca la solicitud `confirmed` y genera la cuenta por cobrar si aplica.
  - RPC `confirmar_pago` con `has_permission('pasarelas','write')` para conciliación manual.
- **Página/UI** `app/admin/pasarelas/`: `PasarelasManager` — tabla de pasarelas con switches de activación, modal de configuración (nombre, modo, llaves, comisión), listado de pagos recibidos con estado y referencia.
- **Integración checkout:** En el carrito (`hooks/use-cart.ts` + `cart-drawer.tsx`), mostrar el botón de la pasarela activa configurada (módulo `pasarelas` visible en menú para admin; el botón público aparece si hay pasarela activa con `can_read` para el rol cliente o configuración pública).

---

## 3. Contabilidad y Cumplimiento Legal

### 3.1 Libros fiscales automatizados (slug: `libros_fiscales`)

**Objetivo:** Exportar libros de compra y venta en PDF/Excel listos para declarar.

- **Migración `0035_libros_fiscales.sql`:**
  - Tabla `public.libros_fiscales_exportaciones`: `id`, `tipo` (`compra` | `venta`), `periodo_inicio date`, `periodo_fin date`, `formato` (`pdf` | `excel`), `archivo_url text`, `generado_por uuid FK`, `filtros jsonb`, `created_at`.
  - Registro de módulo `'libros_fiscales'` + permisos admin + RLS (solo admin/`has_permission`).
- **Servicio** `services/libros-fiscales.ts`:
  - `getLibroVentas(periodo)`: consulta `invoices` emitidas en el período (no anuladas) — ya tienen el desglose SENIAT (base, IVA, exento, total).
  - `getLibroCompras(periodo)`: consulta facturas de proveedores (nueva tabla `facturas_proveedor` en esta migración: `id`, `proveedor_id FK`, `numero_factura`, `emisor_rif`, `base_imponible`, `iva_amount`, `total`, `fecha_emision`, `xml_path`).
  - Exportación **Excel** con la librería `xlsx` ya instalada (hoja con columnas SENIAT estándar: N° factura, RIF, nombre, base, IVA, total, exento).
  - Exportación **PDF** reutilizando el patrón de `components/invoice-print-view.tsx` (vista imprimible + `window.print()`).
- **Página/UI** `app/admin/libros-fiscales/`: `LibrosFiscalesManager` — selector de tipo de libro y periodo, tabla de resumen por período, botones "Exportar Excel" y "Exportar PDF", historial de exportaciones.
- **Lógica pura** `lib/fiscal-books.mjs` + `.d.ts`: `resumirLibroVentas(invoices)`, `resumirLibroCompras(facturas)`, `filtrarPorPeriodo(registros, inicio, fin)` — tests en `tests/fiscal-books.test.mjs`.

### 3.2 Adaptación a normativas SENIAT — XML directo (slug: `facturacion_xml`)

**Objetivo:** Emisión de facturas electrónicas con formato XML listo para las providencias de la Gaceta Oficial.

- **Migración `0036_facturacion_xml.sql`:**
  - Columna en `invoices`: `xml_generado text`, `xml_version text default '1.0'`, `uuid_xml uuid default gen_random_uuid()`.
  - Tabla `public.envio_facturas_seniat`: `id`, `invoice_id FK`, `estado` (`generado`, `firmado`, `enviado`, `rechazado`, `anulado`), `payload_xml text`, `respuesta_seniat jsonb`, `intentos integer default 0`, `created_at`, `updated_at`.
  - Registro de módulo `'facturacion_xml'` + permisos admin + RLS.
- **Generador puro** `lib/factura-xml.mjs` + `.d.ts`:
  - `generarXMLFactura(invoice, emisor)`: construye el XML de la factura electrónica (encabezado, datos del emisor/receptor, desglose de ítems, IVA, montos, número de control, UUID) siguiendo el esquema de la Providencia del SENIAT vigente.
  - `validarXMLFactura(xml)`: validación básica de estructura (tags obligatorios).
  - Tests: `tests/factura-xml.test.mjs` (verifica que el XML contiene los campos obligatorios y los totales correctos).
- **RPC** `generar_xml_factura(p_invoice_id)`: valida `has_permission('facturacion_xml','write')`, usa la calculadora pura (vía server), guarda el XML en `invoices.xml_generado` y crea `envio_facturas_seniat`.
- **Servicio** `services/facturacion-xml.ts`: generar XML de una factura emitida, descargar XML, reenviar a SENIAT (endpoint configurable en `invoice_settings`, con `fetch` y timeout), registrar respuesta.
- **Página/UI** `app/admin/facturacion-xml/`: `FacturacionXmlManager` — tabla de facturas emitidas con botón "Generar XML" (vista previa en modal con `<pre>`), "Descargar XML" y estado de envío; historial de envíos por factura.
- **Integración:** Al emitir una factura (`issueInvoice` en `services/invoicing.ts`), opción "Emitir y generar XML" que llama al RPC automáticamente.

### 3.3 Reportes de margen neto (slug: `reporte_margen`)

**Objetivo:** Ganancia real del negocio (precio de venta − costo inicial − impuestos/costos de envío).

- **Migración `0037_reporte_margen.sql`:**
  - Registro de módulo `'reporte_margen'` + permisos admin + RLS (solo lectura/venta; la escritura queda en `ajustes_precios`).
  - (Opcional) Tabla `public.reportes_margen` para guardar snapshots de reportes generados: `id`, `periodo_inicio`, `periodo_fin`, `resumen jsonb`, `created_by`, `created_at`.
- **Calculadora pura** `lib/margin-net-calculator.mjs` + `.d.ts`:
  - `calcularMargenNetoPorProducto(ventasPorProducto, costoInicial, tasaIva, otrosCostos = 0)`: ingreso real = (precio_venta × qty) ÷ (1 + IVA) cuando el precio incluye IVA; margen neto = ingreso − (costo_inicial × qty) − otrosCostos (envío, comisiones).
  - `resumirMargenTotal(renglones)`: total ingresos, total costos, total ganancia, % de margen global.
  - `margenPorcentaje(ganancia, ingreso)`: porcentaje seguro (evita división por 0).
  - Tests: `tests/margin-net-calculator.test.mjs`.
- **Servicio** `services/margen-neto.ts`:
  - `getReporteMargen(periodo, incluirEnvio, incluirComisiones)`: cruza `solicitud_items` completadas (ítems con unit_price y quantity) + `products.costo_inicial` + `envios/despachos` (costo de envío) + `pagos` (comisión de pasarela, si existe).
  - Exportación Excel/PDF (reutiliza patrón de `libros-fiscales`).
- **Página/UI** `app/admin/reporte-margen/`: `ReporteMargenManager` — selector de periodo, tabla de margen por producto (ingreso, costo, ganancia, %), resumen global con tarjetas (ingresos, costos, ganancia neta, % margen), botones de exportación.
- **Dashboard:** En `app/admin/page.tsx` se puede agregar una tarjeta "Margen neto del período" que consume `getReporteMargen()` (opcional en fase final).

---

## 4. Orden de ejecución recomendado

| # | Fase | Dependencias | Estimado |
|---|---|---|---|
| 1 | **0. Base y estándares** (plantilla migración + menú + constantes) | — | 0.5 día |
| 2 | **1.1 Multi-almacén** (`almacenes`) | Integraciones con stock/solicitudes | 1.5 días |
| 3 | **1.3 Zonas de envío** (`envios`) | `weight_grams` (ya existe) | 1 día |
| 4 | **1.2 Despacho y rutas** (`despachos`) | Depende de `almacenes` | 1.5 días |
| 5 | **2.1 Cuentas por cobrar** (`cuentas_cobrar`) | Depende de `facturacion` (ya existe) | 1.5 días |
| 6 | **2.3 Pasarelas de pago** (`pasarelas`) | Depende de `pagos` + checkout | 2 días |
| 7 | **2.2 Conciliación bancaria** (`conciliacion`) | Depende de `cuentas_cobrar` (abonos) | 1.5 días |
| 8 | **3.3 Reporte de margen neto** (`reporte_margen`) | `costo_inicial` (ya existe) + ventas | 1 día |
| 9 | **3.1 Libros fiscales** (`libros_fiscales`) | Depende de `invoices` + `xlsx` | 1 día |
| 10 | **3.2 Facturación XML SENIAT** (`facturacion_xml`) | Depende de `facturacion` + `factura-xml` | 1.5 días |
| 11 | **Cierre**: `MANUAL_USUARIO.html` + `SUPABASE_QUERIES.md` + verificación `npm run supabase:verify` + tests completos | Todo | 0.5 día |

**Dependencia clave:** hacer siempre la migración + permisos + servicio antes que la UI (regla de oro del sistema: los componentes nunca llaman a `supabase.from()`; todo pasa por `/services`).

---

## 5. Resumen de módulos nuevos con sus permisos

| Módulo | Slug | Menú | Permisos sugeridos |
|---|---|---|---|
| Almacenes | `almacenes` | Logística | read (ver stock), write (crear/editar/transferir), delete |
| Despacho y Rutas | `despachos` | Logística | read (ver entregas), write (asignar/avanzar estado) |
| Zonas de Envío | `envios` | Logística | read (ver tarifas), write (editar tarifas) |
| Cuentas por Cobrar | `cuentas_cobrar` | Finanzas | read (ver saldos), write (registrar abonos) |
| Conciliación Bancaria | `conciliacion` | Finanzas | read (ver movimientos), write (conciliar/descartar) |
| Pasarelas de Pago | `pasarelas` | Finanzas | read (ver config), write (editar config/confirmar) |
| Libros Fiscales | `libros_fiscales` | Contabilidad | read (exportar) — solo admin por defecto |
| Facturación XML | `facturacion_xml` | Contabilidad | read (ver XML), write (generar/enviar) |
| Reporte de Margen | `reporte_margen` | Contabilidad | read (ver reporte) — solo admin por defecto |

> Todos los roles personalizados (Vendedor, Despachador, Contador, etc.) se configuran desde **Usuarios → Roles y permisos**, que ya lista dinámicamente los módulos registrados en `public.modules`. Por eso cada migración debe registrar su módulo — es lo que alimenta la matriz de permisos del `RoleManager`.

---

## 6. Documentación en el Manual de Usuario (fase final obligatoria)

Cada módulo nuevo **debe** documentarse en el manual antes de darlo por terminado. El manual actual (`manual/index.html`) tiene 24 secciones en su TOC (termina en Soporte); los módulos nuevos se agregan como **secciones 25 en adelante**, agrupadas en un bloque "Módulos nuevos".

### 6.1 Nuevas secciones a agregar en `manual/index.html` (TOC)

| # | Sección | ID ancla | Contenido principal |
|---|---|---|---|
| 25 | Almacenes (multi-almacén) | `#modulo-almacenes` | Qué es, cómo crear un almacén, asignar stock por producto, transferir entre almacenes |
| 26 | Despacho y rutas | `#modulo-despachos` | Cómo crear un despacho, asignar transportista, avanzar estados (programado → en_ruta → entregado) |
| 27 | Zonas de envío | `#modulo-envios` | Configurar zonas, tarifas planas, tarifas por kg, rangos de peso |
| 28 | Cuentas por cobrar | `#modulo-cuentas-cobrar` | Ver saldos, registrar abonos, plazos de pago, límites de crédito |
| 29 | Conciliación bancaria | `#modulo-conciliacion` | Sincronizar banco, cargar movimientos manuales/Excel, conciliar por referencia |
| 30 | Pasarelas de pago | `#modulo-pasarelas` | Activar PayPal/Stripe/Zelle, configurar llaves, ver pagos recibidos |
| 31 | Libros fiscales | `#modulo-libros-fiscales` | Exportar libro de ventas/compras en Excel y PDF con columnas SENIAT |
| 32 | Facturación XML SENIAT | `#modulo-facturacion-xml` | Generar XML de una factura, descargarlo, reenviar al SENIAT |
| 33 | Reporte de margen neto | `#modulo-reporte-margen` | Ver ganancia real por producto y del período, exportar reporte |
| 34 | Roles sugeridos para módulos nuevos | `#roles-nuevos-modulos` | Ejemplos: Vendedor (envíos/despachos), Despachador (almacenes/despachos), Contador (libros/margen/cuentas) |
| 35 | Ficha técnica del cálculo de envío | `#ficha-envio` | Peso volumétrico, tarifas por zona, ejemplo numérico paso a paso |
| 36 | Flujo completo: venta con envío y pago | `#flujo-venta-logistica` | Del carrito → solicitud → despacho → pasarela → factura → XML → margen |

### 6.2 Formato de cada sección del manual

Cada sección nueva debe seguir el mismo patrón de las secciones existentes:

1. **Cabecera** con `SectionCard` (fondo blanco, `rounded-3xl`, `border`).
2. **Eyebrow** `font-mono text-xs uppercase tracking-[.25em] text-cyan-600` + **título** `text-2xl sm:text-3xl font-black tracking-tight`.
3. **"¿Qué hace?"** — descripción breve en párrafo.
4. **"Cómo usar"** — pasos numerados con `<div class="step-chip">1</div>` (patrón existente del manual).
5. **Mockup de la página** — reutilizar las clases `.mockup`, `.mock-topbar`, `.mock-sidebar`, `.mock-link`, `.mock-body` del manual (las vistas ya existen en el CSS del archivo).
6. **Ejemplo de salida** — tabla `table-flow` con datos reales del módulo (ej: un abono, un movimiento conciliado, una zona de envío, un renglón del margen).
7. **Notas / permisos** — qué rol necesita cada acción (usando `can_read` / `can_write`).

### 6.3 Páginas de ejemplo HTML (nuevas en `manual/`)

Replicar el patrón de las existentes (`ejemplo-factura.html`, `ejemplo-cotizacion.html`, `ejemplo-solicitud.html` — archivos imprimibles A4 estilo documento):

| Archivo nuevo | Contenido del ejemplo |
|---|---|
| `manual/ejemplo-despacho.html` | Formato imprimible de guía de despacho: almacén origen, ruta, transportista, ítems del pedido, estado |
| `manual/ejemplo-libro-ventas.xlsx` → se genera con la app | No es un archivo estático; el manual muestra **captura de la exportación** real (en la sección 31) |
| `manual/ejemplo-factura-xml.html` | Vista `<pre>` del XML generado (encabezado, emisor, receptor, ítems, IVA, totales, UUID) |
| `manual/ejemplo-reporte-margen.html` | Tabla imprimible: producto, ingresos, costo, envío, comisión, ganancia neta, % margen |

> Los ejemplos 3 y 4 pueden ser capturas de la vista real de la app (botón imprimir del navegador) o HTML estático autocontenido como los actuales.

### 6.4 Actualización de `MANUAL_USUARIO.html` (raíz)

`MANUAL_USUARIO.html` en la raíz del proyecto es el manual para usuarios finales. Debe actualizarse con:

- **Índice de los módulos nuevos** en su navegación.
- **Secciones de los 9 módulos** (misma información que `manual/index.html`, versión resumida orientada al usuario final).
- **Ejemplos y vistas** igual que el manual completo (mockups de las páginas del panel).
- **Nota de permisos**: qué rol necesita acceso (ej: "Despachador" para operar despachos, "Contador" para exportar libros fiscales).

### 6.5 Checklist de documentación por módulo

Antes de cerrar cada módulo, verificar:

- [ ] Sección agregada al TOC de `manual/index.html` (`#modulo-<slug>`).
- [ ] Sección completa en `manual/index.html` con mockup de la página.
- [ ] Ejemplo numérico real en tabla `table-flow`.
- [ ] Página de ejemplo imprimible en `manual/` (si aplica).
- [ ] Sección resumida en `MANUAL_USUARIO.html` (raíz).
- [ ] Permisos documentados (qué rol puede ver/editar cada acción del módulo).
- [ ] Menú del `admin-shell.tsx` actualizado (grupo Logística / Finanzas / Contabilidad).

### 6.6 Capturas de vistas reales (recomendación)

Para el manual se recomienda adjuntar capturas reales de las páginas del panel (solo cuando el módulo ya esté implementado):

- `docs/capturas/almacenes.png`
- `docs/capturas/despachos.png`
- `docs/capturas/envios.png`
- `docs/capturas/cuentas-cobrar.png`
- `docs/capturas/conciliacion.png`
- `docs/capturas/pasarelas.png`
- `docs/capturas/libros-fiscales.png`
- `docs/capturas/facturacion-xml.png`
- `docs/capturas/reporte-margen.png`

Estas capturas se insertan en las secciones correspondientes con `<img src="../docs/capturas/<archivo>.png" class="mockup" alt="Vista de ...">`.

---

## 7. Entregables finales del proyecto completo

| Entregable | Ruta |
|---|---|
| Migraciones (9 módulos nuevos) | `supabase/migrations/0029_almacenes.sql` … `0037_reporte_margen.sql` |
| Servicios (capa única Supabase) | `services/almacenes.ts`, `services/despachos.ts`, `services/envios.ts`, `services/cuentas-cobrar.ts`, `services/conciliacion.ts`, `services/pasarelas.ts`, `services/libros-fiscales.ts`, `services/facturacion-xml.ts`, `services/margen-neto.ts` |
| API routes admin | `app/api/admin/<modulo>/route.ts` (9 rutas) |
| Páginas admin | `app/admin/<modulo>/page.tsx` (9 páginas) |
| Componentes Manager | `components/<modulo>-manager.tsx` (9 componentes) |
| Calculadoras puras | `lib/shipping-calculator.mjs`, `lib/credit-calculator.mjs`, `lib/factura-xml.mjs`, `lib/fiscal-books.mjs`, `lib/margin-net-calculator.mjs` + sus `.d.ts` |
| Tests | `tests/shipping-calculator.test.mjs`, `tests/credit-calculator.test.mjs`, `tests/factura-xml.test.mjs`, `tests/fiscal-books.test.mjs`, `tests/margin-net-calculator.test.mjs` |
| Menú admin | `components/admin-shell.tsx` (grupos Logística, Finanzas, Contabilidad) |
| Constantes | `lib/constants.ts` (slugs de los 9 módulos) |
| Manual de usuario | `manual/index.html` (secciones 25–36 + TOC) |
| Manual raíz | `MANUAL_USUARIO.html` (resumen de módulos nuevos + permisos) |
| Páginas de ejemplo | `manual/ejemplo-despacho.html`, `manual/ejemplo-factura-xml.html`, `manual/ejemplo-reporte-margen.html` |
| Capturas (opcional) | `docs/capturas/*.png` |
| Documento del plan | `docs/PLAN_MODULOS.md` |
