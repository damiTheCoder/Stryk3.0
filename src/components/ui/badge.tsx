import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantStyles = {
    default: 'bg-[var(--ink)] text-[var(--bg)] shadow-xs hover:opacity-90',
    secondary: 'bg-[var(--surface-strong)] text-[var(--ink)] hover:bg-[var(--surface-muted)]',
    destructive: 'bg-red-500/15 text-red-600 dark:text-red-400',
    outline: 'text-[var(--ink)] bg-[var(--surface-strong)]',
    success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
