export const ROUTES = {
  HOME: "/",
  SIGN_IN: "/sign-in",
  SIGN_UP: "/sign-up",
  ONBOARDING: "/onboarding",
  DASHBOARD: "/dashboard",
  EXERCISES: "/exercises",
  EXERCISE_DETAIL: (id: string) => `/exercises/${id}`,
  EXERCISE_NEW: "/exercises/new",
  PROGRAMS: "/programs",
  PROGRAM_DETAIL: (id: string) => `/programs/${id}`,
  PROGRAM_EDIT: (id: string) => `/programs/${id}/edit`,
  PROGRAM_NEW: "/programs/new",
  WORKOUT_PLANS: "/workout-plans",
  WORKOUT_PLAN_DETAIL: (id: string) => `/workout-plans/${id}`,
  WORKOUT_PLAN_EDIT: (id: string) => `/workout-plans/${id}/edit`,
  WORKOUT_PLAN_SESSION: (id: string) => `/workout-plans/${id}/session`,
  WORKOUT_PLAN_GENERATE: "/workout-plans/generate",
  CLIENTS: "/clients",
  CLIENT_DETAIL: (id: string) => `/clients/${id}`,
  CLIENT_ADHERENCE: (id: string) => `/clients/${id}/adherence`,
  CLIENT_OUTCOMES: (id: string) => `/clients/${id}/outcomes`,
  MESSAGES: "/messages",
  MESSAGE_THREAD: (id: string) => `/messages/${id}`,
  ASSESSMENTS: "/assessments",
  ASSESSMENT_NEW: "/assessments/new",
  SETTINGS: "/settings",
} as const;

export const BODY_REGIONS = [
  { value: "LOWER_BODY", label: "Lower Body" },
  { value: "UPPER_BODY", label: "Upper Body" },
  { value: "CORE", label: "Core" },
  { value: "FULL_BODY", label: "Full Body" },
  { value: "BALANCE", label: "Balance" },
  { value: "FLEXIBILITY", label: "Flexibility" },
] as const;

export const DIFFICULTY_LEVELS = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
] as const;

// Canonical muscle groups for filtering. `musclesTargeted` is a free-form String[]
// on the Exercise model, and the seeded data uses inconsistent casing and many
// anatomical sub-muscle names (e.g. "glutes", "Glutes", "gluteus maximus"). Each
// canonical group therefore carries the exact stored strings it should match under
// `aliases`, so filtering never silently misses rows due to a casing/spelling gap.
export const MUSCLE_GROUPS = [
  { value: "GLUTES", label: "Glutes", aliases: ["glutes", "Glutes", "gluteus maximus", "gluteus medius", "Gluteus Medius", "gluteus minimus", "gluteals"] },
  { value: "QUADRICEPS", label: "Quadriceps", aliases: ["quadriceps", "Quadriceps", "quads", "rectus femoris", "vastus medialis", "vastus medialis oblique", "vastus muscles"] },
  { value: "HAMSTRINGS", label: "Hamstrings", aliases: ["hamstrings", "Hamstrings", "biceps femoris", "semimembranosus", "semitendinosus"] },
  { value: "CALVES", label: "Calves", aliases: ["calves", "Calves", "gastrocnemius", "soleus"] },
  { value: "HIP_FLEXORS", label: "Hip Flexors", aliases: ["hip flexors", "Hip Flexors", "iliopsoas", "iliacus"] },
  { value: "ADDUCTORS", label: "Adductors", aliases: ["adductors", "Adductors", "adductor magnus", "adductor longus", "gracilis", "pectineus", "groin"] },
  { value: "HIP_ABDUCTORS", label: "Hip Abductors", aliases: ["hip abductors", "Hip Abductors", "tensor fasciae latae", "hip external rotators", "piriformis"] },
  { value: "ABDOMINALS", label: "Abdominals", aliases: ["rectus abdominis", "Rectus Abdominis", "obliques", "Obliques", "internal obliques", "external obliques", "transversus abdominis", "transverse abdominis", "Abdominals"] },
  { value: "CORE", label: "Core", aliases: ["core", "Core", "core stabilizers", "Core Stabilizers", "Core Muscles"] },
  { value: "LOWER_BACK", label: "Lower Back", aliases: ["erector spinae", "Erector Spinae", "lumbar extensors", "lumbar erectors", "Lower Back", "multifidus", "lumbar multifidus", "quadratus lumborum", "spinal extensors", "Spinal Erectors"] },
  { value: "CHEST", label: "Chest", aliases: ["pectoralis major", "Pectoralis Major", "pectoralis minor", "Pectoralis Minor", "pectorals", "Pectorals", "pectoral muscles", "Chest"] },
  { value: "LATS", label: "Lats", aliases: ["latissimus dorsi", "Latissimus Dorsi", "lats"] },
  { value: "TRAPEZIUS", label: "Trapezius", aliases: ["upper trapezius", "Upper Trapezius", "middle trapezius", "Middle Trapezius", "lower trapezius", "Lower Trapezius", "trapezius", "Trapezius", "mid traps"] },
  { value: "RHOMBOIDS", label: "Rhomboids", aliases: ["rhomboids", "Rhomboids"] },
  { value: "SERRATUS_ANTERIOR", label: "Serratus Anterior", aliases: ["serratus anterior", "Serratus Anterior"] },
  { value: "DELTOIDS", label: "Deltoids", aliases: ["deltoids", "Deltoids", "deltoid", "Deltoid", "anterior deltoid", "Anterior Deltoid", "posterior deltoid", "Posterior Deltoid", "rear deltoid", "Rear Deltoids", "shoulders", "Shoulders"] },
  { value: "ROTATOR_CUFF", label: "Rotator Cuff", aliases: ["rotator cuff", "Rotator Cuff", "infraspinatus", "Infraspinatus", "supraspinatus", "Supraspinatus", "subscapularis", "Subscapularis", "teres minor", "Teres Minor"] },
  { value: "BICEPS", label: "Biceps", aliases: ["biceps", "Biceps", "biceps brachii", "brachialis", "brachioradialis"] },
  { value: "TRICEPS", label: "Triceps", aliases: ["triceps", "Triceps", "triceps brachii"] },
  { value: "FOREARMS", label: "Forearms", aliases: ["forearm muscles", "wrist flexors", "Wrist Flexors", "wrist extensors", "flexor carpi radialis", "flexor carpi ulnaris", "extensor carpi radialis brevis", "extensor carpi radialis longus", "grip"] },
  { value: "ANKLE_FOOT", label: "Ankle & Foot", aliases: ["ankle stabilizers", "ankle proprioceptors", "peroneals", "peroneal muscles", "tibialis anterior", "tibialis posterior", "foot intrinsics", "intrinsic foot muscles"] },
  { value: "NECK", label: "Neck", aliases: ["sternocleidomastoid", "deep cervical flexors", "cervical extensors", "Cervical Extensors", "Cervical Flexors", "cervical rotators", "levator scapulae", "Levator Scapulae", "scalenes", "Neck Muscles"] },
] as const;

