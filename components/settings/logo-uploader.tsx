"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useBrandAssetUpload } from "@/hooks/use-brand-asset-upload";
import { ACCEPTED_MIME, type AssetKind } from "@/lib/branding/asset-kinds";
import { cn } from "@/lib/utils";

export interface LogoUploaderProps {
  kind: AssetKind;
  label: string;
  hint: string;
  /** Surface the image is previewed on: light → `bg-card`, dark → `bg-sidebar` (always dark). */
  surface: "light" | "dark";
  /** Raw stored URL; may be a legacy external URL migrated from Clerk. */
  currentUrl: string | null;
  /**
   * `isOwnAssetUrl(currentUrl)`, computed on the SERVER: it reads
   * `CLOUDFLARE_R2_PUBLIC_URL`, which is not exposed to the browser, so calling
   * it here would always be false on the client (and mismatch on hydration).
   */
  currentIsOwn: boolean;
}

const PROGRESS: Partial<Record<string, string>> = {
  uploading: "Uploading…",
  confirming: "Saving…",
};

/**
 * One brand asset slot (spec §8): current image on its surface, drag-and-drop
 * or file picker, Replace/Remove. Server state is the source of truth — after a
 * confirm or remove we `router.refresh()` and render the new props.
 */
export function LogoUploader({ kind, label, hint, surface, currentUrl, currentIsOwn }: LogoUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { upload, remove, uploadState, error, removing, busy } = useBrandAssetUpload();

  const inputId = `brand-asset-${kind}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const showImage = currentIsOwn && !!currentUrl;
  const isLegacy = !!currentUrl && !currentIsOwn;
  const isMark = kind === "mark";
  const progress = removing ? "Removing…" : (PROGRESS[uploadState] ?? "");

  async function handleFile(file: File | undefined) {
    if (!file || busy) return;
    const result = await upload(kind, file);
    if (result) {
      toast.success(`${label} updated`);
      router.refresh();
    }
  }

  async function handleRemove() {
    setConfirmOpen(false);
    if (await remove(kind)) {
      toast.success(`${label} removed`);
      router.refresh();
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (busy) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    e.dataTransfer.dropEffect = "copy";
    setDragging(true);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </Label>

      <div
        onDragOver={handleDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        aria-busy={busy || undefined}
        className={cn(
          "flex h-24 items-center justify-center rounded-lg border border-dashed p-4 transition-colors",
          surface === "dark" ? "border-sidebar-border bg-sidebar" : "border-border bg-card",
          dragging && "border-primary ring-3 ring-ring/50",
          busy && "opacity-60",
        )}
      >
        {showImage ? (
          // Plain <img>, not next/image: these are small, immutable, already
          // re-encoded PNGs on our R2 host, so the optimizer adds a round trip
          // for nothing (the spec renders them `unoptimized` anyway), and a
          // plain tag keeps the settings page decoupled from `images` config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt={`Current ${label.toLowerCase()}`}
            width={isMark ? 64 : 256}
            height={64}
            className={cn("h-16 max-w-full object-contain", isMark ? "w-16" : "w-auto")}
          />
        ) : (
          <div
            className={cn(
              "flex flex-col items-center gap-1 text-center text-xs",
              surface === "dark" ? "text-sidebar-foreground/70" : "text-muted-foreground",
            )}
          >
            <ImageIcon className="size-5" aria-hidden="true" />
            <span>No image yet — drop a file here</span>
          </div>
        )}
      </div>

      {/* Visually hidden but labelled; the buttons below are the keyboard path, so it is out of the tab order. */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPTED_MIME.join(",")}
        className="sr-only"
        tabIndex={-1}
        disabled={busy}
        aria-describedby={error ? `${errorId} ${hintId}` : hintId}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Clear so choosing the same file again still fires a change.
          e.target.value = "";
          void handleFile(file);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-describedby={hintId}
        >
          {busy && !removing && <Loader2 className="animate-spin" aria-hidden="true" />}
          {showImage ? "Replace" : "Upload"}
        </Button>
        {currentUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
          >
            {removing && <Loader2 className="animate-spin" aria-hidden="true" />}
            Remove
          </Button>
        )}
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {progress}
        </span>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger-foreground">
          {error}
        </p>
      )}
      {isLegacy && (
        <p className="text-xs text-muted-foreground">
          Your previous logo is no longer shown anywhere. Upload it here to use it in the app and on
          PDFs.
        </p>
      )}
      <p id={hintId} className="text-xs text-muted-foreground">
        {hint}
      </p>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Remove ${label.toLowerCase()}?`}
        description="The fallback shown in its place is used right away. You can upload a new image at any time."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={handleRemove}
      />
    </div>
  );
}
