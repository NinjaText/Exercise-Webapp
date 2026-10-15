"use client";

import { ProgramEditor } from "@/components/programs/program-editor";
import {
  createGlobalProgramAction,
  updateGlobalProgramAction,
} from "@/actions/global-program-actions";
import type { CreateProgramInput } from "@/lib/validators/program";

interface Props {
  program?: Record<string, unknown>;
  exercises: {
    id: string;
    name: string;
    bodyRegion: string[];
    difficultyLevel: string | null;
    defaultReps?: number | null;
    musclesTargeted?: string[];
    imageUrl?: string | null;
    equipmentRequired?: string[];
  }[];
  title?: string;
  backHref?: string;
  notice?: string;
  clinics?: { id: string; name: string }[];
}

export function GlobalProgramEditorWrapper({ program, exercises, clinics, title, backHref, notice }: Props) {
  async function handleSave(data: CreateProgramInput, programId?: string) {
    if (programId) {
      return updateGlobalProgramAction(programId, data);
    }
    return createGlobalProgramAction(data);
  }

  return (
    <ProgramEditor
      program={program}
      exercises={exercises}
      clinics={clinics}
      onSave={handleSave}
      title={title}
      backHref={backHref}
      notice={notice}
      redirectTo="/admin/global-programs"
    />
  );
}
