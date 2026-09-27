"use client";

import { useIsPhone } from "@/hooks/use-is-phone";

/**
 * Renders its children only on phone-width viewports (below `sm`). Unlike an
 * `sm:hidden` class, the children are absent from the DOM on larger screens,
 * so they can't take keyboard focus there. Renders nothing on the server, so
 * use it only where content mounts after interaction (e.g. inside a menu).
 */
export function PhoneOnly({ children }: { children: React.ReactNode }) {
  return useIsPhone() ? <>{children}</> : null;
}
