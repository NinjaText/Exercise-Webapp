import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface FeedbackSummaryProps {
  feedback: Array<{ rating: string; comment: string | null; createdAt: Date }>;
}

export function FeedbackSummary({ feedback }: FeedbackSummaryProps) {
  if (feedback.length === 0) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-muted-foreground text-sm text-center">No feedback yet</p>
        </CardContent>
      </Card>
    );
  }

  const total = feedback.length;
  const feltGood = feedback.filter((f) => f.rating === "felt_good").length;
  const mildDiscomfort = feedback.filter((f) => f.rating === "mild_discomfort").length;
  const painful = feedback.filter((f) => f.rating === "painful").length;
  const unsure = feedback.filter((f) => f.rating === "unsure_how_to_perform").length;

  const ratings = [
    { label: "Felt Good", count: feltGood, color: "bg-success" },
    { label: "Mild Discomfort", count: mildDiscomfort, color: "bg-warning" },
    { label: "Painful", count: painful, color: "bg-danger" },
    { label: "Unsure", count: unsure, color: "bg-info" },
  ];

  const lastComment = feedback.find((f) => f.comment)?.comment;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Feedback Summary ({total} responses)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {ratings.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-sm">
            <span className="w-28 text-muted-foreground">{r.label}</span>
            <Progress
              value={total > 0 ? (r.count / total) * 100 : 0}
              className="flex-1 h-2"
            />
            <span className="w-8 text-right text-muted-foreground">{r.count}</span>
          </div>
        ))}
        {lastComment && (
          <p className="text-xs text-muted-foreground mt-3 italic">
            Latest: "{lastComment}"
          </p>
        )}
      </CardContent>
    </Card>
  );
}
