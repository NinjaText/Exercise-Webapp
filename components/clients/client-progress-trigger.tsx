"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";
import { ClientProgressOverviewDialog } from "@/components/progress/client-progress-overview-dialog";
import { getClientProgressReportAction } from "@/actions/client-progress-actions";
import type { ClientProgressReport } from "@/lib/services/client-progress.service";

const DAY_MS = 1000 * 60 * 60 * 24;
const DEFAULT_WEEKS = 4;

function defaultRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to.getTime() - DEFAULT_WEEKS * 7 * DAY_MS);
  return { from, to };
}

/**
 * Owns the Client Progress Overview dialog's open state and fetches the
 * report via the `getClientProgressReportAction` server action, both when
 * the dialog is opened and whenever the header's date range changes.
 */
export function ClientProgressTrigger({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<{ from: Date; to: Date }>(defaultRange);
  const [report, setReport] = useState<ClientProgressReport | null>(null);

  const fetchReport = async (nextRange: { from: Date; to: Date }) => {
    const result = await getClientProgressReportAction(
      clientId,
      nextRange.from.toISOString(),
      nextRange.to.toISOString()
    );
    if (!result.success) {
      // `report === null` means "loading" to the dialog, so we must not leave it
      // null on failure — the user would sit on a spinner forever.
      toast.error(result.error ?? "Could not load progress");
      setOpen(false);
      return;
    }
    setReport(result.data);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setReport(null);
      void fetchReport(range);
    }
  };

  const handleRangeChange = (nextRange: { from: Date; to: Date }) => {
    setRange(nextRange);
    setReport(null);
    void fetchReport(nextRange);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <TrendingUp className="mr-1 h-4 w-4" />
        Progress
      </Button>
      <ClientProgressOverviewDialog
        open={open}
        onOpenChange={handleOpenChange}
        clientId={clientId}
        clientName={clientName}
        report={report}
        range={range}
        onRangeChange={handleRangeChange}
      />
    </>
  );
}
