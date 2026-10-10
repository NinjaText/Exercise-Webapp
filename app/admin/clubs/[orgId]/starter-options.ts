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
 * the house coach's own templates (any of their programs with no client), and
 * always the club's current picks (a template that stopped qualifying stays
 * visible, so saving can't drop it).
 */
export function clubProgramWhere(currentIds: string[], houseCoachId: string | null) {
  return {
    OR: [
      { isGlobal: true },
      ...(houseCoachId ? [{ isGlobal: false, trainerId: houseCoachId, ...nullOrUnset("clientId") }] : []),
      ...(currentIds.length > 0 ? [{ id: { in: currentIds } }] : []),
    ],
  };
}

function optionsOfType(programs: ClubProgramCandidate[], currentIds: string[], type: ProgramSchedulingTypeValue) {
  return programs
    .filter((p) => getProgramSchedulingType(p) === type || currentIds.includes(p.id))
    .map(({ id, name, isGlobal }) => ({ id, name: isGlobal ? name : `${name} (house coach's)` }));
}

/** Scheduled programs only, except current starters which stay visible even if they stopped qualifying. */
export function starterOptions(programs: ClubProgramCandidate[], starterProgramIds: string[]) {
  return optionsOfType(programs, starterProgramIds, "SCHEDULED");
}

/** Resources (on-demand) only, except current resources which stay visible even if they stopped qualifying. */
export function resourceOptions(programs: ClubProgramCandidate[], resourceProgramIds: string[]) {
  return optionsOfType(programs, resourceProgramIds, "ON_DEMAND");
}
