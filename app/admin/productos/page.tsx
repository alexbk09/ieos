import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader, AdminShell } from '@/components/admin-shell'
import { ProductManager } from '@/components/product-manager'

export default async function ProductsPage() { const { supabase } = await requireAdmin(); const [{ data: products }, { data: categories }] = await Promise.all([supabase.from('products').select('*').order('created_at', { ascending: false }), supabase.from('categories').select('id,name').order('name')]); return <AdminShell><AdminPageHeader eyebrow="Catálogo" title="Productos" description="Administra inventario, precios e imágenes." action={<a href="/admin/productos#nuevo" className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">+ Nuevo producto</a>} /><div className="p-5 sm:p-8"><ProductManager initialProducts={products ?? []} categories={categories ?? []} /></div></AdminShell> }
