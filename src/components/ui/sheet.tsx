"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Maximize2, Minimize2, XIcon } from "lucide-react"

type SheetPresentation = "side" | "modal"
type SheetPresentationTransition = "to-modal" | "to-side" | null

type SheetPresentationContextValue = {
  presentation: SheetPresentation
  transition: SheetPresentationTransition
  togglePresentation: () => void
}

const SheetPresentationContext = React.createContext<SheetPresentationContextValue | null>(null)

function Sheet({ onOpenChangeComplete, ...props }: SheetPrimitive.Root.Props) {
  const [presentation, setPresentation] = React.useState<SheetPresentation>("side")
  const [transition, setTransition] = React.useState<SheetPresentationTransition>(null)

  const togglePresentation = React.useCallback(() => {
    const next = presentation === "side" ? "modal" : "side"
    setTransition(next === "modal" ? "to-modal" : "to-side")
    setPresentation(next)
  }, [presentation])

  const handleOpenChangeComplete = React.useCallback((open: boolean) => {
    if (!open) {
      setPresentation("side")
      setTransition(null)
    }
    onOpenChangeComplete?.(open)
  }, [onOpenChangeComplete])

  const contextValue = React.useMemo(() => ({
    presentation,
    transition,
    togglePresentation,
  }), [presentation, transition, togglePresentation])

  return (
    <SheetPresentationContext.Provider value={contextValue}>
      <SheetPrimitive.Root
        data-slot="sheet"
        onOpenChangeComplete={handleOpenChangeComplete}
        {...props}
      />
    </SheetPresentationContext.Provider>
  )
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/20 supports-backdrop-filter:backdrop-blur-xs data-open:animate-overlay-in data-closed:animate-overlay-out",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  allowModalView = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  allowModalView?: boolean
}) {
  const presentationContext = React.useContext(SheetPresentationContext)
  const presentation = presentationContext?.presentation ?? "side"
  const transition = presentationContext?.transition ?? null
  const showPresentationToggle = allowModalView && presentationContext !== null

  const sideAnimation = transition === "to-side"
    ? "animate-sheet-modal-to-side data-closed:data-[side=right]:animate-sheet-out-right data-closed:data-[side=left]:animate-sheet-out-left data-closed:data-[side=top]:animate-sheet-out-top data-closed:data-[side=bottom]:animate-sheet-out-bottom"
    : "data-open:data-[side=right]:animate-sheet-in-right data-closed:data-[side=right]:animate-sheet-out-right data-open:data-[side=left]:animate-sheet-in-left data-closed:data-[side=left]:animate-sheet-out-left data-open:data-[side=top]:animate-sheet-in-top data-closed:data-[side=top]:animate-sheet-out-top data-open:data-[side=bottom]:animate-sheet-in-bottom data-closed:data-[side=bottom]:animate-sheet-out-bottom"

  const presentationLabel = presentation === "side" ? "Open in modal view" : "Return to side pane"
  const PresentationIcon = presentation === "side" ? Maximize2 : Minimize2

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        data-presentation={presentation}
        data-modal-geometry={presentation === "modal" ? "wide" : undefined}
        data-has-presentation-actions={showPresentationToggle || undefined}
        data-presentation-transition={showPresentationToggle ? transition ?? undefined : undefined}
        className={cn(
          "sheet-presentation-content fixed z-50 flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
          presentation === "modal" ? "data-open:data-[presentation=modal]:animate-sheet-modal-in data-closed:data-[presentation=modal]:animate-sheet-modal-out" : sideAnimation,
          className
        )}
        {...props}
      >
        {children}
        {showPresentationToggle && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-3 right-12 z-[1]"
                  aria-label={presentationLabel}
                  aria-pressed={presentation === "modal"}
                  data-testid="sheet-presentation-toggle"
                  onClick={presentationContext.togglePresentation}
                />
              }
            >
              <PresentationIcon aria-hidden="true" />
              <span className="sr-only">{presentationLabel}</span>
            </TooltipTrigger>
            <TooltipContent side="left">{presentationLabel}</TooltipContent>
          </Tooltip>
        )}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-3 right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
