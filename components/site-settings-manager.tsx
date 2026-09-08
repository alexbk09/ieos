'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, ChevronRight, Globe2, Home, LayoutDashboard, Link2, MapPin, MessageCircle, Paintbrush, Palette, Plus, Receipt, Save, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { FormInput, FormSubmitButton, FormTextarea } from '@/components/ui/form-field'
import { confirmDelete } from '@/components/confirm-dialog'
import { cn } from '@/lib/utils'
import { ThemeSettingsManager } from '@/components/theme-settings-manager'
import { DEFAULT_THEME, type ThemeConfig } from '@/lib/theme'
import { HomepageConfigManager } from '@/components/homepage-config-manager'
import { StudioConfigManager } from '@/components/studio-config-manager'
import { PortadaConfigManager } from '@/components/portada-config-manager'
import { DEFAULT_HOMEPAGE_CONFIG, normalizeHomepageConfig, type HomepageConfig } from '@/lib/homepage-config'

// ---------- Tipos (espejo de /services/site-settings) ----------
type NavLink = { href: string; label: string; highlight?: boolean }

type SiteSettingsPayload = {
  company_name: string
  tagline: string
  logo_url: string | null
  icon_url: string | null
  whatsapp_number: string
  address: string
  email: string
  map_lat: number
  map_lng: number
  map_zoom: number
  nav_links: NavLink[]
  hero_texts: Record<string, unknown>
  hero_images: Record<string, unknown>
  studio_texts: Record<string, unknown>
  contact_texts: Record<string, unknown>
  footer_texts: Record<string, unknown>
  social_links: Record<string, unknown>
  theme: ThemeConfig
  homepage_config: HomepageConfig
}

// ---------- Íconos por sección ----------
const SECTIONS = [
  { key: 'marca', label: 'Marca', icon: Building2 },
  { key: 'menu', label: 'Menú', icon: Link2 },
  { key: 'inicio', label: 'Inicio', icon: Home },
  { key: 'portada', label: 'Portada', icon: LayoutDashboard },
  { key: 'studio', label: 'Studio', icon: Palette },
  { key: 'contacto', label: 'Contacto', icon: MessageCircle },
  { key: 'footer', label: 'Footer', icon: LayoutDashboard },
  { key: 'social', label: 'Redes', icon: Globe2 },
  { key: 'apariencia', label: 'Apariencia', icon: Paintbrush },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

/** Sube una imagen al bucket y devuelve su URL pública. */
async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch('/api/admin/upload', { method: 'POST', body: form })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'No se pudo subir la imagen')
  return result.url
}

/**
 * Administrador de configuración del sitio.
 * Permite editar marca (nombre/logo/ícono), menú de navegación, portada,
 * studio, contacto, footer y redes sociales. Toda la persistencia va por
 * /api/admin/site-settings; la UI es independiente de Supabase.
 */
