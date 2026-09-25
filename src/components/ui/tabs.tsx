import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabsContextType {
  value: string
  onChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextType | undefined>(undefined)

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
  ...props
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
  children: React.ReactNode
}) {
  const [activeTab, setActiveTab] = React.useState(defaultValue || '')
  const currentTab = value !== undefined ? value : activeTab

  const handleTabChange = (val: string) => {
    setActiveTab(val)
    onValueChange?.(val)
  }

  return (
    <TabsContext.Provider value={{ value: currentTab, onChange: handleTabChange }}>
      <div className={cn('flex flex-col gap-2', className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-xl bg-[var(--surface)] p-1 text-[var(--muted)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function TabsTrigger({
  value,
  className,
  children,
  ...props
}: {
  value: string
  className?: string
  children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const context = React.useContext(TabsContext)
  if (!context) throw new Error('TabsTrigger must be used within Tabs')

  const isSelected = context.value === value

  return (
    <button
      type="button"
      onClick={() => context.onChange(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
        isSelected
          ? 'bg-[var(--bg)] text-[var(--ink)] shadow-xs font-semibold'
          : 'text-[var(--muted)] hover:text-[var(--ink)]',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: {
  value: string
  className?: string
  children: React.ReactNode
} & React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(TabsContext)
  if (!context) throw new Error('TabsContent must be used within Tabs')

  if (context.value !== value) return null

  return (
    <div
      className={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
