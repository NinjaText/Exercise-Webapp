import { z } from "zod";

const emailRowSchema = z.object({
  email: z.string().trim().email("Must be a valid email address"),
});

export interface CsvRowError {
  row: number;
  column: string;
  message: string;
}

export interface CsvInviteValidationResult {
  valid: string[];
  errors: CsvRowError[];
}

export function validateCsvInviteRows(
  rawRows: Record<string, string>[]
): CsvInviteValidationResult {
  const valid: string[] = [];
  const errors: CsvRowError[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawRows.length; i++) {
    const result = emailRowSchema.safeParse(rawRows[i]);
    if (result.success) {
      const email = result.data.email.toLowerCase();
      if (!seen.has(email)) {
        seen.add(email);
        valid.push(email);
      }
    } else {
      for (const issue of result.error.issues) {
        errors.push({
          row: i + 2, // +1 for 0-index, +1 because row 1 is the header
          column: String(issue.path[0] ?? "email"),
          message: issue.message,
        });
      }
    }
  }

  return { valid, errors };
}

export interface EmailListValidationResult {
  valid: string[];
  errors: CsvRowError[];
}

/**
 * Parses free-form pasted text into a deduped list of valid emails.
 * Splits on commas, semicolons, whitespace, and newlines.
 */
export function parseEmailList(input: string): EmailListValidationResult {
  const tokens = input
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const valid: string[] = [];
  const errors: CsvRowError[] = [];
  const seen = new Set<string>();

  tokens.forEach((token, i) => {
    const result = emailRowSchema.safeParse({ email: token });
    if (result.success) {
      const email = result.data.email.toLowerCase();
      if (!seen.has(email)) {
        seen.add(email);
        valid.push(email);
      }
    } else {
      errors.push({
        row: i + 1,
        column: "email",
        message: `"${token}" is not a valid email address`,
      });
    }
  });

  return { valid, errors };
}
