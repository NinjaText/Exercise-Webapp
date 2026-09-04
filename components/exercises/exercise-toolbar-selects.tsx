"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ExerciseToolbarSelects({
  activeSource,
  sort,
  sourceUrls,
  sortUrls,
}: {
  activeSource: "UNIVERSAL" | "ORGANIZATION";
  sort: "name_asc" | "name_desc";
  /** Precomputed hrefs for each option — built server-side since plain functions can't cross the server/client boundary. */
  sourceUrls: Record<"UNIVERSAL" | "ORGANIZATION", string>;
  sortUrls: Record<"name_asc" | "name_desc", string>;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <Select
        value={activeSource}
        onValueChange={(v) => v && router.push(sourceUrls[v as "UNIVERSAL" | "ORGANIZATION"])}
      >
        <SelectTrigger className="w-44" size="sm">
          <SelectValue>{activeSource === "ORGANIZATION" ? "Library: My Organization" : "Library: Universal"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="UNIVERSAL">Library: Universal</SelectItem>
          <SelectItem value="ORGANIZATION">Library: My Organization</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={sort}
        onValueChange={(v) => v && router.push(sortUrls[v as "name_asc" | "name_desc"])}
      >
        <SelectTrigger className="w-32" size="sm">
          <SelectValue>{sort === "name_desc" ? "Sort: Z-A" : "Sort: A-Z"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="name_asc">Sort: A-Z</SelectItem>
          <SelectItem value="name_desc">Sort: Z-A</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
