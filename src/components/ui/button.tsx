import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const variantStyles = {
      default: 'bg-[#2563EB] text-white font-semibold shadow-xs hover:bg-[#1D4ED8] active:scale-[0.98]',
      destructive: 'bg-red-600 text-white shadow-xs hover:bg-red-700 active:scale-[0.98]',
      outline: 'bg-[#2563EB]/15 text-[#2563EB] dark:text-[#60A5FA] font-semibold hover:bg-[#2563EB]/25 active:scale-[0.98]',
      secondary: 'bg-[#2563EB] text-white font-semibold shadow-xs hover:bg-[#1D4ED8] active:scale-[0.98]',
      ghost: 'text-[var(--ink)] hover:bg-[#2563EB]/15 active:scale-[0.98]',
      link: 'text-[#2563EB] dark:text-[#60A5FA] underline-offset-4 hover:underline',
    }

    const sizeStyles = {
      default: 'h-9 px-4 py-2 text-sm',
      sm: 'h-8 rounded-lg px-3 text-xs',
      lg: 'h-11 rounded-xl px-8 text-base font-semibold',
      icon: 'h-9 w-9',
    }

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button }
