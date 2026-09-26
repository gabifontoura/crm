import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import type { VariantProps } from "class-variance-authority"
import * as React from "react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const AlertDialog = AlertDialogPrimitive.Root
const AlertDialogTrigger = AlertDialogPrimitive.Trigger

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <AlertDialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-card p-6 shadow-lg",
          className
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2 text-left", className)} {...props} />
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />
}

/** Round icon slot shown above the title. */
function AlertDialogMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("mb-1 flex size-10 items-center justify-center rounded-full bg-muted", className)} {...props} />
  )
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={cn("text-base font-semibold", className)} {...props} />
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />
}

type ButtonVariantProps = VariantProps<typeof buttonVariants>

function AlertDialogAction({
  className,
  variant = "default",
  size,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & ButtonVariantProps) {
  return <AlertDialogPrimitive.Action className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> & ButtonVariantProps) {
  return <AlertDialogPrimitive.Cancel className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
}
