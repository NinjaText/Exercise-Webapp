"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, PlayCircle, ArrowRight, Bookmark } from "lucide-react";
import { ExerciseImage } from "@/components/exercises/exercise-image";
import { formatBodyRegion, formatDifficulty } from "@/lib/utils/formatting";
import { toggleExerciseFavoriteAction } from "@/actions/exercise-actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hasRealVideoUrl } from "@/lib/utils/video";
import { StatusBadge } from "@/components/shared/status-badge";
import { DIFFICULTY_ROLE } from "@/lib/ui/status";

interface ExerciseCardProps {
  id: string;
  name: string;
  bodyRegion: string[];
  difficultyLevel: string | null;
  exercisePhases?: string[];
  equipmentRequired: string[];
  description?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  isActive?: boolean;
  isTrainer?: boolean;
  isFavorite?: boolean;
}

const phaseConfig: Record<string, { label: string }> = {
  WARMUP: { label: "Warmup" },
  ACTIVATION: { label: "Activation" },
  STRENGTHENING: { label: "Strengthening" },
  MOBILITY: { label: "Mobility" },
  COOLDOWN: { label: "Cooldown" },
};

export function ExerciseCard({
  id, name, bodyRegion, difficultyLevel, exercisePhases, equipmentRequired,
  description, imageUrl, videoUrl, isActive, isTrainer,
  isFavorite,
}: ExerciseCardProps) {
  const [favorite, setFavorite] = useState(!!isFavorite);
  const [isTogglingFavorite, startTogglingFavorite] = useTransition();

  function handleToggleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !favorite;
    setFavorite(next);
    startTogglingFavorite(async () => {
      const result = await toggleExerciseFavoriteAction(id, next);
      if (!result.success) {
        setFavorite(!next);
        toast.error(result.error);
      }
    });
  }

  const phases = (exercisePhases ?? []).map((p) => phaseConfig[p] ?? { label: p });

  return (
    <Card className={cn(
      "group relative flex flex-col gap-0 overflow-hidden py-0 transition-shadow duration-200 hover:shadow-sm hover:ring-border-strong motion-reduce:transition-none",
      isActive === false && "opacity-60"
    )}>
      <Link href={`/exercises/${id}`} className="relative block h-44 overflow-hidden bg-muted">
        <ExerciseImage src={null} alt={name} videoUrl={videoUrl} label={name.split(" ").slice(0, 3).join(" ")} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex items-center gap-1.5 rounded-full bg-white/90 px-4 py-1.5 text-sm font-semibold text-foreground shadow-lg backdrop-blur-sm">
            <ArrowRight className="h-3.5 w-3.5" />
            View Exercise
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-2.5">
          {phases.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {phases.map((phase) => (
                <span
                  key={phase.label}
                  className="rounded-full bg-foreground/75 px-2 py-0.5 text-[10px] font-semibold text-background backdrop-blur-sm"
                >
                  {phase.label}
                </span>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {hasRealVideoUrl(videoUrl) && (
              <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                <PlayCircle className="h-3 w-3" />Video
              </span>
            )}
            {isActive === false && (
              <span className="rounded-full bg-foreground/70 px-2 py-0.5 text-[10px] font-medium text-white">Inactive</span>
            )}
          </div>
        </div>
      </Link>

      <CardContent className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/exercises/${id}`} className="flex-1 min-w-0">
            <h3 className="truncate text-label text-foreground transition-colors group-hover:text-primary">
              {name}
            </h3>
          </Link>
          <button
            type="button"
            onClick={handleToggleFavorite}
            disabled={isTogglingFavorite}
            title={favorite ? "Remove from favorites" : "Add to favorites"}
            className={cn(
              "shrink-0 rounded-md p-0.5 transition-colors disabled:opacity-60",
              favorite ? "text-warning" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Bookmark className={cn("h-4 w-4", favorite && "fill-current")} />
          </button>
          {difficultyLevel && (
            <StatusBadge
              status={difficultyLevel}
              label={formatDifficulty(difficultyLevel)}
              role={DIFFICULTY_ROLE[difficultyLevel] ?? "neutral"}
              size="sm"
              dot={false}
              className="shrink-0"
            />
          )}
        </div>

        <p className="mt-1 text-xs font-medium text-muted-foreground/70">{bodyRegion.map(formatBodyRegion).join(", ")}</p>

        {description && (
          <p className="mt-2 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}

        {equipmentRequired.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {equipmentRequired.slice(0, 3).map((eq) => (
              <Badge key={eq} variant="outline" className="h-5 px-1.5 text-[10px] font-medium text-muted-foreground">
                {eq}
              </Badge>
            ))}
            {equipmentRequired.length > 3 && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">
                +{equipmentRequired.length - 3}
              </Badge>
            )}
          </div>
        )}

        {isTrainer && (
          <div className="mt-3 flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 gap-1.5 text-caption font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
              asChild
            >
              <Link href={`/exercises/${id}/edit`}>
                <Edit className="h-3 w-3" />Edit
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