const MUSCLE_ALIAS_BY_VALUE: Record<string, readonly string[]> = Object.fromEntries(
  MUSCLE_GROUPS.map((group) => [group.value, group.aliases])
);

/**
 * Expands canonical muscle-group codes (e.g. "HAMSTRINGS") into the exact
 * stored `musclesTargeted` strings they represent, so a Prisma `hasSome` query
 * matches the real (inconsistently-cased) data. Unknown codes pass through
 * unchanged so callers can still filter on raw values if needed.
 */
export function expandMuscleGroups(codes: string[]): string[] {
  const expanded = new Set<string>();
  for (const code of codes) {
    const aliases = MUSCLE_ALIAS_BY_VALUE[code];
    if (aliases) {
      for (const alias of aliases) expanded.add(alias);
    } else {
      expanded.add(code);
    }
  }
  return [...expanded];
}

export const PLAN_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
] as const;

export const FEEDBACK_RATINGS = [
  { value: "FELT_GOOD", label: "Felt Good" },
  { value: "MILD_DISCOMFORT", label: "Mild Discomfort" },
  { value: "PAINFUL", label: "Painful" },
  { value: "UNSURE_HOW_TO_PERFORM", label: "Unsure How to Perform" },
] as const;

export const USER_ROLES = [
  { value: "TRAINER", label: "Trainer" },
  { value: "CLIENT", label: "Client" },
] as const;

export const COMMON_EQUIPMENT = [
  "None",
  "Resistance Band",
  "Dumbbells",
  "Yoga Mat",
  "Stability Ball",
  "Foam Roller",
  "Chair",
  "Wall",
  "Towel",
  "Step/Stair",
] as const;

export const REHAB_GOALS = [
  "Reduce Pain",
  "Improve Mobility",
  "Build Strength",
  "Improve Balance",
  "Increase Flexibility",
  "Post-Surgery Recovery",
  "Injury Prevention",
  "Daily Function Improvement",
] as const;

export const PERFORMANCE_GOALS = [
  "Endurance / Cardio Fitness",
  "Event Prep (Race, Competition, etc.)",
  "Athletic Performance",
  "Muscle Building / Hypertrophy",
  "Weight Loss / Body Composition",
  "General Fitness Maintenance",
] as const;

/** Combined list — used where program type doesn't apply (client onboarding, other generators). */
export const FITNESS_GOALS = [...REHAB_GOALS, ...PERFORMANCE_GOALS] as const;

export const ASSESSMENT_TYPES = [
  { value: "pain_level", label: "Pain Level", unit: "/10" },
  { value: "range_of_motion", label: "Range of Motion", unit: "degrees" },
  { value: "strength", label: "Strength", unit: "/5" },
  { value: "balance", label: "Balance", unit: "seconds" },
  { value: "flexibility", label: "Flexibility", unit: "cm" },
  { value: "functional_score", label: "Functional Score", unit: "/100" },
] as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
