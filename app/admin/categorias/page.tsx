import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader, AdminShell } from '@/components/admin-shell'
import { CategoryManager } from '@/components/category-manager'

export default async function CategoriesPage() { const { supabase } = await requireAdmin(); const { data: categories } = await supabase.from('categories').select('*').order('name'); return <AdminShell><AdminPageHeader eyebrow="Organización" title="Categorías" description="Agrupa el catálogo para que sea fácil de explorar." /><div className="p-5 sm:p-8"><CategoryManager initialCategories={categories ?? []} /></div></AdminShell> }
