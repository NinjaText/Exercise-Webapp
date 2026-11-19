"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pencil, Sparkles, Upload, Library, PlayCircle } from "lucide-react";

interface CreateProgramMenuProps {
  /** Pre-select a client in the "Generate with AI" flow, e.g. from a client-specific alert. */
  clientId?: string;
  /** Called instead of navigating when "Use a template" is selected (e.g. to switch a local tab). */
  onUseTemplate?: () => void;
  /** The trigger element (typically a styled `<Button />`) that opens the menu. */
  trigger: ReactElement;
  /** Content rendered inside the trigger, e.g. an icon + label. */
  children: React.ReactNode;
}

export function CreateProgramMenu({ clientId, onUseTemplate, trigger, children }: CreateProgramMenuProps) {
  const router = useRouter();
  const generateHref = clientId ? `/programs/generate?clientId=${clientId}` : "/programs/generate";
  const newHref = clientId ? `/programs/new?clientId=${clientId}` : "/programs/new";
  const uploadHref = clientId ? `/programs/upload?clientId=${clientId}` : "/programs/upload";
  const followAlongHref = clientId ? `/programs/new/follow-along?clientId=${clientId}` : "/programs/new/follow-along";

  const items: { label: string; description: string; icon: typeof Pencil; iconClass: string; onSelect: () => void }[][] = [
    [
      {
        label: "Generate with AI",
        description: "Describe the client and goals; review the plan first",
        icon: Sparkles,
        iconClass: "bg-brand-soft text-brand",
        onSelect: () => router.push(generateHref),
      },
      {
        label: "Start from scratch",
        description: "Build week by week in the editor",
        icon: Pencil,
        iconClass: "bg-muted text-muted-foreground",
        onSelect: () => router.push(newHref),
      },
      {
        label: "Use a template",
        description: "Copy a program from your library",
        icon: Library,
        iconClass: "bg-muted text-muted-foreground",
        onSelect: () => (onUseTemplate ? onUseTemplate() : router.push("/programs?tab=templates")),
      },
    ],
    [
      {
        label: "Upload a document",
        description: "Turn a PDF, Word or text file into a program",
        icon: Upload,
        iconClass: "bg-success-soft text-success-foreground",
        onSelect: () => router.push(uploadHref),
      },
      {
        label: "Follow-along videos",
        description: "A program of full-length workout videos",
        icon: PlayCircle,
        iconClass: "bg-info-soft text-info-foreground",
        onSelect: () => router.push(followAlongHref),
      },
    ],
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-1.5">
        {items.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <DropdownMenuSeparator className="my-1.5" />}
            {group.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem key={item.label} onClick={item.onSelect} className="items-start gap-3 px-2 py-2">
                  <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md ${item.iconClass}`}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-label text-foreground">{item.label}</span>
                    <span className="block text-caption text-muted-foreground">{item.description}</span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
