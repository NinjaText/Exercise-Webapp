"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bookmark, Pencil, Plus, Trash2 } from "lucide-react";
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
import { SettingsPanel, SettingsPanels } from "@/components/settings/settings-section";
import { EquipmentPicker } from "@/components/equipment/equipment-picker";
import {
  deleteEquipmentProfileAction,
  saveEquipmentProfileAction,
  saveMyEquipmentAction,
  type MyEquipment,
} from "@/actions/equipment-profile-actions";
import type { EquipmentProfileView } from "@/lib/services/equipment-profile.service";
import { EQUIPMENT_PRESETS, equipmentCount } from "@/lib/utils/equipment-catalog";

function sameItems(a: string[], b: string[]) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function countLabel(items: readonly string[]) {
  const n = equipmentCount(items);
  return n === 0 ? "No equipment" : `${n} piece${n === 1 ? "" : "s"} of equipment`;
}

export function EquipmentSettings({
  profiles,
  myEquipment,
}: {
  profiles: EquipmentProfileView[];
  /** Set for clients only: the equipment their programs are planned around. */
  myEquipment: MyEquipment | null;
}) {
  return (
    <SettingsPanels>
      {myEquipment && <MyEquipmentPanel initial={myEquipment} profiles={profiles} />}
      <ProfilesPanel profiles={profiles} />
      <SettingsPanel
        title="Built-in setups"
        description="Available to everyone. Pick one in any equipment picker, then add or remove items."
      >
        <ul className="divide-y divide-border">
          {EQUIPMENT_PRESETS.map((preset) => (
            <li key={preset.id} className="flex flex-col gap-0.5 py-2.5 first:pt-0 last:pb-0">
              <span className="text-body font-medium text-foreground">{preset.name}</span>
              <span className="text-caption">
                {countLabel(preset.items)} · {preset.description}
              </span>
            </li>
          ))}
        </ul>
      </SettingsPanel>
    </SettingsPanels>
  );
}

function MyEquipmentPanel({ initial, profiles }: { initial: MyEquipment; profiles: EquipmentProfileView[] }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [items, setItems] = useState(initial.items);
  const [setupName, setSetupName] = useState(initial.setupName);
  const [saving, setSaving] = useState(false);
  const dirty = !sameItems(items, saved.items);

  async function save() {
    setSaving(true);
    const res = await saveMyEquipmentAction(items, setupName);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setSaved(res.data);
    toast.success("Equipment saved");
    router.refresh();
  }

  return (
    <SettingsPanel
      title="Your equipment"
      description="What you have where you train. Your workouts are planned around it."
      footerHint={dirty ? "You have unsaved changes." : saved.setupName ? `Current setup: ${saved.setupName}` : undefined}
      footer={
        <Button type="button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save equipment"}
        </Button>
      }
    >
      <EquipmentPicker
        value={items}
        profiles={profiles}
        onChange={(next, name) => {
          setItems(next);
          setSetupName(name);
        }}
      />
    </SettingsPanel>
  );
}

function ProfilesPanel({ profiles }: { profiles: EquipmentProfileView[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<EquipmentProfileView | "new" | null>(null);
  const [deleting, setDeleting] = useState<EquipmentProfileView | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const res = await deleteEquipmentProfileAction(deleting.id);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Deleted "${deleting.name}"`);
    setDeleting(null);
    router.refresh();
  }

  return (
    <SettingsPanel
      title="My equipment profiles"
      description="Your own named lists, like “My Garage” or “Downtown Studio”. They show up next to the built-in setups wherever you pick equipment."
      footer={
        <Button type="button" variant="outline" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New profile
        </Button>
      }
    >
      {profiles.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border px-4 py-5">
          <Bookmark className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-body text-muted-foreground">No saved profiles yet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {profiles.map((profile) => (
            <li key={profile.id} className="flex items-center gap-3 bg-surface py-2.5 pr-2 pl-3">
              <Bookmark className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-foreground">{profile.name}</p>
                <p className="truncate text-caption">
                  {countLabel(profile.items)} · {profile.items.slice(0, 6).join(", ")}
                  {profile.items.length > 6 ? "…" : ""}
                </p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${profile.name}`} onClick={() => setEditing(profile)}>
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${profile.name}`}
                className="text-muted-foreground hover:text-danger-foreground"
                onClick={() => setDeleting(profile)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ProfileEditorDialog
          profile={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              Only the saved profile is removed. Equipment already given to clients or programs doesn&apos;t change.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void confirmDelete()}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPanel>
  );
}

function ProfileEditorDialog({
  profile,
  onClose,
  onSaved,
}: {
  profile: EquipmentProfileView | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [items, setItems] = useState<string[]>(profile?.items ?? []);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await saveEquipmentProfileAction({ id: profile?.id, name, items });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(profile ? "Profile updated" : `Saved "${res.data.name}"`);
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{profile ? "Edit profile" : "New equipment profile"}</DialogTitle>
          <DialogDescription>Start from a built-in setup if you like, then add or remove items.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="profile-editor-name">Name</Label>
          <Input
            id="profile-editor-name"
            value={name}
            maxLength={60}
            placeholder="e.g. My Garage"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <EquipmentPicker value={items} allowSave={false} profiles={[]} onChange={(next) => setItems(next)} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!name.trim() || items.length === 0 || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
