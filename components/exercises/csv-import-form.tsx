"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  UploadCloud, FileSpreadsheet, AlertCircle,
  CheckCircle2, Loader2, Download, X,
} from "lucide-react";
import { validateCsvRows, type CsvExerciseRow, type CsvRowError } from "@/lib/validators/csv-exercise";
import { importExercisesFromCsvAction } from "@/actions/bulk-exercise-actions";

type FormState = "idle" | "errors" | "preview" | "importing";

const PREVIEW_COLUMNS = ["name", "bodyRegion", "difficultyLevel", "exercisePhases", "videoUrl"] as const;

export function CsvImportForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<FormState>("idle");
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<CsvRowError[]>([]);
  const [validRows, setValidRows] = useState<CsvExerciseRow[]>([]);

  const reset = useCallback(() => {
    setState("idle");
    setFileName("");
    setErrors([]);
    setValidRows([]);
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
        transformHeader: (h) => h.trim(),
        transform: (v) => v.trim(),
      });

      if (parsed.data.length === 0) {
        toast.error("CSV has no data rows");
        return;
      }

      const result = validateCsvRows(parsed.data);

      if (result.errors.length > 0) {
        setErrors(result.errors);
        setValidRows([]);
        setState("errors");
      } else {
        setErrors([]);
        setValidRows(result.valid);
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

  const handleImport = useCallback(async () => {
    setState("importing");
    const result = await importExercisesFromCsvAction(validRows);
    if (result.success) {
      toast.success(`Imported ${result.count} exercise${result.count === 1 ? "" : "s"}`);
      router.push("/admin/exercises");
    } else {
      toast.error(result.error ?? "Import failed");
      setState("preview");
    }
  }, [validRows, router]);

  return (
    <div className="space-y-6">
      {/* Template download */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-5 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Download the CSV template</p>
          <p className="text-xs text-muted-foreground">
            Fill it in using AI, add YouTube URLs, then upload below.
          </p>
        </div>
        <a
          href="/exercise-import-template.csv"
          download
          className="inline-flex items-center gap-1.5 rounded-lg bg-background px-4 py-2 text-sm font-medium text-foreground ring-1 ring-border hover:bg-muted transition-colors"
        >
          <Download className="h-4 w-4" />
          Template
        </a>
      </div>

      {/* Upload area */}
      {state === "idle" && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/20 px-8 py-16 text-center hover:border-primary/40 hover:bg-muted/40 transition-colors"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <UploadCloud className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">Drop your CSV here, or click to browse</p>
            <p className="mt-1 text-sm text-muted-foreground">.csv files only</p>
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

      {/* Error state */}
      {state === "errors" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="font-medium text-foreground">
                {errors.length} error{errors.length === 1 ? "" : "s"} found in{" "}
                <span className="text-muted-foreground">{fileName}</span>
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
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Row</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Column</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-destructive/10">
                  {errors.map((err, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{err.row}</td>
                      <td className="px-4 py-2">
                        <StatusBadge
                          status={err.column}
                          label={err.column}
                          role="danger"
                          dot={false}
                          size="sm"
                          className="font-mono"
                        />
                      </td>
                      <td className="px-4 py-2 text-xs text-foreground">{err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Fix these errors in your CSV file and upload it again. Nothing has been imported.
          </p>
        </div>
      )}

      {/* Preview state */}
      {(state === "preview" || state === "importing") && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success-foreground" />
              <p className="font-medium text-foreground">
                <span className="text-success-foreground">
                  {validRows.length} exercise{validRows.length === 1 ? "" : "s"}
                </span>{" "}
                ready to import from{" "}
                <span className="text-muted-foreground">{fileName}</span>
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
                Preview — first {Math.min(5, validRows.length)} of {validRows.length} rows
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {PREVIEW_COLUMNS.map((col) => (
                      <th key={col} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {validRows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium text-foreground max-w-[200px] truncate">{row.name}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{row.bodyRegion}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{row.difficultyLevel}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{row.exercisePhases?.length ? row.exercisePhases.join(", ") : "—"}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground max-w-[160px] truncate">
                        {row.videoUrl ? (
                          <span className="text-info-foreground">{row.videoUrl}</span>
                        ) : (
                          <span className="text-muted-foreground/40">no video</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            {state === "preview" && (
              <Button onClick={handleImport} className="min-w-36">
                Import {validRows.length} exercise{validRows.length === 1 ? "" : "s"}
              </Button>
            )}
            {state === "importing" && (
              <Button disabled className="min-w-36">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing…
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
