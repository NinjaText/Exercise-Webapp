import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * One form layout (spec §2.1/§2.3). Stacked by default: heading, optional
 * description, divider, then the fields 16px apart. When the section's own
 * container is at least 768px wide (`@3xl`, above the 720px narrow page width)
 * it becomes two columns — heading and description on the left, fields on the
 * right — and consecutive sections are separated by a hairline rule. Narrow
 * and settings pages therefore stay stacked; default/full pages go two-column.
 *
 * The outer element is the size container (an element cannot query itself)
 * and the `first:` group; `pt-8` below the rule matches the 32px `gap-8` the
 * consumers put between sections, so the rule sits evenly.
 */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <div data-slot="form-section-container" className={cn("group/form-section @container", className)}>
      <section
        data-slot="form-section"
        className="grid grid-cols-1 gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @3xl:gap-x-8 @3xl:gap-y-0 @3xl:border-t @3xl:border-border @3xl:pt-8 @3xl:group-first/form-section:border-t-0 @3xl:group-first/form-section:pt-0"
      >
        <div data-slot="form-section-header" className="border-b border-border pb-3 @3xl:border-b-0 @3xl:pb-0">
          <h2 className="text-heading text-foreground">{title}</h2>
          {description && <p className="mt-1 text-body text-muted-foreground">{description}</p>}
        </div>
        <div data-slot="form-section-fields" className="flex min-w-0 flex-col gap-4">
          {children}
        </div>
      </section>
    </div>
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

/**
 * Label above input, 6px gap (spec §2.1), helper or error text below. With
 * `htmlFor`, the message gets the id `${htmlFor}-error` / `${htmlFor}-hint`
 * so the control can reference it from `aria-describedby`.
 */
export function FormField({ label, htmlFor, hint, error, required, children, className }: FormFieldProps) {
  return (
    <div data-slot="form-field" className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} role="alert" className="text-caption text-danger-foreground">
          {error}
        </p>
      ) : hint ? (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="text-caption">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
