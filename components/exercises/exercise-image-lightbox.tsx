"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ExerciseImage } from "@/components/exercises/exercise-image";
import { ZoomIn } from "lucide-react";

interface ExerciseImageLightboxProps {
  src: string | null | undefined;
  videoUrl?: string | null;
  alt: string;
  bodyRegion: string;
  label?: string;
  /** Extra classes for the trigger thumbnail wrapper */
  thumbnailClassName?: string;
}

export function ExerciseImageLightbox({
  src,
  videoUrl,
  alt,
  bodyRegion,
  label,
  thumbnailClassName = "relative w-24 h-24 shrink-0",
}: ExerciseImageLightboxProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Clickable thumbnail */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${thumbnailClassName} bg-muted overflow-hidden group cursor-zoom-in`}
        title="Click to enlarge"
      >
        <ExerciseImage
          src={src}
          alt={alt}
          bodyRegion={bodyRegion}
          videoUrl={videoUrl}
          label={label}
        />
        {/* Zoom hint overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
          <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
        </div>
      </button>

      {/* Full-size lightbox dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl p-2 overflow-hidden">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <div className="relative w-full rounded-lg overflow-hidden bg-foreground/90">
            {/* 16:9 aspect container */}
            <div style={{ paddingTop: "56.25%", position: "relative" }}>
              <ExerciseImage
                src={src}
                alt={alt}
                bodyRegion={bodyRegion}
                videoUrl={videoUrl}
                label={label}
                className="absolute inset-0 h-full w-full object-contain"
                gradientClassName="absolute inset-0 flex items-center justify-center"
              />
            </div>
            <p className="px-4 py-2 text-sm font-medium text-white bg-black/60 truncate">
              {alt}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
