/**
 * Helper cliente para consumir streams Server-Sent Events (SSE) del panel admin.
 * ------------------------------------------------------------------
 * POR QUÉ existe: los paneles del pipeline AliExpress (enriquecimiento y
 * verificación de disponibilidad) consumen el MISMO formato de eventos
 * (`event: etapa|fin` + `data: {json}`). Duplicar el parser en cada componente
 * invitaba a que se desincronizaran ante cualquier cambio de protocolo.
 *
 * Genérico y sin dependencias de React: solo lectura del stream y despacho.
 */

/** Handlers de un stream SSE del panel. */
export type SseHandlers<TEtapa, TFin> = {
  /** Evento de progreso ("event: etapa"). */
  onEtapa: (payload: TEtapa) => void
  /** Evento final ("event: fin") con el resultado de la operación. */
  onFin: (payload: TFin) => void
}

/**
 * Lee un stream SSE línea a línea y despacha cada evento tipado.
 * Los eventos malformados se ignoran (nunca rompen la UI por un fragmento).
 *
 * @param respuesta Respuesta del `fetch` (debe traer body).
 * @param handlers Callbacks de etapa y de fin.
 */
export async function consumirSSE<TEtapa, TFin>(
  respuesta: Response,
  handlers: SseHandlers<TEtapa, TFin>,
): Promise<void> {
  if (!respuesta.body) throw new Error('El navegador no soporta streaming de respuesta.')
  const lector = respuesta.body.getReader()
  const decodificador = new TextDecoder()
  let buffer = ''

  const procesar = (bloque: string) => {
    for (const evento of bloque.split('\n\n')) {
      if (!evento.trim()) continue
      let tipo = 'message'
      let datos = ''
      for (const linea of evento.split('\n')) {
        if (linea.startsWith('event:')) tipo = linea.slice(6).trim()
        else if (linea.startsWith('data:')) datos += linea.slice(5).trim()
      }
      if (!datos) continue
      try {
        const payload = JSON.parse(datos)
        if (tipo === 'etapa') handlers.onEtapa(payload as TEtapa)
        else if (tipo === 'fin') handlers.onFin(payload as TFin)
      } catch {
        // Evento malformado: se ignora y el stream continúa.
      }
    }
  }

  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    buffer += decodificador.decode(value, { stream: true })
    const indice = buffer.lastIndexOf('\n\n')
    if (indice >= 0) {
      procesar(buffer.slice(0, indice))
      buffer = buffer.slice(indice + 2)
    }
  }
  if (buffer.trim()) procesar(buffer)
}
