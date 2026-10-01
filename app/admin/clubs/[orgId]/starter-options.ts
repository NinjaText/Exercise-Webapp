import { getProgramSchedulingType } from "@/lib/utils/program-scheduling";

type StarterCandidate = {
  id: string;
  name: string;
  isGlobal: boolean;
  schedulingType: string | null;
  isTemplate?: boolean;
};

/**
 * Programs the starter picker can show: Global Programs, the club trainer's
 * own templates, and always the club's current starters (an old trainer's
 * template stays visible, so saving while the club has no trainer can't drop it).
 */
export function starterProgramWhere(starterProgramIds: string[], trainerId: string | null) {
  return {
    OR: [
      { isGlobal: true },
      ...(trainerId ? [{ isTemplate: true, isGlobal: false, trainerId }] : []),
      ...(starterProgramIds.length > 0 ? [{ id: { in: starterProgramIds } }] : []),
    ],
  };
}

/** Scheduled programs only, except current starters which stay visible even if they stopped qualifying. */
export function starterOptions(programs: StarterCandidate[], starterProgramIds: string[]) {
  return programs
    .filter((p) => getProgramSchedulingType(p) === "SCHEDULED" || starterProgramIds.includes(p.id))
    .map(({ id, name, isGlobal }) => ({ id, name: isGlobal ? name : `${name} (trainer's)` }));
}
