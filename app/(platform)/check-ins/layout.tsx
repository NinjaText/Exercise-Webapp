import { requireCapability } from "@/lib/org-capabilities.server";

/** Club orgs are self-guided: no check-ins (lib/org-capabilities.ts). */
export default async function CheckInsLayout({ children }: { children: React.ReactNode }) {
  await requireCapability("checkIns");
  return children;
}
