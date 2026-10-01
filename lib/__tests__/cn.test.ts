import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"

describe("cn with the typography scale utilities", () => {
  it("keeps a type utility alongside a text colour", () => {
    expect(cn("text-heading text-muted-foreground")).toBe("text-heading text-muted-foreground")
  })

  it("treats type utilities as font sizes (last one wins)", () => {
    expect(cn("text-sm text-heading")).toBe("text-heading")
    expect(cn("text-heading text-sm")).toBe("text-sm")
    expect(cn("text-caption text-label")).toBe("text-label")
  })
})
