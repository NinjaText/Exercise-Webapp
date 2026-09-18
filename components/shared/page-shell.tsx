import { cn } from "@/lib/utils";

export type PageWidth = "narrow" | "default" | "full";

/** Spec §3.2: three widths, chosen per page, never per component. */
export const PAGE_WIDTH_CLASS: Record<PageWidth, string> = {
  narrow: "max-w-[640px]",
  default: "max-w-[1600px]",
  full: "max-w-none",
};

interface PageShellProps {
  width?: PageWidth;
  className?: string;
  children: React.ReactNode;
}

/**
 * Root wrapper for every platform page. Owns the content width and the
 * vertical rhythm between header, toolbar and content (24px).
 * The outer <main> in app/(platform)/layout.tsx owns the page gutter.
 */
export function PageShell({ width = "default", className, children }: PageShellProps) {
  return (
    <div
      data-slot="page-shell"
      data-width={width}
      className={cn("mx-auto flex w-full flex-col gap-6", PAGE_WIDTH_CLASS[width], className)}
    >
      {children}
    </div>
  );
}
