import { requireCapability } from "@/lib/org-capabilities.server";

/** Club orgs are self-guided: no inbox (lib/org-capabilities.ts). */
export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  await requireCapability("messaging");
  return children;
}
