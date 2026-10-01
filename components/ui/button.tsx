"use client"

import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Spec §2.3: sizes sm 32 / default 36 / lg 40; md radius; a token focus ring
// offset from the button so it reads on any surface. `secondary` and `outline`
// share the hairline-on-surface look (outline is kept for existing callers);
// `primary` is an alias of `default`. The xs sizes stay visually compact but
// extend their pointer area to 32px with a transparent ::after.
const focusRing =
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
// outline/secondary share one look, so an "on" state needs its own style:
// aria-pressed for real toggles, data-state="on" for a selected/done state
// that isn't a toggle (so screen readers don't announce it as one).
const hairline =
  "border-border bg-surface text-foreground shadow-xs hover:border-border-strong hover:bg-surface-muted aria-expanded:border-border-strong aria-expanded:bg-surface-muted aria-pressed:border-border-strong aria-pressed:bg-muted aria-pressed:hover:bg-muted data-[state=on]:border-border-strong data-[state=on]:bg-muted data-[state=on]:hover:bg-muted"
const solid =
  "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 aria-expanded:bg-primary/90"
const compactHitArea = "relative after:absolute after:-inset-1 after:content-['']"

const buttonVariants = cva(
  `group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none select-none ${focusRing} active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 motion-reduce:transition-none motion-reduce:active:translate-y-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
  {
    variants: {
      variant: {
        default: solid,
        primary: solid,
        outline: hairline,
        secondary: hairline,
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/60",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive hover:border-destructive/30 hover:bg-destructive/15 focus-visible:ring-destructive dark:bg-destructive/20 dark:hover:bg-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: `h-7 gap-1 rounded-sm px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3 ${compactHitArea}`,
        sm: "h-8 gap-1 px-3 text-label in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        icon: "size-9",
        "icon-xs": `size-7 rounded-sm in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3.5 ${compactHitArea}`,
        "icon-sm": "size-8 in-data-[slot=button-group]:rounded-md",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
      className: cn(
        buttonVariants({ variant, size }),
        (children as React.ReactElement<{ className?: string }>).props.className,
        className
      ),
      "data-slot": "button",
    })
  }

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {children}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
