import { CLUB_NOT_OPEN_MESSAGE } from "@/lib/services/club-trainer.service";

/** D5: a club opens for joining once its trainer has accepted the invite. */
export function ClubNotOpen() {
  return (
    <div className="max-w-md space-y-2 text-center">
      <h1 className="text-xl font-semibold text-foreground">Not open yet</h1>
      <p className="text-sm text-muted-foreground">{CLUB_NOT_OPEN_MESSAGE}</p>
    </div>
  );
}
