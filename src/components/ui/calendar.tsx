import { CaretLeft, CaretRight } from "@phosphor-icons/react"
import * as React from "react"
import { DayPicker } from "react-day-picker"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Compact month picker (react-day-picker) styled to match the app. */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-1", className)}
      classNames={{
        months: "relative flex flex-col",
        month: "flex w-full flex-col gap-2",
        month_caption: "flex h-8 items-center justify-center",
        caption_label: "text-sm font-semibold capitalize",
        nav: "absolute inset-x-0 top-0 flex h-8 items-center justify-between",
        button_previous: cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "z-10"),
        button_next: cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "z-10"),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "flex-1 text-center text-[11px] font-medium uppercase text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "relative flex-1 p-0 text-center text-sm",
        day_button:
          "relative mx-auto flex size-8 items-center justify-center rounded-md font-normal transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        selected: "[&>button]:bg-brand [&>button]:text-white [&>button]:hover:bg-brand",
        today: "[&>button]:font-bold [&>button]:text-brand",
        outside: "text-muted-foreground/50",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? <CaretLeft size={14} /> : <CaretRight size={14} />,
      }}
      {...props}
    />
  )
}

export { Calendar }
