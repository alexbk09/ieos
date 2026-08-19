'use client'

import { useMemo, useState } from 'react'
import { LOCAL_IMAGES_PREFIX } from '@/lib/constants'
import { ArrowUpRight, Globe2, Search, Sparkles, Star } from 'lucide-react'
import { ProductCard, type CardProduct } from '@/components/product-card'
import { ProductDetailModal } from '@/components/product-detail-modal'
import { SiteHeader } from '@/components/site-header'
import { CartDrawer } from '@/components/cart-drawer'
import { useCart } from '@/hooks/use-cart'
import { useDarkMode } from '@/hooks/use-dark-mode'

// ---------- Tipos ----------
type Product = { id: string; name: string; slug: string; description: string | null; price_usd: number; stock: number; image_url: string; colors?: string[]; specifications?: Record<string, string>; category_id?: string | null; featured?: boolean; categories?: { id: string; name: string; slug: string; description: string | null }[]; images?: { id: string; url: string; alt_text: string | null; sort_order: number }[] }

// ---------- Catálogo fallback (solo si no hay datos) ----------
const fallbackProducts: Product[] = [
  { id: '1', name: 'Panel LED Orbis 24W', slug: 'panel-led-orbis-24w', description: 'Iluminación uniforme para espacios contemporáneos.', price_usd: 28, stock: 42, image_url: `${LOCAL_IMAGES_PREFIX}panel-led.png`, colors: ['Blanco', 'Negro'], specifications: { voltage: '110-240V', watts: '24W', weight: '0.8 kg' }, featured: true },
  { id: '2', name: 'Línea Aura 12W', slug: 'linea-aura-12w', description: 'Luz lineal para crear atmósferas limpias.', price_usd: 36, stock: 18, image_url: `${LOCAL_IMAGES_PREFIX}linea-aura.png`, colors: ['Blanco cálido', 'Blanco neutro'], specifications: { voltage: '12V', watts: '12W', weight: '0.4 kg' }, featured: true },
  { id: '3', name: 'Wall Tile Nova', slug: 'wall-tile-nova', description: 'Revestimiento modular con presencia escultórica.', price_usd: 22.5, stock: 27, image_url: `${LOCAL_IMAGES_PREFIX}wall-tile.png`, colors: ['Arena', 'Grafito'], specifications: { dimensions: '50 x 50 cm', weight: '1.2 kg' }, featured: true },
]

const categories = ['Todos', 'Iluminación LED', 'Revestimiento 3D', 'Perfiles y accesorios']

/** Devuelve la categoría visible de un producto (fallback para productos sin categoría). */
const categoryFor = (p: Product) => p.categories?.[0]?.name ?? (p.name.includes('Tile') ? 'Revestimiento 3D' : 'Iluminación LED')

/**
 * Componente principal de la tienda.
 * Muestra los 6 productos destacados, permite armar un carrito y enviar la solicitud por WhatsApp.
 * Usa la tasa oficial del día (dolarapi.com) para mostrar el precio en bolívares.
 */
