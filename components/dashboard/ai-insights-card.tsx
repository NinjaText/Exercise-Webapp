import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { AiInsightsList } from "@/components/dashboard/ai-insights-list";

export function AiInsightsCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4.5 w-4.5 text-primary" />
          <CardTitle className="text-base font-semibold">AI Insights</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <AiInsightsList />
      </CardContent>
    </Card>
  );
}
