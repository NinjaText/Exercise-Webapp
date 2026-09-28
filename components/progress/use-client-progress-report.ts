"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { getClientProgressReportAction } from "@/actions/client-progress-actions";
import type { ClientProgressReport } from "@/lib/services/client-progress.service";

const DAY_MS = 1000 * 60 * 60 * 24;
const DEFAULT_WEEKS = 4;

export type ProgressRange = { from: Date; to: Date };

function defaultRange(): ProgressRange {
  const to = new Date();
  const from = new Date(to.getTime() - DEFAULT_WEEKS * 7 * DAY_MS);
  return { from, to };
}

/**
 * Fetches a Client Progress Overview report via the server action and tracks
 * the selected date range. `report === null` means "loading" to the dialog.
 *
 * Only the latest request is applied: switching clients or ranges quickly
 * must never let a slow, older response overwrite the newer one.
 */
export function useClientProgressReport({ onError }: { onError?: () => void } = {}) {
  const [range, setRange] = useState<ProgressRange>(defaultRange);
  const [report, setReport] = useState<ClientProgressReport | null>(null);
  const latestRequest = useRef(0);

  const load = useCallback(
    async (clientId: string, nextRange: ProgressRange) => {
      const requestId = ++latestRequest.current;
      setReport(null);
      const result = await getClientProgressReportAction(
        clientId,
        nextRange.from.toISOString(),
        nextRange.to.toISOString()
      );
      if (requestId !== latestRequest.current) return;
      if (!result.success) {
        // The dialog would otherwise sit on its loading state forever.
        toast.error(result.error ?? "Could not load progress");
        onError?.();
        return;
      }
      setReport(result.data);
    },
    [onError]
  );

  const changeRange = useCallback(
    (clientId: string, nextRange: ProgressRange) => {
      setRange(nextRange);
      void load(clientId, nextRange);
    },
    [load]
  );

  /** Drops any in-flight response, e.g. when the dialog closes. */
  const cancel = useCallback(() => {
    latestRequest.current += 1;
  }, []);

  return { range, report, load, changeRange, cancel };
}
