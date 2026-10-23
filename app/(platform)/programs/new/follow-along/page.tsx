import { requireRole } from "@/lib/current-user";
import { FollowAlongEditor } from "@/components/programs/follow-along/follow-along-editor";
import { BreadcrumbRegistrar } from "@/components/layout/breadcrumb-context";
import { PageShell } from "@/components/shared/page-shell";

export default async function NewFollowAlongProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const [{ clientId }] = await Promise.all([searchParams, requireRole("TRAINER")]);

  return (
    <PageShell>
      <BreadcrumbRegistrar
        crumbs={[{ label: "Programs", href: "/programs" }, { label: "New follow-along program" }]}
      />
      <FollowAlongEditor assignClientId={clientId} />
    </PageShell>
  );
}
