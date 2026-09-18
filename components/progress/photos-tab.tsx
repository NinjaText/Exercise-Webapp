"use client";

import { useState } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Camera, ImageOff, Trash2 } from "lucide-react";
import { deleteProgressPhotoAction } from "@/actions/progress-actions";

interface ProgressPhoto {
  id: string;
  imageUrl: string;
  angle?: string | null;
  notes?: string | null;
  recordedAt: Date | string;
}

interface PhotosTabProps {
  photos: ProgressPhoto[];
  clientId: string;
}

const ANGLE_COLORS: Record<string, string> = {
  Front: "border-info-border bg-info-soft text-info-foreground",
  Back: "border-brand-border bg-brand-soft text-brand-foreground",
  Side: "border-success-border bg-success-soft text-success-foreground",
};

function groupByMonth(photos: ProgressPhoto[]): Map<string, ProgressPhoto[]> {
  const map = new Map<string, ProgressPhoto[]>();
  for (const photo of photos) {
    const key = format(new Date(photo.recordedAt), "MMMM yyyy");
    const group = map.get(key) ?? [];
    group.push(photo);
    map.set(key, group);
  }
  return map;
}

export function PhotosTab({ photos, clientId: _clientId }: PhotosTabProps) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [localPhotos, setLocalPhotos] = useState<ProgressPhoto[]>(photos);

  async function handleDelete(photoId: string) {
    setDeleting(photoId);
    const result = await deleteProgressPhotoAction(photoId);
    if (result.success) {
      setLocalPhotos((prev) => prev.filter((p) => p.id !== photoId));
    }
    setDeleting(null);
  }

  if (localPhotos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <div className="rounded-full bg-muted p-4">
          <Camera className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-base font-medium text-muted-foreground">
          No progress photos yet
        </p>
        <p className="text-sm text-muted-foreground/70">
          Photos will appear here once the client uploads them.
        </p>
      </div>
    );
  }

  const grouped = groupByMonth(localPhotos);

  return (
    <div className="space-y-8">
      {Array.from(grouped.entries()).map(([month, monthPhotos]) => (
        <div key={month}>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {month}
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {monthPhotos.map((photo) => (
              <div key={photo.id} className="group relative">
                <div className="relative aspect-square overflow-hidden rounded-xl border border-border/50 shadow-sm">
                  {photo.imageUrl ? (
                    <Image
                      src={photo.imageUrl}
                      alt={`Progress photo — ${photo.angle ?? "general"}`}
                      fill
                      className="object-cover rounded-xl transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-muted">
                      <ImageOff className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}

                  {/* Delete overlay */}
                  <div className="absolute inset-0 flex items-start justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-7 w-7 shadow-md"
                      disabled={deleting === photo.id}
                      onClick={() => handleDelete(photo.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Meta below the image */}
                <div className="mt-1.5 space-y-0.5 px-0.5">
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(photo.recordedAt), "MMM d, yyyy")}
                  </p>
                  {photo.angle && (
                    <Badge
                      variant="outline"
                      className={`text-xs ${ANGLE_COLORS[photo.angle] ?? ""}`}
                    >
                      {photo.angle}
                    </Badge>
                  )}
                  {photo.notes && (
                    <p className="text-xs text-muted-foreground/80 line-clamp-2">
                      {photo.notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
