"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import { toast } from "sonner";
import { createAssessmentSchema, type CreateAssessmentInput } from "@/lib/validators/assessment";
import { createAssessmentAction as recordAssessment } from "@/actions/assessment-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ASSESSMENT_TYPES } from "@/lib/utils/constants";
import { ROUTES } from "@/lib/utils/constants";
import { Loader2 } from "lucide-react";

interface AssessmentFormProps {
  clientId?: string;
}

export function AssessmentForm({ clientId }: AssessmentFormProps) {
  const router = useRouter();
  

  const form = useForm<CreateAssessmentInput>({
    resolver: zodResolver(createAssessmentSchema) as never,
    defaultValues: {
      clientId: clientId ?? "",
      assessmentType: "",
      value: 0,
      unit: "",
      notes: "",
    },
  });

  const selectedType = form.watch("assessmentType");
  const selectedAssessment = ASSESSMENT_TYPES.find((t) => t.value === selectedType);

  const onSubmit = async (data: CreateAssessmentInput) => {
    const result = await recordAssessment(data);
    if (result.success) {
      toast.success("Assessment recorded");
      router.push(ROUTES.ASSESSMENTS);
    } else {
      toast.error(result.error ?? "Failed to record assessment");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Record Assessment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="assessmentType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assessment Type</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      const at = ASSESSMENT_TYPES.find((t) => t.value === value);
                      if (at) {
                        form.setValue("unit", at.unit);
                      }
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select assessment type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ASSESSMENT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Value</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <Input {...field} readOnly className="bg-muted" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional observations..."
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Record Assessment
          </Button>
        </div>
      </form>
    </Form>
  );
}
