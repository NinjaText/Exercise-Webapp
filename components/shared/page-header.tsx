import Link from "next/link";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BreadcrumbRegistrar, type Crumb } from "@/components/layout/breadcrumb-context";

export interface PageHeaderAction {
  label: string;
  href?: string;
  /** Only usable from a client component; server pages must use `href`. */
  onSelect?: () => void;
  icon?: LucideIcon;
  destructive?: boolean;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Shown in the top bar. Defaults to a single crumb with the title. */
  breadcrumb?: Crumb[];
  /** Small "← Back to X" link above the title. */
  back?: { label: string; href: string };
  /** Exactly one filled button per screen. */
  primaryAction?: React.ReactNode;
  /** Outline buttons. */
  secondaryActions?: React.ReactNode;
  /** Everything else, in a "More" menu. */
  overflow?: PageHeaderAction[];
  /**
   * Menu items rendered above `overflow` in the "More" menu, for items that
   * need client behaviour (e.g. opening a dialog) or their own classes
   * (e.g. `sm:hidden` phone-only copies of header buttons).
   */
  overflowLead?: React.ReactNode;
  /** Status badges and short facts shown under the title/description, above the tabs. */
  meta?: React.ReactNode;
  /** A <Tabs> element; its <TabsList variant="line"> renders flush under the header. */
  tabs?: React.ReactNode;
  /** @deprecated Use primaryAction. Kept so existing call sites compile. */
  action?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  back,
  primaryAction,
  secondaryActions,
  overflow,
  overflowLead,
  meta,
  tabs,
  action,
  className,
}: PageHeaderProps) {
  const primary = primaryAction ?? action;
  const hasOverflow = Boolean(overflowLead || (overflow && overflow.length > 0));
  const hasActions = Boolean(primary || secondaryActions || hasOverflow);
  const crumbs: Crumb[] = breadcrumb ?? [{ label: title }];

  return (
    <header data-slot="page-header" className={cn("flex flex-col gap-4", className)}>
      <BreadcrumbRegistrar crumbs={crumbs} />

      {back && (
        <Link
          href={back.href}
          className="inline-flex w-fit items-center gap-1.5 rounded-sm text-label text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <ArrowLeft className="size-4" />
          {back.label}
        </Link>
      )}

      {/* Actions centre on the title row; min-h-9 (the 36px button height) keeps a
          one-line title and an icon-only overflow trigger on the same axis. */}
      <div className="flex flex-col gap-3 sm:min-h-9 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-title text-foreground">{title}</h1>
          {description && <p className="mt-1 text-body text-muted-foreground">{description}</p>}
        </div>

        {hasActions && (
          <div data-slot="page-header-actions" className="flex shrink-0 flex-wrap items-center gap-2">
            {secondaryActions}
            {primary}
            {hasOverflow && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="More actions"
                      data-slot="page-header-overflow"
                    />
                  }
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {overflowLead}
                  {overflow?.map((item) =>
                    item.href ? (
                      <DropdownMenuItem
                        key={item.label}
                        variant={item.destructive ? "destructive" : "default"}
                        render={<Link href={item.href} />}
                      >
                        {item.icon && <item.icon className="size-4" />}
                        {item.label}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        key={item.label}
                        variant={item.destructive ? "destructive" : "default"}
                        onClick={item.onSelect}
                      >
                        {item.icon && <item.icon className="size-4" />}
                        {item.label}
                      </DropdownMenuItem>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>

      {meta && (
        <div
          data-slot="page-header-meta"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body text-muted-foreground"
        >
          {meta}
        </div>
      )}

      {tabs && (
        <div
          data-slot="page-header-tabs"
          className="-mb-2 min-w-0 max-w-full border-b border-border max-sm:overflow-x-auto"
        >
          {tabs}
        </div>
      )}
    </header>
  );
}
