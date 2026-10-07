import { nullOrUnset } from "@/lib/db/mongo-null";
import { getProgramSchedulingType, type ProgramSchedulingTypeValue } from "@/lib/utils/program-scheduling";

type ClubProgramCandidate = {
  id: string;
  name: string;
  isGlobal: boolean;
  schedulingType: string | null;
};

/**
 * Programs the club's starter and resource pickers can show: Global Programs,
 * the club trainer's own templates (any of their programs with no client), and
 * always the club's current picks (an old trainer's template stays visible, so
 * saving while the club has no trainer can't drop it).
 */
export function clubProgramWhere(currentIds: string[], trainerId: string | null) {
  return {
    OR: [
      { isGlobal: true },
      ...(trainerId ? [{ isGlobal: false, trainerId, ...nullOrUnset("clientId") }] : []),
      ...(currentIds.length > 0 ? [{ id: { in: currentIds } }] : []),
    ],
  };
}

function optionsOfType(programs: ClubProgramCandidate[], currentIds: string[], type: ProgramSchedulingTypeValue) {
  return programs
    .filter((p) => getProgramSchedulingType(p) === type || currentIds.includes(p.id))
    .map(({ id, name, isGlobal }) => ({ id, name: isGlobal ? name : `${name} (trainer's)` }));
}

/** Scheduled programs only, except current starters which stay visible even if they stopped qualifying. */
export function starterOptions(programs: ClubProgramCandidate[], starterProgramIds: string[]) {
  return optionsOfType(programs, starterProgramIds, "SCHEDULED");
}

/** Resources (on-demand) only, except current resources which stay visible even if they stopped qualifying. */
export function resourceOptions(programs: ClubProgramCandidate[], resourceProgramIds: string[]) {
  return optionsOfType(programs, resourceProgramIds, "ON_DEMAND");
}
