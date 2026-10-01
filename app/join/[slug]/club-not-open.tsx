import { Clock } from "lucide-react";
import { CLUB_NOT_OPEN_MESSAGE } from "@/lib/services/club-trainer.service";

/**
 * D5: a club opens for joining once its trainer has accepted the invite.
 * Rendered inside AuthShell, whose headline ("Not open yet") is the page h1.
 */
export function ClubNotOpen() {
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex size-12 items-center justify-center rounded-full bg-neutral-soft text-neutral-foreground">
        <Clock className="size-6" aria-hidden />
      </div>
      <p className="text-body text-muted-foreground">{CLUB_NOT_OPEN_MESSAGE}</p>
    </div>
  );
}
