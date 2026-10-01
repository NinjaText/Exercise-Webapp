import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The typography scale utilities in app/globals.css (text-display … text-caption)
// are font sizes, not colours; without this, tailwind-merge drops them when a
// text colour follows (e.g. `text-heading text-muted-foreground`).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "title", "heading", "body", "label", "caption"] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
