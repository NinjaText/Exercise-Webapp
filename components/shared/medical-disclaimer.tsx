import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface MedicalDisclaimerProps {
  variant?: "banner" | "inline";
  className?: string;
}

export function MedicalDisclaimer({
  variant = "banner",
  className,
}: MedicalDisclaimerProps) {
  if (variant === "inline") {
    return (
      <p
        className={cn(
          "text-muted-foreground flex items-center gap-1.5 text-xs",
          className
        )}
      >
        <AlertTriangle className="h-3 w-3 shrink-0" />
        AI-generated content is not a substitute for professional medical advice.
      </p>
    );
  }

  return (
    <Alert className={cn("border-warning-border bg-warning-soft", className)}>
      <AlertTriangle className="h-4 w-4 text-warning" />
      <AlertDescription className="text-warning-foreground">
        AI-generated content is not a substitute for professional medical advice.
        Always consult your healthcare provider before starting or modifying any
        exercise program.
      </AlertDescription>
    </Alert>
  );
}
