"use client";

import * as React from "react";
import { TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ClickableRowProps extends Omit<React.ComponentProps<typeof TableRow>, "onClick"> {
  onActivate: () => void;
}

/**
 * A table row that is a real control: click, Enter or Space activate it and
 * it shows a focus ring. DataList renders this only for `onRowClick` rows, so
 * server pages that use `rowHref` never pull in a client boundary.
 */
export function ClickableRow({ onActivate, className, children, ...props }: ClickableRowProps) {
  return (
    <TableRow
      {...props}
      data-clickable="true"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className
      )}
    >
      {children}
    </TableRow>
  );
}
