"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bookmark,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  Home,
  Luggage,
  PersonStanding,
  Search,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  EQUIPMENT_CATALOG,
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_PRESETS,
  equipmentCount,
  isBodyweightOnly,
  matchEquipmentSetup,
  type EquipmentPresetId,
} from "@/lib/utils/equipment-catalog";
import {
  listMyEquipmentProfilesAction,
  saveEquipmentProfileAction,
} from "@/actions/equipment-profile-actions";
import type { EquipmentProfileView } from "@/lib/services/equipment-profile.service";

const PRESET_ICONS: Record<EquipmentPresetId, LucideIcon> = {
  "full-gym": Dumbbell,
  "commercial-gym": Building2,
  "home-gym": Home,
  minimal: Luggage,
  bodyweight: PersonStanding,
};

export interface EquipmentPickerProps {
  value: string[];
  /** `setupName` is the preset or saved profile the new selection matches, else null. */
  onChange: (items: string[], setupName: string | null) => void;
  /**
   * What "bodyweight only" is written as: "None" on client profiles (the
   * default), the lowercase "none" sentinel in the program form.
   */
  noneValue?: string;
  /** Selectable items outside the catalogue (e.g. library-only labels), shown under "Other". */
  extraItems?: string[];
  /** The preset + saved-profile list at the top. */
  showSetups?: boolean;
  /** The "Save as my profile" button. */
  allowSave?: boolean;
  /** Pass the user's profiles when the parent already has them; otherwise they're fetched. */
  profiles?: EquipmentProfileView[];
  className?: string;
}

/**
 * One equipment selector for every form: pick a built-in setup or a saved
 * profile to fill the whole list, then fine-tune individual items.
 */
