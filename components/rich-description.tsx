'use client'

/**
 * RichDescription
 * ------------------------------------------------------------------
 * Renderiza la descripción HTML semántica que genera el pipeline SEO
 * (DeepSeek) con estilos tipográficos premium, en lugar de mostrarla
 * como texto plano con las etiquetas visibles.
 *
 * SEGURIDAD (por qué este componente existe):
 *  - React escapa el HTML por defecto (cero XSS), pero eso hace que las
 *    etiquetas <h2>, <p>, <ul>… se vean como texto crudo.
 *  - Para renderizarlas usamos dangerouslySetInnerHTML, así que SANITIZAMOS
 *    el HTML con una lista blanca estricta de etiquetas y atributos seguros.
 *    Se eliminan <script>, <iframe>, <style>, atributos on*, y URLs
 *    javascript:/data: para impedir cualquier inyección.
 *
 * El contenido se envuelve en .rich-description, cuyos estilos tipográficos
 * viven en app/globals.css (h2, h3, p, ul, ol, li, strong, a, table…).
 */
const ETIQUETAS_PERMITIDAS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'small', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li',
  'a', 'blockquote', 'code', 'pre',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'span', 'div', 'hr', 'img',
])

/** Atributos permitidos por etiqueta (lista blanca). */
const ATRIBUTOS_PERMITIDOS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  ol: new Set(['start', 'type']),
  li: new Set(['value']),
}

/** URLs de protocolo permitidas en href/src. */
const PROTOCOLOS_SEGUROS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/**
 * Sanitiza una cadena de HTML eliminando etiquetas y atributos peligrosos.
 * Implementación ligera basada en DOMParser (solo cliente) que recorre el
 * árbol y reconstruye solo los nodos seguros.
 */
function sanitizarHtml(html: string): string {
  if (typeof document === 'undefined') return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // Recorre el árbol y elimina nodos no permitidos o con atributos peligrosos.
  const limpiarNodo = (nodo: Node): void => {
    const hijos = Array.from(nodo.childNodes)
    for (const hijo of hijos) {
      if (hijo.nodeType === Node.ELEMENT_NODE) {
        const el = hijo as Element
        const etiqueta = el.tagName.toLowerCase()

        // Elimina etiquetas peligrosas o no permitidas.
        if (!ETIQUETAS_PERMITIDAS.has(etiqueta)) {
          // Reemplaza el nodo por su contenido de texto (sin perder el texto útil).
          el.replaceWith(document.createTextNode(el.textContent ?? ''))
          continue
        }

        // Limpia atributos: solo conserva los de la lista blanca y seguros.
        const permitidos = ATRIBUTOS_PERMITIDOS[etiqueta] ?? new Set<string>()
        for (const attr of Array.from(el.attributes)) {
          const nombre = attr.name.toLowerCase()
          const valor = attr.value.trim()

          // Elimina manejadores de eventos y atributos peligrosos.
          if (nombre.startsWith('on') || nombre === 'style' || nombre === 'srcdoc') {
            el.removeAttribute(attr.name)
            continue
          }

          // Solo conserva atributos de la lista blanca de la etiqueta.
          if (!permitidos.has(nombre)) {
            el.removeAttribute(attr.name)
            continue
          }

          // Valida protocolos en href/src (bloquea javascript:, data:, vbscript:).
          if ((nombre === 'href' || nombre === 'src') && valor) {
            const protocolo = valor.split(':')[0]?.toLowerCase() + ':'
            if (!PROTOCOLOS_SEGUROS.has(protocolo)) {
              el.removeAttribute(attr.name)
              continue
            }
          }

          // En enlaces externos fuerza target=_blank + rel=noopener.
          if (etiqueta === 'a' && nombre === 'target') {
            el.setAttribute('rel', 'noopener noreferrer')
          }
        }

        // Recursión en los hijos del nodo permitido.
        limpiarNodo(hijo)
      } else if (hijo.nodeType === Node.COMMENT_NODE) {
        // Elimina comentarios HTML.
        hijo.parentNode?.removeChild(hijo)
      }
    }
  }

  limpiarNodo(doc.body)
  return doc.body.innerHTML
}

export function RichDescription({ html, className = '' }: { html: string; className?: string }) {
  const seguro = sanitizarHtml(html)
  if (!seguro) return null
  return (
    <div
      className={`rich-description text-sm leading-7 text-muted-foreground md:text-base ${className}`}
      // El HTML ya fue sanitizado con lista blanca estricta (ver sanitizarHtml).
      dangerouslySetInnerHTML={{ __html: seguro }}
    />
  )
}

/**
 * Convierte HTML a texto plano legible (sin etiquetas).
 * Se usa en vistas compactas (cards del catálogo) donde no conviene
 * renderizar el HTML completo, solo un resumen limpio de 2 líneas.
 * Convierte saltos de bloque (</p>, </li>, </h2>…) en espacios para
 * que el texto truncado no quede pegado.
 */
export function plainTextFromHtml(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Añade un espacio tras cada cierre de bloque para separar párrafos/listas.
  doc.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, div, br, tr').forEach((el) => {
    el.append(' ')
  })
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}
