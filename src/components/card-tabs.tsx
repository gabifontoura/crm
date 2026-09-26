import type { ReactNode } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export interface CardTab {
  label: string
  content: ReactNode
}

interface CardTabsProps {
  tabs: CardTab[]
  className?: string
  contentClassName?: string
}

/** Folder-style tabs whose panel sits in a bordered card. */
export function CardTabs({ tabs, className, contentClassName }: CardTabsProps) {
  if (tabs.length === 0) return null
  return (
    <Tabs defaultValue="tab-0" className={cn("flex flex-col", className)}>
      <TabsList>
        {tabs.map((t, i) => (
          <TabsTrigger key={t.label} value={`tab-${i}`}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t, i) => (
        <TabsContent
          key={t.label}
          value={`tab-${i}`}
          className={cn("rounded-b-md border-x border-b border-border bg-card p-4", contentClassName)}
        >
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
