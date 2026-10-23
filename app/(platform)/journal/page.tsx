import { requireRole } from "@/lib/current-user";
import * as journalService from "@/lib/services/journal.service";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { JournalView } from "@/components/journal/journal-view";

export const metadata = { title: "Journal" };

export default async function JournalPage() {
  const user = await requireRole("CLIENT");
  const entries = await journalService.listEntriesForClient(user.id);

  return (
    <PageShell>
      <PageHeader
        title="Journal"
        description="Your reflections and notes. Private entries are only visible to you."
      />
      <JournalView
        entries={entries.map((entry) => ({
          id: entry.id,
          body: entry.body,
          visibility: entry.visibility === "SHARED" ? "SHARED" : "PRIVATE",
          promptText: entry.promptText,
          promptAuthor: entry.promptAuthor,
          promptKind: entry.promptKind,
          entryDate: entry.entryDate.toISOString(),
          createdAt: entry.createdAt.toISOString(),
        }))}
      />
    </PageShell>
  );
}
