"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { normalizeHex } from "@/lib/branding/color";
import { DEFAULT_PRIMARY_HEX } from "@/lib/branding/defaults";

const FORMAT_ERROR = "Enter a color like #1d4ed8";

interface ColorFieldProps {
  /** Normalized hex (`#rrggbb`), or null for "use the default color". */
  value: string | null;
  onChange: (hex: string | null) => void;
  /** Server-side error (e.g. the lightness guardrail); a local format error takes precedence. */
  error?: string;
  /** Id of the hex text input, so a `FormField`/`Label` can point at it. */
  id?: string;
  /** Told whenever the typed text becomes (in)valid, so the form can block saving a stale value. */
  onValidityChange?: (valid: boolean) => void;
}

/**
 * Brand color input: a native color picker (doubling as the swatch) and a hex
 * text input kept in sync. Valid hexes are reported as they are typed so the
 * preview updates live; the text is normalized on blur, and clearing it means
 * "use the default color".
 */
export function ColorField({ value, onChange, error, id = "brandPrimaryColor", onValidityChange }: ColorFieldProps) {
  const [draft, setDraft] = useState(value ?? "");
  const [formatError, setFormatError] = useState<string | null>(null);
  const [prevValue, setPrevValue] = useState(value);

  // Adopt outside changes (native picker, reset, refreshed props) without an effect.
  if (value !== prevValue) {
    setPrevValue(value);
    if (value !== normalizeHex(draft)) {
      setDraft(value ?? "");
      setFormatError(null);
    }
  }

  function setValidity(nextError: string | null) {
    setFormatError(nextError);
    onValidityChange?.(nextError === null);
  }

  function handleTextChange(text: string) {
    setDraft(text);
    const hex = normalizeHex(text);
    if (hex) {
      setValidity(null);
      if (hex !== value) onChange(hex);
    } else if (text.trim() === "") {
      // Blank is valid: it means "use the default color". Report it now so the
      // preview and dirty state update without waiting for blur.
      setValidity(null);
      if (value !== null) onChange(null);
    } else {
      // Block saving right away, but only show the message on blur (not mid-typing).
      onValidityChange?.(false);
    }
  }

  function handleBlur() {
    const text = draft.trim();
    if (!text) {
      setDraft("");
      setValidity(null);
      if (value !== null) onChange(null);
      return;
    }
    const hex = normalizeHex(text);
    if (!hex) {
      setValidity(FORMAT_ERROR);
      return;
    }
    setDraft(hex);
    setValidity(null);
    if (hex !== value) onChange(hex);
  }

  function handlePickerChange(hex: string) {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    setDraft(normalized);
    setValidity(null);
    onChange(normalized);
  }

  const shownError = formatError ?? error;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label="Pick brand color"
          value={value ?? DEFAULT_PRIMARY_HEX}
          onChange={(e) => handlePickerChange(e.target.value)}
          className="size-8 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-0.5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Input
          id={id}
          value={draft}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="Default color"
          spellCheck={false}
          autoComplete="off"
          maxLength={9}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? errorId : undefined}
          className="max-w-40 font-mono"
        />
      </div>
      {shownError && (
        <p id={errorId} role="alert" className="text-xs text-danger-foreground">
          {shownError}
        </p>
      )}
    </div>
  );
}
