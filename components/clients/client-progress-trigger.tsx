"use client";

import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { TrendingUp } from "lucide-react";
import { ClientProgressOverviewDialog } from "@/components/progress/client-progress-overview-dialog";
import { useClientProgressReport } from "@/components/progress/use-client-progress-report";

const OpenProgressContext = createContext<(() => void) | null>(null);

function useOpenProgress() {
  const open = useContext(OpenProgressContext);
  if (!open) throw new Error("Progress controls must be rendered inside <ClientProgressProvider>");
  return open;
}

/**
 * Owns the Client Progress Overview dialog's open state and fetches the
 * report both when the dialog is opened and whenever the header's date
 * range changes.
 *
 * The dialog lives here, outside any menu, so both the header button
 * (`ClientProgressTrigger`) and the phone overflow-menu item
 * (`ClientProgressMenuItem`) can open it without it unmounting when the
 * menu closes.
 */
export function ClientProgressProvider({
  clientId,
  clientName,
  children,
}: {
  clientId: string;
  clientName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { range, report, load, changeRange, cancel } = useClientProgressReport({
    onError: () => setOpen(false),
  });

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) void load(clientId, range);
    else cancel();
  };

  return (
    <OpenProgressContext.Provider value={() => handleOpenChange(true)}>
      {children}
      <ClientProgressOverviewDialog
        open={open}
        onOpenChange={handleOpenChange}
        clientId={clientId}
        clientName={clientName}
        report={report}
        range={range}
        onRangeChange={(nextRange) => changeRange(clientId, nextRange)}
      />
    </OpenProgressContext.Provider>
  );
}

/** The header's outline "Progress" button. */
export function ClientProgressTrigger({ className }: { className?: string }) {
  const openProgress = useOpenProgress();
  return (
    <Button variant="outline" className={className} onClick={openProgress}>
      <TrendingUp className="h-4 w-4" />
      Progress
    </Button>
  );
}

/** "Progress" as an overflow-menu item (the phone header). */
export function ClientProgressMenuItem({ className }: { className?: string }) {
  const openProgress = useOpenProgress();
  return (
    <DropdownMenuItem className={className} onClick={openProgress}>
      <TrendingUp className="size-4" />
      Progress
    </DropdownMenuItem>
  );
}
