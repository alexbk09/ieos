import { cn } from '@/lib/utils'

/**
 * Avatar del usuario.
 * Muestra la imagen del usuario si existe; si no, muestra sus iniciales.
 * Se usa en el menú del header y en la página de perfil.
 */
export function UserAvatar({ name, imageUrl, size = 'md', className }: {
  /** Nombre del usuario para generar las iniciales. */
  name?: string | null
  /** URL de la imagen del avatar (si existe). */
  imageUrl?: string | null
  /** Tamaño del avatar. */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  /** Clases extra para el contenedor. */
  className?: string
}) {
  const SIZES = {
    xs: 'size-7 text-[10px]',
    sm: 'size-9 text-xs',
    md: 'size-10 text-sm',
    lg: 'size-16 text-xl',
    xl: 'size-24 text-3xl',
  }

  // Genera las iniciales: primeras letras de las primeras 2 palabras.
  const initials = (name ?? 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name ?? 'Usuario'}
        className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)}
      />
    )
  }

  return (
    <span className={cn(
      'grid shrink-0 place-items-center rounded-full bg-cyan-500/20 font-semibold text-cyan-600 dark:bg-cyan-400/10 dark:text-cyan-300',
      SIZES[size],
      className,
    )}>
      {initials}
    </span>
  )
}