export function Storefront({ initialProducts, exchangeRate }: { initialProducts?: Product[]; exchangeRate: number }) {
  const products = initialProducts && initialProducts.length > 0 ? initialProducts : fallbackProducts
  const { dark, toggle } = useDarkMode()
  const { cart, add, change, total, count, cartOpen, setCartOpen, submitting, requested, requestOrder } = useCart(exchangeRate)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [selected, setSelected] = useState<Product | null>(null)

  const filtered = useMemo(() => products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) && (category === 'Todos' || categoryFor(p) === category)), [query, category, products])

  // Enlaces del menú de navegación (misma estructura que el catálogo completo).
  const navLinks = [
    { href: '#catalogo', label: 'Catálogo' },
    { href: '#studio', label: 'Studio' },
    { href: '#contacto', label: 'Contacto' },
    { href: '/catalogo', label: 'Ver catálogo completo', highlight: true },
  ]

  return <div className={dark ? 'dark min-h-screen bg-slate-950 text-slate-50' : 'min-h-screen bg-slate-50 text-slate-950'}>
    <SiteHeader dark={dark} onToggleDark={toggle} cartCount={count} onOpenCart={() => setCartOpen(true)} navLinks={navLinks} />
    <main>
      <section id="inicio" className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-24">
        <div>
          <p className="mb-6 flex items-center gap-2 font-mono text-xs uppercase tracking-[.28em] text-cyan-600"><Sparkles size={14} /> Arquitectura de luz</p>
          <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[.98] tracking-[-.07em] sm:text-7xl">Luz que define <span className="text-cyan-500">espacios.</span></h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-slate-500 dark:text-slate-300">Soluciones LED y revestimientos que convierten ambientes cotidianos en experiencias memorables. Diseñamos la atmósfera, tú habitas el resultado.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href="#catalogo" className="inline-flex items-center gap-2 rounded-full bg-blue-950 px-6 py-3 text-sm font-medium text-white transition hover:bg-cyan-500 hover:text-blue-950">Explorar catálogo <ArrowUpRight size={16} /></a>
            <a href="/catalogo" className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-6 py-3 text-sm font-medium dark:border-slate-700">Ver todo <ArrowUpRight size={16} /></a>
          </div>
          <div className="mt-14 flex gap-10 border-t border-slate-200 pt-5 dark:border-slate-800">
            <div><p className="text-2xl font-semibold">+12</p><p className="text-xs text-slate-500">años de experiencia</p></div>
            <div><p className="text-2xl font-semibold">24/7</p><p className="text-xs text-slate-500">asesoría técnica</p></div>
            <div><p className="text-2xl font-semibold">100%</p><p className="text-xs text-slate-500">diseño venezolano</p></div>
          </div>
        </div>
        <div className="relative overflow-hidden rounded-[2rem] bg-blue-950 p-5 text-white">
          <div className="absolute right-8 top-8 rounded-full border border-cyan-300/30 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-cyan-300">Colección 2025</div>
          <img src={`${LOCAL_IMAGES_PREFIX}linea-aura.png`} alt="Línea Aura 12W" className="aspect-square w-full rounded-[1.5rem] object-cover opacity-90" />
          <div className="absolute bottom-10 left-10"><p className="font-mono text-xs uppercase tracking-widest text-cyan-300">01 / 03</p><p className="mt-2 text-xl font-medium">La luz como material</p></div>
        </div>
      </section>

      <section id="catalogo" className="mx-auto max-w-7xl px-5 py-16 lg:px-8">
        <div className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 md:flex-row md:items-end dark:border-slate-800">
          <div><p className="font-mono text-xs uppercase tracking-[.25em] text-cyan-600">Selección ilumaX</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.05em]">Encuentra tu próxima atmósfera</h2></div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900"><Search size={16} className="text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto" className="w-44 bg-transparent text-sm outline-none placeholder:text-slate-400" /></label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900">{categories.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product as CardProduct} rate={exchangeRate} onAdd={add} onViewDetails={setSelected} />
          ))}
        </div>
        <div className="mt-10 text-center">
          <a href="/catalogo" className="inline-flex items-center gap-2 rounded-full bg-blue-950 px-6 py-3 text-sm font-medium text-white hover:bg-cyan-500 hover:text-blue-950">Ver catálogo completo <ArrowUpRight size={16} /></a>
        </div>
      </section>

      <section id="studio" className="bg-blue-950 px-5 py-20 text-white lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
          <div><p className="font-mono text-xs uppercase tracking-[.25em] text-cyan-300">El studio</p><h2 className="mt-4 text-4xl font-semibold tracking-[-.06em]">Diseñamos lo que otros solo iluminan.</h2></div>
          <div className="grid gap-8 sm:grid-cols-3">
            <div><p className="text-3xl font-semibold text-cyan-300">01</p><p className="mt-3 text-sm leading-6 text-slate-300">Curaduría de piezas con intención y larga vida útil.</p></div>
            <div><p className="text-3xl font-semibold text-cyan-300">02</p><p className="mt-3 text-sm leading-6 text-slate-300">Asesoría para traducir ideas en instalaciones reales.</p></div>
            <div><p className="text-3xl font-semibold text-cyan-300">03</p><p className="mt-3 text-sm leading-6 text-slate-300">Materiales que hacen que cada proyecto tenga identidad.</p></div>
          </div>
        </div>
      </section>

      <section id="contacto" className="mx-auto grid max-w-7xl gap-12 px-5 py-20 lg:grid-cols-2 lg:px-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-[.25em] text-cyan-600">Hablemos</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-.06em]">Tu espacio tiene algo que decir.</h2>
          <p className="mt-5 max-w-md leading-7 text-slate-500 dark:text-slate-300">Cuéntanos sobre tu próximo proyecto. Nuestro equipo puede ayudarte a elegir la solución correcta.</p>
          <div className="mt-8 flex gap-3">
            <a href="https://instagram.com" aria-label="Instagram" className="grid size-10 place-items-center rounded-full border border-slate-200 dark:border-slate-700"><Star size={17} /></a>
            <a href="https://linkedin.com" aria-label="LinkedIn" className="grid size-10 place-items-center rounded-full border border-slate-200 dark:border-slate-700"><Star size={17} /></a>
            <a href="mailto:hola@ilumax.ve" aria-label="Enviar correo" className="grid size-10 place-items-center rounded-full border border-slate-200 dark:border-slate-700"><Globe2 size={17} /></a>
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); }} className="grid gap-3">
          <input required placeholder="Tu nombre" className="rounded-2xl border border-slate-200 bg-transparent px-5 py-4 text-sm outline-none focus:border-cyan-500 dark:border-slate-700" />
          <input required type="email" placeholder="Correo electrónico" className="rounded-2xl border border-slate-200 bg-transparent px-5 py-4 text-sm outline-none focus:border-cyan-500 dark:border-slate-700" />
          <textarea required placeholder="Cuéntanos sobre tu proyecto" rows={4} className="rounded-2xl border border-slate-200 bg-transparent px-5 py-4 text-sm outline-none focus:border-cyan-500 dark:border-slate-700" />
          <button className="rounded-2xl bg-cyan-400 px-5 py-4 text-sm font-semibold text-blue-950">Enviar mensaje</button>
        </form>
      </section>
    </main>
    <footer className="border-t border-slate-200 px-5 py-7 dark:border-slate-800"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-3 text-xs text-slate-500 sm:flex-row"><span>© 2025 ilumaX. Caracas, Venezuela.</span><span>Iluminamos ideas.</span></div></footer>

    {selected && (
      <ProductDetailModal product={selected as CardProduct} rate={exchangeRate} onClose={() => setSelected(null)} onAdd={add} />
    )}

    <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} cart={cart} onChange={change} total={total} onSubmit={requestOrder} submitting={submitting} requested={requested} exchangeRate={exchangeRate} />
  </div>
}