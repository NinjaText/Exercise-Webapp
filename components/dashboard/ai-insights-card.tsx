import { Sparkles } from "lucide-react";
import { SectionCard } from "@/components/shared/section-card";
import { AiInsightsList } from "@/components/dashboard/ai-insights-list";

export function AiInsightsCard() {
  return (
    <SectionCard title="AI Insights" icon={Sparkles}>
      {/* Collapsing happens per insight inside the list, not on the whole card —
          a trainer scans several clients here and opens the one they'll act on. */}
      <AiInsightsList />
    </SectionCard>
  );
}
