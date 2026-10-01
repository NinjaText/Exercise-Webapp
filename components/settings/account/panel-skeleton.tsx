import { Skeleton } from "@/components/ui/skeleton";
import { SettingsPanel } from "@/components/settings/settings-section";

/** Holds a panel's space while Clerk loads the signed-in user, so the page doesn't jump. */
export function PanelSkeleton({ title, description }: { title: string; description?: string }) {
  return (
    <SettingsPanel title={title} description={description}>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-2/3" />
    </SettingsPanel>
  );
}
