"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateReflectionImageUploadUrlAction } from "@/actions/reflection-actions";
import {
  REFLECTION_IMAGE_MAX_BYTES,
  REFLECTION_IMAGE_TYPES,
  type ReflectionImageType,
} from "@/lib/reflections/constants";

function isAllowedType(type: string): type is ReflectionImageType {
  return (REFLECTION_IMAGE_TYPES as readonly string[]).includes(type);
}

/** Optional reflection image: uploads straight to R2 through a presigned PUT. */
export function ReflectionImageField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    if (!isAllowedType(file.type)) {
      toast.error("Use a JPG, PNG or WebP image");
      return;
    }
    if (file.size > REFLECTION_IMAGE_MAX_BYTES) {
      toast.error("Images must be 5 MB or smaller");
      return;
    }

    setUploading(true);
    try {
      const presign = await generateReflectionImageUploadUrlAction({ contentType: file.type, fileSize: file.size });
      if (!presign.success) {
        toast.error(presign.error);
        return;
      }
      const response = await fetch(presign.data.presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!response.ok) {
        toast.error("Upload failed. Please try again.");
        return;
      }
      onChange(presign.data.fileUrl);
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="relative w-full overflow-hidden rounded-lg ring-1 ring-border sm:w-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Reflection image" className="aspect-video w-full object-cover" />
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            className="absolute top-2 right-2"
            aria-label="Remove image"
            onClick={() => onChange(null)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {uploading ? "Uploading…" : "Add image"}
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={REFLECTION_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <p className="text-caption text-muted-foreground">Optional · JPG, PNG or WebP up to 5 MB.</p>
    </div>
  );
}
