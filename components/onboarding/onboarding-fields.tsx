"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-section";
import { cn } from "@/lib/utils";

/**
 * Small field wrappers shared by the onboarding step forms: label, control and
 * error wired together (aria-invalid + aria-describedby → FormField's message
 * ids) so per-step validation is announced and focusable.
 */

function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

interface TextFieldProps extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

export function TextField({ id, label, value, onValueChange, error, hint, required, className, ...input }: TextFieldProps) {
  return (
    <FormField label={label} htmlFor={id} error={error} hint={hint} required={required} className={className}>
      <Input
        id={id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-required={required || undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...input}
      />
    </FormField>
  );
}

interface TextAreaFieldProps extends Omit<React.ComponentProps<"textarea">, "onChange" | "value"> {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  hint?: string;
}

export function TextAreaField({ id, label, value, onValueChange, hint, ...textarea }: TextAreaFieldProps) {
  return (
    <FormField label={label} htmlFor={id} hint={hint}>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        aria-describedby={describedBy(id, undefined, hint)}
        {...textarea}
      />
    </FormField>
  );
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: readonly { value: string; label: string }[];
}

/** Native select (keeps the plain string value), styled like Input. */
export function SelectField({ id, label, value, onValueChange, placeholder, options }: SelectFieldProps) {
  return (
    <FormField label={label} htmlFor={id}>
      <select
        id={id}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          "h-9 w-full min-w-0 rounded-md border border-input bg-surface px-3 text-base text-foreground shadow-xs outline-none transition-[color,border-color,box-shadow] md:text-sm",
          "hover:border-border-strong focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
        )}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}

interface ToggleGroupFieldProps {
  id: string;
  label: string;
  options: readonly string[];
  selected: readonly string[];
  onToggle: (option: string) => void;
}

/** Multi-select chips: toggle buttons announced with aria-pressed. */
export function ToggleGroupField({ id, label, options, selected, onToggle }: ToggleGroupFieldProps) {
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-label text-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.includes(option);
          return (
            <Button
              key={option}
              type="button"
              variant={on ? "default" : "outline"}
              size="sm"
              aria-pressed={on}
              onClick={() => onToggle(option)}
            >
              {option}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

/** Adds or removes `item` (order of selection kept, as before). */
export function toggleItem(list: readonly string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
