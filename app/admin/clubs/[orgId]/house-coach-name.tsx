"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { renameHouseCoachAction } from "@/actions/admin-club-actions";

const MAX = 80;

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter((w) => /[A-Za-z0-9]/.test(w[0] ?? ""))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** House coach avatar + name, with an inline editor for the display name. */
export function HouseCoachName({
  clerkOrgId,
  name,
  customName,
  defaultName,
}: {
  clerkOrgId: string;
  /** What members currently see. */
  name: string;
  /** The saved custom name, or null when the default is in use. */
  customName: string | null;
  /** "Coach <club name>": what an empty name falls back to. */
  defaultName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(customName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await renameHouseCoachAction(clerkOrgId, value);
        if (!res.ok) return setError(res.error);
        setEditing(false);
        router.refresh();
      } catch {
        setError("Couldn't save the name. Please try again.");
      }
    });

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-10">
          <AvatarFallback className="bg-brand-soft text-sm font-semibold text-brand-foreground">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <p className="min-w-0 flex-1 truncate text-body font-medium text-foreground">{name}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Edit house coach name"
          onClick={() => {
            setValue(customName ?? "");
            setError(null);
            setEditing(true);
          }}
        >
          <Pencil className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor="house-coach-name" className="text-caption font-medium text-foreground">
        Name members see
      </label>
      <Input
        id="house-coach-name"
        value={value}
        maxLength={MAX}
        placeholder={defaultName}
        autoFocus
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
      />
      <p className="text-caption text-muted-foreground">Leave empty to use &ldquo;{defaultName}&rdquo;.</p>
      {error && (
        <p role="alert" className="text-caption text-danger-foreground">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
