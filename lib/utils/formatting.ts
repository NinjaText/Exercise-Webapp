export function formatFeedbackRating(rating: string): string {
  const map: Record<string, string> = {
    FELT_GOOD: "Felt Good",
    MILD_DISCOMFORT: "Mild Discomfort",
    PAINFUL: "Painful",
    UNSURE_HOW_TO_PERFORM: "Unsure How to Perform",
  };
  return map[rating] || rating;
}

export function formatBodyRegion(region: string): string {
  const map: Record<string, string> = {
    LOWER_BODY: "Lower Body",
    UPPER_BODY: "Upper Body",
    CORE: "Core",
    FULL_BODY: "Full Body",
    BALANCE: "Balance",
    FLEXIBILITY: "Flexibility",
  };
  return map[region] || region;
}

export function formatDifficulty(level: string | null | undefined): string {
  if (!level) return "Not set";
  const map: Record<string, string> = {
    BEGINNER: "Beginner",
    INTERMEDIATE: "Intermediate",
    ADVANCED: "Advanced",
  };
  return map[level] || level;
}

export function formatPlanStatus(status: string): string {
  const map: Record<string, string> = {
    DRAFT: "Draft",
    ACTIVE: "Active",
    PAUSED: "Paused",
    COMPLETED: "Completed",
    ARCHIVED: "Archived",
  };
  return map[status] || status;
}

export function formatSessionStatus(status: string): string {
  const map: Record<string, string> = {
    SCHEDULED: "Scheduled",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    MISSED: "Missed",
    ABANDONED: "Abandoned",
  };
  return map[status] || status;
}

export function formatUserRole(role: string): string {
  const map: Record<string, string> = {
    TRAINER: "Trainer",
    CLIENT: "Client",
  };
  return map[role] || role;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function formatAssessmentType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}
