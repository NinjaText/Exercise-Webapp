"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";
import { ClientProgressOverviewDialog } from "@/components/progress/client-progress-overview-dialog";
import { useClientProgressReport } from "@/components/progress/use-client-progress-report";

/**
 * Owns the Client Progress Overview dialog's open state and fetches the
 * report both when the dialog is opened and whenever the header's date
 * range changes.
 */
export function ClientProgressTrigger({ clientId, clientName }: { clientId: string; clientName: string }) {
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
    <>
      <Button variant="outline" onClick={() => handleOpenChange(true)}>
        <TrendingUp className="h-4 w-4" />
        Progress
      </Button>
      <ClientProgressOverviewDialog
        open={open}
        onOpenChange={handleOpenChange}
        clientId={clientId}
        clientName={clientName}
        report={report}
        range={range}
        onRangeChange={(nextRange) => changeRange(clientId, nextRange)}
      />
    </>
  );
}
