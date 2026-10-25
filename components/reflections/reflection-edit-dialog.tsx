"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReflectionEditorFields } from "./reflection-editor-fields";
import { LibraryPicker } from "./library-picker";
import { draftFromLibrary, type ReflectionDraft } from "./reflection-draft";

/**
 * Edit one reflection (a program day or a scheduled group) by writing it or
 * picking from the library. `onSave` resolves true when the dialog may close.
 */
export function ReflectionEditDialog({
  open,
  onOpenChange,
  title,
  description,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initial: ReflectionDraft;
  onSave: (draft: ReflectionDraft) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {/* Mounted per open, so the form always starts from `initial`. */}
        {open && <EditBody initial={initial} onCancel={() => onOpenChange(false)} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function EditBody({
  initial,
  onCancel,
  onSave,
}: {
  initial: ReflectionDraft;
  onCancel: () => void;
  onSave: (draft: ReflectionDraft) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(initial);
  const [tab, setTab] = useState<string>("write");
  const [isSaving, startSaving] = useTransition();

  return (
    <>
      <Tabs value={tab} onValueChange={(next) => setTab(String(next))} className="gap-4">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="library">From library</TabsTrigger>
        </TabsList>
        <TabsContent value="write">
          <ReflectionEditorFields value={draft} onChange={setDraft} />
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
              if (await onSave(draft)) onCancel();
            })
          }
          disabled={isSaving || draft.text.trim().length === 0}
        >
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