export function EquipmentPicker({
  value,
  onChange,
  noneValue = "None",
  extraItems = [],
  showSetups = true,
  allowSave = true,
  profiles: profilesProp,
  className,
}: EquipmentPickerProps) {
  // Fetched only when the parent didn't pass profiles; `added` holds ones saved here.
  const [fetched, setFetched] = useState<EquipmentProfileView[]>([]);
  const [added, setAdded] = useState<EquipmentProfileView[]>([]);
  const [search, setSearch] = useState("");
  // Categories that already hold a selection start open, so it's visible.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const picked = new Set(value.map((v) => v.trim().toLowerCase()));
    return new Set(
      EQUIPMENT_CATEGORIES.filter((c) => c.items.some((i) => picked.has(i.toLowerCase()))).map((c) => c.id)
    );
  });
  const [saveOpen, setSaveOpen] = useState(false);

  const shouldFetch = profilesProp === undefined && showSetups;
  useEffect(() => {
    if (!shouldFetch) return;
    let cancelled = false;
    listMyEquipmentProfilesAction().then((res) => {
      if (!cancelled && res.ok) setFetched(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldFetch]);

  const profiles = useMemo(() => {
    const base = profilesProp ?? fetched;
    const ids = new Set(base.map((p) => p.id));
    return [...base, ...added.filter((p) => !ids.has(p.id))].sort((a, b) => a.name.localeCompare(b.name));
  }, [profilesProp, fetched, added]);

  const selected = useMemo(() => new Set(value.map((v) => v.trim().toLowerCase())), [value]);
  const bodyweight = isBodyweightOnly(value);
  const activeSetup = matchEquipmentSetup(value, profiles);

  // Anything selectable that isn't in the catalogue: extra options plus
  // whatever the current value already holds (so it can still be removed).
  const otherItems = useMemo(() => {
    const known = new Set(EQUIPMENT_CATALOG.map((i) => i.toLowerCase()));
    const seen = new Set<string>();
    return [...extraItems, ...value].filter((item) => {
      const key = item.trim().toLowerCase();
      if (!key || key === "none" || known.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [extraItems, value]);

  const categories = useMemo(
    () => [
      ...EQUIPMENT_CATEGORIES,
      ...(otherItems.length > 0 ? [{ id: "other", label: "Other", items: otherItems }] : []),
    ],
    [otherItems]
  );

  const query = search.trim().toLowerCase();

  function emit(items: string[]) {
    onChange(items, matchEquipmentSetup(items, profiles));
  }

  function applySetup(items: readonly string[]) {
    emit(isBodyweightOnly(items) ? [noneValue] : [...items]);
  }

  function toggleItem(item: string) {
    const key = item.toLowerCase();
    const real = value.filter((v) => !isBodyweightOnly([v]));
    emit(selected.has(key) ? real.filter((v) => v.toLowerCase() !== key) : [...real, item]);
  }

  function toggleCategory(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const count = equipmentCount(value);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {showSetups && (
        <div className="flex flex-col gap-2">
          <p className="text-label text-foreground">Start from</p>
          <div role="radiogroup" aria-label="Equipment setup" className="grid gap-2 sm:grid-cols-2">
            {EQUIPMENT_PRESETS.map((preset) => (
              <SetupOption
                key={preset.id}
                icon={PRESET_ICONS[preset.id]}
                name={preset.name}
                count={equipmentCount(preset.items)}
                active={activeSetup === preset.name}
                onSelect={() => applySetup(preset.items)}
              />
            ))}
            {profiles.map((profile) => (
              <SetupOption
                key={profile.id}
                icon={Bookmark}
                name={profile.name}
                count={equipmentCount(profile.items)}
                active={activeSetup === profile.name}
                hint="Your profile"
                onSelect={() => applySetup(profile.items)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-label text-foreground">
            {bodyweight ? "Bodyweight only" : `Equipment (${count} selected)`}
            {activeSetup && !bodyweight && (
              <span className="ml-1.5 text-caption font-normal">· {activeSetup}</span>
            )}
          </p>
          {value.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => emit([])}>
              Clear
            </Button>
          )}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Search equipment"
            placeholder="Search equipment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {categories.map((category) => {
            const items = query
              ? category.items.filter((item) => item.toLowerCase().includes(query))
              : category.items;
            if (items.length === 0) return null;
            const picked = category.items.filter((item) => selected.has(item.toLowerCase())).length;
            const open = query.length > 0 || expanded.has(category.id);
            const Chevron = open ? ChevronDown : ChevronRight;
            return (
              <div key={category.id} className="bg-surface">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggleCategory(category.id)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left outline-none hover:bg-surface-muted focus-visible:bg-surface-muted"
                >
                  <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex-1 text-body font-medium text-foreground">{category.label}</span>
                  <span className="text-caption tabular-nums">
                    {picked}/{category.items.length}
                  </span>
                </button>
                {open && (
                  <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                    {items.map((item) => {
                      const isOn = selected.has(item.toLowerCase());
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={isOn}
                          onClick={() => toggleItem(item)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                            isOn
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {allowSave && value.length > 0 && !activeSetup && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
              <Bookmark className="size-4" /> Save as my profile
            </Button>
          </div>
        )}
      </div>

      {allowSave && (
        <SaveProfileDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          items={value}
          onSaved={(profile) => {
            setAdded((prev) => [...prev, profile]);
            onChange(value, profile.name);
          }}
        />
      )}
    </div>
  );
}

function SetupOption({
  icon: Icon,
  name,
  count,
  active,
  hint,
  onSelect,
}: {
  icon: LucideIcon;
  name: string;
  count: number;
  active: boolean;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none motion-reduce:transition-none",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        active ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-surface-muted"
      )}
    >
      <Icon className={cn("size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-medium text-foreground">{name}</span>
        <span className="block text-caption">
          {count === 0 ? "No equipment" : `${count} piece${count === 1 ? "" : "s"} of equipment`}
          {hint && ` · ${hint}`}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border",
          active ? "border-primary bg-primary text-primary-foreground" : "border-border-strong"
        )}
      >
        {active && <Check className="size-3" />}
      </span>
    </button>
  );
}

function SaveProfileDialog({
  open,
  onOpenChange,
  items,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: string[];
  onSaved: (profile: EquipmentProfileView) => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await saveEquipmentProfileAction({ name, items });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Saved "${res.data.name}"`);
    onSaved(res.data);
    setName("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save equipment profile</DialogTitle>
          <DialogDescription>
            Save these {equipmentCount(items)} items under a name so you can pick them in one click next time.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="equipment-profile-name">Name</Label>
          <Input
            id="equipment-profile-name"
            value={name}
            maxLength={60}
            placeholder="e.g. My Garage, Downtown Studio"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (name.trim() && !saving) void save();
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!name.trim() || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
