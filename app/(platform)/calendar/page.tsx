import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import {
  getClientCalendarSessions,
  getClientCalendarWindow,
} from "@/lib/services/session.service";
import { PageHeader } from "@/components/shared/page-header";
import { ClientCalendarView } from "@/components/dashboard/client-calendar-view";

/**
 * The client's full-page month schedule.
 *
 * The dashboard used to embed this calendar inline; it now shows only the
 * compact week strip and links here, so the dashboard fits one viewport.
 * Trainers have their own per-client calendar on the client detail page.
 */
export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (user.role === "TRAINER") redirect("/dashboard");

  const sessions = await getClientCalendarSessions(
    user.id,
    getClientCalendarWindow(new Date())
  );

  return (
    <div>
      <PageHeader title="My Calendar" description="Every workout on your schedule." />
      <ClientCalendarView sessions={sessions} />
    </div>
  );
}
