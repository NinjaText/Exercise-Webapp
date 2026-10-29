import { requireRole } from "@/lib/current-user";
import * as journalService from "@/lib/services/journal.service";
import { PageShell } from "@/components/shared/page-shell";
import { PageHeader } from "@/components/shared/page-header";
import { JournalView } from "@/components/journal/journal-view";
import { parseDateKey } from "@/lib/reflections/dates";

export const metadata = { title: "Journal" };

interface Props {
  searchParams?: Promise<{ from?: string; to?: string }>;
}

export default async function JournalPage({ searchParams }: Props) {
  const user = await requireRole("CLIENT");
  const params = (await searchParams) ?? {};
  // Malformed keys are ignored; a reversed range is read the way it was meant.
  let fromKey = params.from && parseDateKey(params.from) ? params.from : null;
  let toKey = params.to && parseDateKey(params.to) ? params.to : null;
  if (fromKey && toKey && fromKey > toKey) [fromKey, toKey] = [toKey, fromKey];

  const entries = await journalService.listEntriesForClient(user.id, {
    from: fromKey ? parseDateKey(fromKey) : null,
    to: toKey ? parseDateKey(toKey) : null,
  });

  return (
    <PageShell>
      <PageHeader
        title="Journal"
        description="Your reflections and notes. Private entries are only visible to you."
      />
      <JournalView
        range={{ from: fromKey, to: toKey }}
        limitReached={entries.length >= journalService.CLIENT_PAGE_SIZE}
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
