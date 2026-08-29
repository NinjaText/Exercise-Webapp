"use client";

import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pencil, Sparkles, Upload, Library } from "lucide-react";

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => router.push("/programs/new")}>
          <Pencil className="mr-2 h-4 w-4 text-muted-foreground" />
          Start from scratch
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(generateHref)}>
          <Sparkles className="mr-2 h-4 w-4 text-blue-600" />
          Generate with AI
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/programs/upload")}>
          <Upload className="mr-2 h-4 w-4 text-emerald-600" />
          Upload a program/document
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => (onUseTemplate ? onUseTemplate() : router.push("/programs?tab=templates"))}>
          <Library className="mr-2 h-4 w-4 text-muted-foreground" />
          Use a template
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
