"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReflectionEditorFields } from "./reflection-editor-fields";
import { LibraryPicker } from "./library-picker";
import { draftFromLibrary, type ReflectionDraft } from "./reflection-draft";
import { ImageShareField, NO_IMAGE_SHARE, resolveSharedDays, type ShareableDay } from "./image-share-field";

export interface ReflectionSaveOptions {
  /** Other program days that should take this reflection's image too. */
  shareImageWithDays: number[];
}

/**
 * Edit one reflection (a program day or a scheduled group) by writing it or
 * picking from the library. `onSave` resolves true when the dialog may close.
 * Pass `shareableDays` (program plans) to offer reusing the image on other days.
 */
export function ReflectionEditDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  shareableDays,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initial: ReflectionDraft;
  shareableDays?: ShareableDay[];
  onSave: (draft: ReflectionDraft, options: ReflectionSaveOptions) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {/* Mounted per open, so the form always starts from `initial`. */}
        {open && (
          <EditBody initial={initial} shareableDays={shareableDays ?? []} onCancel={() => onOpenChange(false)} onSave={onSave} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditBody({
  initial,
  shareableDays,
  onCancel,
  onSave,
}: {
  initial: ReflectionDraft;
  shareableDays: ShareableDay[];
  onCancel: () => void;
  onSave: (draft: ReflectionDraft, options: ReflectionSaveOptions) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(initial);
  const [imageShare, setImageShare] = useState(NO_IMAGE_SHARE);
  const canShareImage = Boolean(draft.imageUrl) && shareableDays.length > 0;
  const shareImageWithDays = canShareImage ? resolveSharedDays(imageShare, shareableDays) : [];
  const shareIncomplete = canShareImage && imageShare.enabled && shareImageWithDays.length === 0;
  const [tab, setTab] = useState<string>("write");
  const [isSaving, startSaving] = useTransition();

  return (
    <>
      <Tabs value={tab} onValueChange={(next) => setTab(String(next))} className="gap-4">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="library">From library</TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="flex flex-col gap-5">
          <ReflectionEditorFields value={draft} onChange={setDraft} />
          {canShareImage && <ImageShareField days={shareableDays} value={imageShare} onChange={setImageShare} />}
        </TabsContent>
        <TabsContent value="library">
          <LibraryPicker
            onPick={(entry) => {
              // Keep the trainer's response settings and image; swap the words.
              setDraft({ ...draftFromLibrary(entry), imageUrl: draft.imageUrl, allowJournal: draft.allowJournal, allowShare: draft.allowShare });
              setTab("write");
            }}
          />
        </TabsContent>
      </Tabs>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          onClick={() =>
            startSaving(async () => {
              if (await onSave(draft, { shareImageWithDays })) onCancel();
            })
          }
          disabled={isSaving || draft.text.trim().length === 0 || shareIncomplete}
        >
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
