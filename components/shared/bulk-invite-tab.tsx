"use client";

import { useRef, useState, useCallback } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Download,
  X,
  Mail,
  ClipboardPaste,
} from "lucide-react";
import { validateCsvInviteRows, parseEmailList, type CsvRowError } from "@/lib/validators/csv-invite";
import type { InviteEmailResult } from "@/actions/bulk-invite-action";

type TabState = "idle" | "errors" | "preview" | "sending" | "results";
type Source = "csv" | "paste";

interface Props {
  onInvite: (emails: string[]) => Promise<InviteEmailResult[]>;
  onDone?: () => void;
}

export function BulkInviteTab({ onInvite, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>("csv");
  const [state, setState] = useState<TabState>("idle");
  const [fileName, setFileName] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [errors, setErrors] = useState<CsvRowError[]>([]);
  const [validEmails, setValidEmails] = useState<string[]>([]);
  const [results, setResults] = useState<InviteEmailResult[]>([]);

  const reset = useCallback(() => {
    setState("idle");
    setFileName("");
    setPastedText("");
    setErrors([]);
    setValidEmails([]);
    setResults([]);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase(),
        transform: (v) => v.trim(),
      });

      if (parsed.data.length === 0) {
        toast.error("CSV has no data rows");
        return;
      }

      const result = validateCsvInviteRows(parsed.data);

      if (result.errors.length > 0) {
        setErrors(result.errors);
        setValidEmails([]);
        setState("errors");
      } else {
        setErrors([]);
        setValidEmails(result.valid);
        setState("preview");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleParsePasted = useCallback(() => {
    const result = parseEmailList(pastedText);

    if (result.valid.length === 0 && result.errors.length === 0) {
      toast.error("Paste at least one email address");
      return;
    }

    if (result.errors.length > 0) {
      setErrors(result.errors);
      setValidEmails([]);
      setState("errors");
    } else {
      setErrors([]);
      setValidEmails(result.valid);
      setState("preview");
    }
  }, [pastedText]);

  const handleSend = useCallback(async () => {
    setState("sending");
    try {
      const inviteResults = await onInvite(validEmails);
      setResults(inviteResults);
      setState("results");
      const succeeded = inviteResults.filter((r) => r.success).length;
      if (succeeded > 0) {
        toast.success(
          `${succeeded} invitation${succeeded === 1 ? "" : "s"} sent`
        );
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
      setState("preview");
    }
  }, [validEmails, onInvite]);

  return (
    <div className="space-y-4">
      {state === "idle" && (
        <div className="inline-flex w-fit gap-1 rounded-lg bg-muted p-[3px]">
          <button
            type="button"
            onClick={() => setSource("csv")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              source === "csv" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Upload CSV
          </button>
          <button
            type="button"
            onClick={() => setSource("paste")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              source === "paste" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Paste Emails
          </button>
        </div>
      )}

      {/* Template download */}
      {state === "idle" && source === "csv" && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Download the CSV template
            </p>
            <p className="text-xs text-muted-foreground">
              One email per row, single column.
            </p>
          </div>
          <a
            href="/invite-template.csv"
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-background px-3 py-1.5 text-sm font-medium text-foreground ring-1 ring-border hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
            Template
          </a>
        </div>
      )}

      {/* Upload area */}
      {state === "idle" && source === "csv" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/20 px-8 py-12 text-center hover:border-primary/40 hover:bg-muted/40 transition-colors"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <UploadCloud className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">
              Drop your CSV here, or click to browse
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              .csv files only · one email per row
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleInputChange}
          />
        </div>
      )}

      {/* Paste emails area */}
      {state === "idle" && source === "paste" && (
        <div className="space-y-3">
          <Textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={"client1@example.com, client2@example.com\nclient3@example.com"}
            className="min-h-32 resize-y"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Separate emails with commas, spaces, or new lines.
          </p>
          <div className="flex justify-end">
            <Button onClick={handleParsePasted} disabled={!pastedText.trim()}>
              <ClipboardPaste className="mr-2 h-4 w-4" />
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Error state */}
      {state === "errors" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="font-medium text-foreground">
                {errors.length} error{errors.length === 1 ? "" : "s"} found
                {fileName ? (
                  <>
                    {" "}
                    in <span className="text-muted-foreground">{fileName}</span>
                  </>
                ) : null}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="h-4 w-4 mr-1" />
              Try again
            </Button>
          </div>
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-destructive/20">
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Row
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-destructive/10">
                  {errors.map((err, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {err.row}
                      </td>
                      <td className="px-4 py-2 text-xs text-foreground">
                        {err.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Fix these errors and upload again. Nothing has been sent.
          </p>
        </div>
      )}

      {/* Preview state */}
      {(state === "preview" || state === "sending") && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <p className="font-medium text-foreground">
                <span className="text-emerald-600">
                  {validEmails.length} email
                  {validEmails.length === 1 ? "" : "s"}
                </span>{" "}
                ready to invite
                {fileName ? (
                  <>
                    {" "}
                    from <span className="text-muted-foreground">{fileName}</span>
                  </>
                ) : null}
              </p>
            </div>
            {state === "preview" && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            )}
          </div>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="border-b border-border px-4 py-2.5 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Preview — first {Math.min(5, validEmails.length)} of{" "}
                {validEmails.length} email
                {validEmails.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="divide-y divide-border">
              {validEmails.slice(0, 5).map((email, i) => (
                <div key={i} className="flex items-center gap-2 px-4 py-2.5">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-sm text-foreground">{email}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            {state === "preview" ? (
              <Button onClick={handleSend} className="min-w-44">
                Send {validEmails.length} Invitation
                {validEmails.length !== 1 ? "s" : ""}
              </Button>
            ) : (
              <Button disabled className="min-w-44">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Results state */}
      {state === "results" && (
        <div className="space-y-4">
          <p className="font-medium text-foreground">
            <span className="text-emerald-600">
              {results.filter((r) => r.success).length} sent
            </span>
            {results.some((r) => !r.success) && (
              <>
                {" · "}
                <span className="text-destructive">
                  {results.filter((r) => !r.success).length} failed
                </span>
              </>
            )}
          </p>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Email
                    </th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.map((r, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-xs text-foreground">
                        {r.email}
                      </td>
                      <td className="px-4 py-2">
                        {r.success ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{" "}
                            Sent
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-destructive"
                            title={r.error}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-destructive" />{" "}
                            Failed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={reset}>
              Invite more
            </Button>
            <Button onClick={onDone}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}
