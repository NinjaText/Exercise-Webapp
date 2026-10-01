"use client";

import { useCallback, useEffect, useState } from "react";
import { useReverification, useSession, useUser } from "@clerk/nextjs";
import type { SessionWithActivitiesResource } from "@clerk/nextjs/types";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Loader2, Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { SettingsPanel } from "@/components/settings/settings-section";
import { clerkErrorMessage, isCancelledReverification } from "@/components/settings/account/clerk-error";

function deviceLabel(session: SessionWithActivitiesResource): string {
  const { browserName, deviceType, isMobile } = session.latestActivity ?? {};
  const device = deviceType || (isMobile ? "Mobile device" : "Computer");
  return browserName ? `${browserName} on ${device}` : device;
}

function locationLabel(session: SessionWithActivitiesResource): string | null {
  const { city, country, ipAddress } = session.latestActivity ?? {};
  const place = [city, country].filter(Boolean).join(", ");
  return [place, ipAddress].filter(Boolean).join(" · ") || null;
}

export function SessionsPanel() {
  const { user } = useUser();
  const { session: current } = useSession();
  const [sessions, setSessions] = useState<SessionWithActivitiesResource[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const revoke = useReverification((session: SessionWithActivitiesResource) => session.revoke());

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const all = await user.getSessions();
      setSessions(
        all
          .filter((s) => s.status === "active")
          .sort(
            (a, b) =>
              Number(b.id === current?.id) - Number(a.id === current?.id) ||
              new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
          )
      );
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [user, current?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevoke(session: SessionWithActivitiesResource) {
    setRevoking(session.id);
    try {
      await revoke(session);
      setSessions((list) => list?.filter((s) => s.id !== session.id) ?? null);
      toast.success("Signed out of that device");
    } catch (error) {
      if (!isCancelledReverification(error)) {
        toast.error(clerkErrorMessage(error, "We couldn't sign out that device. Please try again."));
      }
    } finally {
      setRevoking(null);
    }
  }

  return (
    <SettingsPanel
      title="Active devices"
      description="Devices currently signed in to your account. If you don't recognize one, sign it out and change your password."
    >
      {sessions === null && !loadFailed && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {loadFailed && (
        <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
          We couldn&apos;t load your devices.
          <Button variant="outline" size="sm" onClick={load}>
            Try again
          </Button>
        </div>
      )}

      {sessions && (
        <ul className="flex flex-col divide-y divide-border rounded-lg ring-1 ring-border">
          {sessions.map((session) => {
            const isCurrent = session.id === current?.id;
            const Icon = session.latestActivity?.isMobile ? Smartphone : Monitor;
            const location = locationLabel(session);
            return (
              <li key={session.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{deviceLabel(session)}</span>
                    {isCurrent && <StatusBadge status="current" label="This device" role="success" size="sm" />}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[location, isCurrent ? "Active now" : `Last active ${formatDistanceToNow(new Date(session.lastActiveAt), { addSuffix: true })}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {!isCurrent && (
                  <Button variant="outline" size="sm" onClick={() => handleRevoke(session)} disabled={revoking !== null}>
                    {revoking === session.id && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsPanel>
  );
}
