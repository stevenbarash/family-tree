"use client"

import * as React from "react"
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"

import { cn } from "@/lib/utils"

function HoverCard({ ...props }: PreviewCardPrimitive.Root.Props) {
  return <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger({ ...props }: PreviewCardPrimitive.Trigger.Props) {
  return (
    <PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  )
}

/**
 * Styled portal + positioner + popup. Default placement: below the trigger,
 * 8px offset. Width capped at 320px (cards vary in content density). Base-ui
 * handles viewport-flip when there's no room.
 */
function HoverCardContent({
  className,
  sideOffset = 8,
  side = "bottom",
  align = "start",
  ...props
}: PreviewCardPrimitive.Popup.Props & {
  sideOffset?: PreviewCardPrimitive.Positioner.Props["sideOffset"]
  side?: PreviewCardPrimitive.Positioner.Props["side"]
  align?: PreviewCardPrimitive.Positioner.Props["align"]
}) {
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner
        // z-index must sit on the Positioner — the positioned element.
        // The Popup inside it is `position: static`, so a z-index there is
        // inert and the card loses to z-indexed page chrome.
        className="z-50"
        sideOffset={sideOffset}
        side={side}
        align={align}
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "w-[320px] rounded-md border bg-popover p-3 text-popover-foreground shadow-lg outline-none",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardContent, HoverCardTrigger }
