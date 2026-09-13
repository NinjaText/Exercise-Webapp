"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { ClientContextPanel } from "./client-context-panel";
import type { InboxThreadData } from "@/lib/services/inbox.service";

interface ClientContextSheetProps {
  client: { id: string; firstName: string; lastName: string; email: string };
  data: InboxThreadData;
}

export function ClientContextSheet({ client, data }: ClientContextSheetProps) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 xl:hidden" aria-label="Client info" />
        }
      >
        <Info className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-80 p-0">
        <SheetTitle className="sr-only">Client Info</SheetTitle>
        <ClientContextPanel client={client} data={data} />
      </SheetContent>
    </Sheet>
  );
}
