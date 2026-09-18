import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/** One form layout (spec §5): heading, optional description, divider, 24px between fields. */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <section data-slot="form-section" className={cn("flex flex-col gap-6", className)}>
      <div className="border-b border-border pb-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** Label above input, 8px gap, helper text below. */
export function FormField({ label, htmlFor, hint, error, required, children, className }: FormFieldProps) {
  return (
    <div data-slot="form-field" className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger-foreground">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
