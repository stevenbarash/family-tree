"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

/**
 * Styled portal + positioner + popup. Default placement: below the trigger,
 * aligned to its end, 8px offset. Base-ui handles viewport-flip and `dir`.
 */
function PopoverContent({
  className,
  sideOffset = 8,
  side = "bottom",
  align = "end",
  ...props
}: PopoverPrimitive.Popup.Props & {
  sideOffset?: PopoverPrimitive.Positioner.Props["sideOffset"]
  side?: PopoverPrimitive.Positioner.Props["side"]
  align?: PopoverPrimitive.Positioner.Props["align"]
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        // z-index must sit on the Positioner — the positioned element.
        // The Popup inside it is `position: static`, so a z-index there is
        // inert and the popup loses to z-indexed page chrome (e.g. the
        // sticky `z-20` family-tree header).
        className="z-50"
        sideOffset={sideOffset}
        side={side}
        align={align}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "w-[240px] rounded-md border bg-popover p-3 text-popover-foreground shadow-lg outline-none",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverContent, PopoverTrigger }
