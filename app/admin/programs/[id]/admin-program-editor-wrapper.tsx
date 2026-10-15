"use client";

import { ProgramEditor } from "@/components/programs/program-editor";
import { updateAdminProgramAction } from "@/actions/admin-program-actions";
import type { CreateProgramInput } from "@/lib/validators/program";

interface Props {
  program: Record<string, unknown>;
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
}

export function AdminProgramEditorWrapper({ program, exercises, title, backHref, notice }: Props) {
  async function handleSave(data: CreateProgramInput, programId?: string) {
    return updateAdminProgramAction(programId as string, data);
  }

  return (
    <ProgramEditor
      program={program}
      exercises={exercises}
      onSave={handleSave}
      title={title}
      backHref={backHref}
      notice={notice}
      redirectTo={`/admin/programs/${program.id}`}
    />
  );
}
