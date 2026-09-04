import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/messages", label: "Inbox" },
  { href: "/voice-messages", label: "Voice Messages" },
] as const;

export function MessagesTabNav({ active }: { active: "/messages" | "/voice-messages" }) {
  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            active === tab.href
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