export function SiteSettingsManager({ initialSettings }: { initialSettings: SiteSettingsPayload }) {
  const router = useRouter()
  // Asegura que el tema siempre tenga todos los campos (fallback al tema por defecto).
  const [form, setForm] = useState<SiteSettingsPayload>({
    ...initialSettings,
    theme: { ...DEFAULT_THEME, ...(initialSettings.theme ?? {}) },
    homepage_config: normalizeHomepageConfig(initialSettings.homepage_config ?? {}),
  })
  const [active, setActive] = useState<SectionKey>('marca')
  const [saving, setSaving] = useState(false)
  const [uploadingField, setUploadingField] = useState<string | null>(null)
  const [navLinkInput, setNavLinkInput] = useState({ href: '', label: '' })

  // ---------- Helpers de estado ----------
  /** Actualiza una columna escalar del formulario. */
  function setScalar(key: keyof Pick<SiteSettingsPayload, 'company_name' | 'tagline' | 'logo_url' | 'icon_url' | 'whatsapp_number' | 'address' | 'email'>, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  /** Actualiza un valor numérico del formulario (map_lat, map_lng, map_zoom). */
  function setNumber(key: 'map_lat' | 'map_lng' | 'map_zoom', value: string) {
    const num = Number(value)
    setForm((f) => ({ ...f, [key]: Number.isFinite(num) ? num : 0 }))
  }

  /** Actualiza una subclave de un objeto JSONB (hero_texts, contact_texts, etc.). */
  function setJsonField<K extends keyof SiteSettingsPayload>(key: K, subKey: string, value: unknown) {
    setForm((f) => {
      const current = (f[key] ?? {}) as Record<string, unknown>
      return { ...f, [key]: { ...current, [subKey]: value } } as SiteSettingsPayload
    })
  }

  /** Actualiza un ítem de arreglo JSONB (studio.items, hero_texts.stats). */
  function setJsonArrayItem<K extends keyof SiteSettingsPayload>(key: K, arraySubKey: string, index: number, subField: string, value: string) {
    setForm((f) => {
      const section = (f[key] ?? {}) as Record<string, unknown>
      const arr = Array.isArray(section[arraySubKey]) ? [...(section[arraySubKey] as Record<string, string>[])] : []
      if (!arr[index]) arr[index] = {}
      arr[index] = { ...arr[index], [subField]: value }
      return { ...f, [key]: { ...section, [arraySubKey]: arr } } as SiteSettingsPayload
    })
  }

  /** Agrega un ítem a un arreglo JSONB (studio.items, hero_texts.stats, nav_links). */
  function addJsonArrayItem<K extends keyof SiteSettingsPayload>(key: K, arraySubKey: string, item: Record<string, unknown>) {
    setForm((f) => {
      const section = (f[key] ?? {}) as Record<string, unknown>
      const arr = Array.isArray(section[arraySubKey]) ? [...(section[arraySubKey] as Record<string, unknown>[])] : []
      arr.push(item)
      return { ...f, [key]: { ...section, [arraySubKey]: arr } } as SiteSettingsPayload
    })
  }

  /** Elimina un ítem de un arreglo JSONB con confirmación. */
  async function removeJsonArrayItem<K extends keyof SiteSettingsPayload>(key: K, arraySubKey: string, index: number) {
    const section = (form[key] ?? {}) as Record<string, unknown>
    const arr = Array.isArray(section[arraySubKey]) ? (section[arraySubKey] as Record<string, string>[]) : []
    const item = arr[index]
    const label = item?.label || item?.text || 'este elemento'

    const ok = await confirmDelete({
      title: '¿Eliminar este elemento?',
      description: `"${label}" se quitará de la configuración del sitio.`,
      confirmText: 'Sí, eliminar',
    })
    if (!ok) return

    setForm((f) => {
      const currentSection = (f[key] ?? {}) as Record<string, unknown>
      const currentArr = Array.isArray(currentSection[arraySubKey]) ? [...(currentSection[arraySubKey] as unknown[])] : []
      currentArr.splice(index, 1)
      return { ...f, [key]: { ...currentSection, [arraySubKey]: currentArr } } as SiteSettingsPayload
    })
  }

  // ---------- Acciones ----------
  /** Sube una imagen y la asigna al campo indicado (logo_url, icon_url, hero_images.main). */
  async function handleUpload(field: string, file?: File | null) {
    if (!file) return
    setUploadingField(field)
    toast.promise(uploadImage(file), {
      loading: 'Subiendo imagen…',
      success: (url) => {
        if (field === 'logo_url' || field === 'icon_url') setScalar(field, url)
        else setJsonField('hero_images', field, url)
        return 'Imagen cargada'
      },
      error: (err: Error) => err.message ?? 'No se pudo subir la imagen',
      finally: () => setUploadingField(null),
    })
  }

  /** Guarda todos los cambios en la API. */
  async function save() {
    if (!form.company_name.trim()) {
      toast.error('El nombre de la empresa es obligatorio')
      return
    }
    setSaving(true)
    const response = await fetch('/api/admin/site-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const result = await response.json()
    setSaving(false)
    if (!response.ok) {
      toast.error('No se pudieron guardar los cambios', { description: result.error ?? 'Inténtalo de nuevo.' })
      return
    }
    if (result.settings) setForm(result.settings)
    toast.success('Configuración guardada', { description: 'Los cambios ya están publicados en la tienda.' })
  }

  /** Agrega un enlace de navegación al menú. */
  function addNavLink() {
    const label = navLinkInput.label.trim()
    const href = navLinkInput.href.trim()
    if (!label || !href) {
      toast.error('Completa etiqueta y URL del enlace')
      return
    }
    addJsonArrayItem('nav_links', 'nav_links', { label, href })
    setNavLinkInput({ href: '', label: '' })
  }

  // ---------- Render de secciones ----------
  /** Sección: Marca (nombre, tagline, logo, ícono, WhatsApp, dirección, email). */
  function renderMarca() {
    return (
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Nombre de la empresa" value={form.company_name} onChange={(e) => setScalar('company_name', e.target.value)} />
          <FormInput label="Slogan / tagline" value={form.tagline} onChange={(e) => setScalar('tagline', e.target.value)} placeholder="Arquitectura de luz" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2 text-sm">
            <span className="font-medium">Logo (header)</span>
            <div className="flex items-center gap-2">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Logo" className="size-12 rounded-xl border border-border object-contain p-1" />
              ) : (
                <div className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground"><Building2 size={18} /></div>
              )}
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium transition-colors hover:bg-muted">
                <Upload size={14} /> {uploadingField === 'logo_url' ? 'Subiendo…' : 'Subir logo'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload('logo_url', e.target.files?.[0])} />
              </label>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium transition-colors hover:bg-muted">
                <Upload size={14} /> ICON
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload('icon_url', e.target.files?.[0])} />
              </label>
            </div>
            <span className="text-xs text-muted-foreground">Sube el logo y el ícono (favicon) de la empresa.</span>
          </div>

          <div className="grid gap-4">
            <FormInput label="WhatsApp (con código país)" value={form.whatsapp_number} onChange={(e) => setScalar('whatsapp_number', e.target.value)} placeholder="584122649707" hint="Ej: 58412... (código país + número)" />
            <FormInput label="Correo de contacto" value={form.email} onChange={(e) => setScalar('email', e.target.value)} placeholder="hola@ilumax.ve" />
            <FormInput label="Dirección" value={form.address} onChange={(e) => setScalar('address', e.target.value)} placeholder="Caracas, Venezuela" />
          </div>
        </div>

        {/* Ubicación de la tienda en el mapa del inicio */}
        <div className="grid gap-4 rounded-2xl border border-dashed border-border p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium"><MapPin size={15} className="text-cyan-600" /> Ubicación en el mapa (inicio)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Estas coordenadas centran el mapa que se muestra en la sección de contacto. Obtén las coordenadas desde Google Maps (clic derecho sobre el punto → copiar coordenadas).
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormInput label="Latitud" value={String(form.map_lat ?? '')} onChange={(e) => setNumber('map_lat', e.target.value)} placeholder="10.4806" inputMode="decimal" />
            <FormInput label="Longitud" value={String(form.map_lng ?? '')} onChange={(e) => setNumber('map_lng', e.target.value)} placeholder="-66.9036" inputMode="decimal" />
            <FormInput label="Zoom (1-21)" value={String(form.map_zoom ?? '')} onChange={(e) => setNumber('map_zoom', e.target.value)} placeholder="13" inputMode="numeric" />
          </div>
        </div>
      </div>
    )
  }

  /** Sección: Menú de navegación. */
  function renderMenu() {
    const links = Array.isArray(form.nav_links) ? form.nav_links : []
    return (
      <div className="grid gap-5">
        <p className="text-sm text-muted-foreground">
          Estos enlaces aparecen en el menú superior de la tienda (escritorio y móvil).
        </p>
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-border bg-card text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Etiqueta</th>
                  <th className="px-4 py-3">URL</th>
                  <th className="w-16 px-4 py-3 text-right">Destacado</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {links.map((link, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="px-4 py-3">
                      <input value={link.label} onChange={(e) => { const next = [...links]; next[i] = { ...next[i], label: e.target.value }; setForm((f) => ({ ...f, nav_links: next })) }} className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring" />
                    </td>
                    <td className="px-4 py-3">
                      <input value={link.href} onChange={(e) => { const next = [...links]; next[i] = { ...next[i], href: e.target.value }; setForm((f) => ({ ...f, nav_links: next })) }} className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs outline-none focus:border-ring" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input type="checkbox" checked={Boolean(link.highlight)} onChange={(e) => { const next = [...links]; next[i] = { ...next[i], highlight: e.target.checked }; setForm((f) => ({ ...f, nav_links: next })) }} className="accent-cyan-500" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeJsonArrayItem('nav_links', 'nav_links', i)} aria-label={`Eliminar ${link.label}`} className="grid size-8 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {links.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">Aún no hay enlaces. Agrega el primero abajo.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-dashed border-border p-4">
          <p className="text-sm font-medium">Agregar enlace</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <FormInput label="Etiqueta" value={navLinkInput.label} onChange={(e) => setNavLinkInput((v) => ({ ...v, label: e.target.value }))} placeholder="Ej: Promociones" />
            <FormInput label="URL" value={navLinkInput.href} onChange={(e) => setNavLinkInput((v) => ({ ...v, href: e.target.value }))} placeholder="Ej: /promociones" />
            <button onClick={addNavLink} className="inline-flex h-10 items-center gap-2 self-end rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]">
              <Plus size={15} /> Agregar
            </button>
          </div>
        </div>
      </div>
    )
  }

  /** Sección: Portada (hero) — textos, imagen y diseño visual. */
  function renderPortada() {
    const hero = form.hero_texts as Record<string, string>
    const stats = Array.isArray(hero.stats) ? (hero.stats as Record<string, string>[]) : []
    const heroImage = (form.hero_images as Record<string, string>).main ?? ''
    return (
      <div className="grid gap-5">
        <PortadaConfigManager value={form.homepage_config.hero} onChange={(heroCfg) => setForm((f) => ({ ...f, homepage_config: { ...f.homepage_config, hero: heroCfg } }))} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Eyebrow" value={hero.eyebrow ?? ''} onChange={(e) => setJsonField('hero_texts', 'eyebrow', e.target.value)} />
          <FormInput label="Título" value={hero.title ?? ''} onChange={(e) => setJsonField('hero_texts', 'title', e.target.value)} hint="La parte resaltada se separa en el campo Título resaltado" />
          <FormInput label="Título resaltado" value={hero.titleHighlight ?? ''} onChange={(e) => setJsonField('hero_texts', 'titleHighlight', e.target.value)} />
          <FormInput label="Badge (esquina superior)" value={hero.badge ?? ''} onChange={(e) => setJsonField('hero_texts', 'badge', e.target.value)} />
        </div>
        <FormTextarea label="Descripción" value={hero.description ?? ''} onChange={(e) => setJsonField('hero_texts', 'description', e.target.value)} rows={3} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Botón principal" value={hero.primaryButton ?? ''} onChange={(e) => setJsonField('hero_texts', 'primaryButton', e.target.value)} />
          <FormInput label="URL botón principal" value={hero.primaryHref ?? ''} onChange={(e) => setJsonField('hero_texts', 'primaryHref', e.target.value)} />
          <FormInput label="Botón secundario" value={hero.secondaryButton ?? ''} onChange={(e) => setJsonField('hero_texts', 'secondaryButton', e.target.value)} />
          <FormInput label="URL botón secundario" value={hero.secondaryHref ?? ''} onChange={(e) => setJsonField('hero_texts', 'secondaryHref', e.target.value)} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Alt de la imagen" value={hero.imageAlt ?? ''} onChange={(e) => setJsonField('hero_texts', 'imageAlt', e.target.value)} />
          <FormInput label="Pie de la imagen" value={hero.imageCaption ?? ''} onChange={(e) => setJsonField('hero_texts', 'imageCaption', e.target.value)} />
          <FormInput label="Indicador de posición" value={hero.imagePosition ?? ''} onChange={(e) => setJsonField('hero_texts', 'imagePosition', e.target.value)} />
        </div>

        <div className="grid gap-3">
          <span className="text-sm font-medium">Imagen principal de la portada</span>
          <div className="flex items-center gap-3">
            {heroImage ? (
              <img src={heroImage} alt="Portada" className="h-24 w-40 rounded-xl border border-border object-cover" />
            ) : (
              <div className="grid h-24 w-40 place-items-center rounded-xl bg-muted text-muted-foreground"><ImagePlusIcon /></div>
            )}
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium transition-colors hover:bg-muted">
              <Upload size={14} /> {uploadingField === 'main' ? 'Subiendo…' : 'Cambiar imagen'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload('main', e.target.files?.[0])} />
            </label>
            {heroImage && (
              <button onClick={() => setJsonField('hero_images', 'main', '')} className="grid size-10 place-items-center rounded-xl border border-destructive/30 text-destructive transition-colors hover:bg-destructive/10" aria-label="Quitar imagen">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3">
          <span className="text-sm font-medium">Estadísticas</span>
          <div className="grid gap-2">
            {stats.map((stat, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={stat.value ?? ''} onChange={(e) => setJsonArrayItem('hero_texts', 'stats', i, 'value', e.target.value)} placeholder="+12" className="w-28 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring" />
                <input value={stat.label ?? ''} onChange={(e) => setJsonArrayItem('hero_texts', 'stats', i, 'label', e.target.value)} placeholder="años de experiencia" className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring" />
                <button onClick={() => removeJsonArrayItem('hero_texts', 'stats', i)} aria-label="Eliminar estadística" className="grid size-9 shrink-0 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => addJsonArrayItem('hero_texts', 'stats', { value: '', label: '' })} className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-border px-3 text-sm font-medium transition-colors hover:bg-muted">
            <Plus size={14} /> Agregar estadística
          </button>
        </div>
      </div>
    )
  }

  /** Sección: Studio. */
  function renderStudio() {
    const studio = form.studio_texts as Record<string, unknown>
    const items = Array.isArray(studio.items) ? (studio.items as Record<string, string>[]) : []
    return (
      <div className="grid gap-5">
        <StudioConfigManager value={form.homepage_config.studio} onChange={(studioCfg) => setForm((f) => ({ ...f, homepage_config: { ...f.homepage_config, studio: studioCfg } }))} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Eyebrow" value={String(studio.eyebrow ?? '')} onChange={(e) => setJsonField('studio_texts', 'eyebrow', e.target.value)} />
          <FormInput label="Título" value={String(studio.title ?? '')} onChange={(e) => setJsonField('studio_texts', 'title', e.target.value)} />
        </div>
        <div className="grid gap-3">
          <span className="text-sm font-medium">Puntos del estudio</span>
          <div className="grid gap-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={item.number ?? ''} onChange={(e) => setJsonArrayItem('studio_texts', 'items', i, 'number', e.target.value)} placeholder="01" className="w-16 rounded-xl border border-border bg-background px-3 py-2 text-center text-sm outline-none focus:border-ring" />
                <input value={item.text ?? ''} onChange={(e) => setJsonArrayItem('studio_texts', 'items', i, 'text', e.target.value)} placeholder="Descripción del punto" className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring" />
                <button onClick={() => removeJsonArrayItem('studio_texts', 'items', i)} aria-label="Eliminar punto" className="grid size-9 shrink-0 place-items-center rounded-lg text-destructive transition-colors hover:bg-destructive/10">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => addJsonArrayItem('studio_texts', 'items', { number: '', text: '' })} className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-border px-3 text-sm font-medium transition-colors hover:bg-muted">
            <Plus size={14} /> Agregar punto
          </button>
        </div>
      </div>
    )
  }

  /** Sección: Contacto. */
  function renderContacto() {
    const c = form.contact_texts as Record<string, string>
    return (
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Eyebrow" value={c.eyebrow ?? ''} onChange={(e) => setJsonField('contact_texts', 'eyebrow', e.target.value)} />
          <FormInput label="Título" value={c.title ?? ''} onChange={(e) => setJsonField('contact_texts', 'title', e.target.value)} />
        </div>
        <FormTextarea label="Descripción" value={c.description ?? ''} onChange={(e) => setJsonField('contact_texts', 'description', e.target.value)} rows={3} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput label="Placeholder nombre" value={c.formNamePlaceholder ?? ''} onChange={(e) => setJsonField('contact_texts', 'formNamePlaceholder', e.target.value)} />
          <FormInput label="Placeholder correo" value={c.formEmailPlaceholder ?? ''} onChange={(e) => setJsonField('contact_texts', 'formEmailPlaceholder', e.target.value)} />
          <FormInput label="Placeholder mensaje" value={c.formMessagePlaceholder ?? ''} onChange={(e) => setJsonField('contact_texts', 'formMessagePlaceholder', e.target.value)} />
          <FormInput label="Texto del botón" value={c.formButton ?? ''} onChange={(e) => setJsonField('contact_texts', 'formButton', e.target.value)} />
        </div>
      </div>
    )
  }

  /** Sección: Footer. */
  function renderFooter() {
    const f = form.footer_texts as Record<string, string>
    return (
      <div className="grid gap-4">
        <FormInput label="Copyright" value={f.copyright ?? ''} onChange={(e) => setJsonField('footer_texts', 'copyright', e.target.value)} placeholder="© 2025 ilumaX. Caracas, Venezuela." />
        <FormInput label="Slogan" value={f.slogan ?? ''} onChange={(e) => setJsonField('footer_texts', 'slogan', e.target.value)} placeholder="Iluminamos ideas." />
      </div>
    )
  }

  /** Sección: Redes sociales. */
  function renderSocial() {
    const s = form.social_links as Record<string, string>
    return (
      <div className="grid gap-4">
        <FormInput label="Instagram" value={s.instagram ?? ''} onChange={(e) => setJsonField('social_links', 'instagram', e.target.value)} placeholder="https://instagram.com" />
        <FormInput label="LinkedIn" value={s.linkedin ?? ''} onChange={(e) => setJsonField('social_links', 'linkedin', e.target.value)} placeholder="https://linkedin.com" />
        <FormInput label="Correo (mailto)" value={s.email ?? ''} onChange={(e) => setJsonField('social_links', 'email', e.target.value)} placeholder="mailto:hola@ilumax.ve" />
      </div>
    )
  }

  /** Sección: Apariencia (colores, radio y presets del tema de marca). */
  function renderApariencia() {
    return (
      <ThemeSettingsManager
        value={form.theme}
        onChange={(theme) => setForm((f) => ({ ...f, theme }))}
      />
    )
  }

  /** Sección: Inicio personalizable con preview en vivo. */
  function renderInicio() {
    const hero = form.hero_texts as Record<string, string>
    const heroImage = (form.hero_images as Record<string, string>).main ?? ''
    return (
      <div className="grid gap-5">
        <p className="text-sm text-muted-foreground">Personaliza el layout de la portada, el fondo y agrega segmentos con imagen + texto, estadísticas, CTA o frases. El preview se actualiza en vivo.</p>
        <HomepageConfigManager value={form.homepage_config} onChange={(homepage_config) => setForm((f) => ({ ...f, homepage_config }))} heroTexts={hero} heroImage={heroImage} />
      </div>
    )
  }

  /** Renderiza la sección activa. */
  function renderSection() {
    switch (active) {
      case 'marca': return renderMarca()
      case 'menu': return renderMenu()
      case 'inicio': return renderInicio()
      case 'portada': return renderPortada()
      case 'studio': return renderStudio()
      case 'contacto': return renderContacto()
      case 'footer': return renderFooter()
      case 'social': return renderSocial()
      case 'apariencia': return renderApariencia()
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      {/* Navegación por secciones */}
      <aside className="h-fit rounded-3xl border border-border bg-card p-3 lg:sticky lg:top-8">
        <nav className="grid gap-1">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors',
                active === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon size={16} /> {label}
            </button>
          ))}

          {/* Acceso a la gestión de facturación venezolana (SENIAT) */}
          <div className="my-2 border-t border-border/70" />
          <button
            onClick={() => router.push('/admin/configuracion/facturacion')}
            className="flex items-center justify-between gap-3 rounded-2xl bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-700 transition-colors hover:bg-cyan-500/20 dark:text-cyan-400"
          >
            <span className="flex items-center gap-3">
              <Receipt size={16} /> Facturación
            </span>
            <ChevronRight size={15} className="text-cyan-600/60" />
          </button>
          <p className="px-4 pt-1 text-[11px] leading-relaxed text-muted-foreground">
            RIF, IVA, correlativos y facturas (normas SENIAT).
          </p>
        </nav>
      </aside>

      {/* Sección activa + guardar */}
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="border-b border-border px-6 py-5">
          <h2 className="font-semibold tracking-tight">{SECTIONS.find((s) => s.key === active)?.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Personaliza la información que se muestra en la tienda.</p>
        </div>
        <div className="p-6">{renderSection()}</div>
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-4">
          <p className="hidden text-xs text-muted-foreground sm:block">
            <MapPin size={13} className="mr-1 inline text-muted-foreground/60" />
            Los cambios se reflejan en toda la tienda al guardar.
          </p>
          <FormSubmitButton loading={saving} onClick={save} className="ml-auto">
            <Save size={15} /> Guardar cambios
          </FormSubmitButton>
        </div>
      </div>
    </div>
  )
}

/** Ícono local (evita import conflict con lucide se usa en portada). */
function ImagePlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 5h6" />
      <path d="M19 2v6" />
      <path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      <circle cx="9" cy="9" r="2" />
    </svg>
  )
}