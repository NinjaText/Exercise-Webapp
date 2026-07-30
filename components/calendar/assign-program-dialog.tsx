"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProgramsAction, getProgramAction } from "@/actions/program-actions";
import { scheduleProgramForClientAction } from "@/actions/calendar-actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AssignProgramDialog({
  clientId,
  children,
  onSuccess,
}: {
  clientId: string;
  children: React.ReactNode;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([
    "Monday",
    "Wednesday",
    "Friday",
  ]);
  const [loading, setLoading] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"auto" | "manual">("auto");
  const [selectedProgram, setSelectedProgram] = useState<any>(null);
  const [customDates, setCustomDates] = useState<Record<string, string>>({});

  const weekDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ] as const;

  function toggleWeekday(day: string) {
    setSelectedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  useEffect(() => {
    if (open && programs.length === 0) {
      getProgramsAction({ isTemplate: true })
        .then((res) => {
          if (res.success && res.data) {
            setPrograms(res.data.map(p => ({ id: p.id, name: p.name })));
          }
        })
        .catch(console.error);
    }
  }, [open, programs.length]);

  useEffect(() => {
    if (selectedProgramId && scheduleMode === "manual" && !selectedProgram) {
      setLoading(true);
      getProgramAction(selectedProgramId).then((res) => {
        if (res.success && res.data) {
          setSelectedProgram(res.data);
          const initialDates: Record<string, string> = {};
          (res.data.workouts as any[])?.forEach((w) => {
            initialDates[w.id] = startDate;
          });
          setCustomDates(initialDates);
        }
        setLoading(false);
      });
    }
  }, [selectedProgramId, scheduleMode, startDate]);

  const handleAssign = async () => {
    if (!selectedProgramId) {
      toast.error("Please select a program.");
      return;
    }
    if (scheduleMode === "auto") {
      if (!startDate) {
        toast.error("Please select a start date.");
        return;
      }
      if (selectedWeekdays.length === 0) {
        toast.error("Please select at least one training day.");
        return;
      }
    } else {
      if (Object.keys(customDates).length === 0) {
        toast.error("Please set dates for the workouts.");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await scheduleProgramForClientAction({
        programId: selectedProgramId,
        clientId,
        startDate: scheduleMode === "auto" ? startDate : new Date().toISOString().split("T")[0],
        preferredWeekdays: scheduleMode === "auto" ? selectedWeekdays : undefined,
        customWorkoutDates: scheduleMode === "manual" ? customDates : undefined,
      });

      if (res.success) {
        toast.success("Program scheduled successfully");
        setOpen(false);
        if (onSuccess) onSuccess();
      } else {
        toast.error(res.error || "Failed to schedule program");
      }
    } catch (error) {
      toast.error("An error occurred while scheduling.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={React.isValidElement(children) ? children : <button>{children}</button>} />
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0">
          <DialogTitle>Assign Program</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto min-h-0">
        <div className="space-y-4 px-5 py-4">
          <div className="space-y-2">
            <Label>Select Template</Label>
            <Select 
              value={selectedProgramId} 
              onValueChange={(val) => {
                setSelectedProgramId(val || "");
                setSelectedProgram(null); // reset loaded program
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a program" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Tabs value={scheduleMode} onValueChange={(val: any) => setScheduleMode(val)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="auto">Auto-Schedule</TabsTrigger>
              <TabsTrigger value="manual">Manual Calendar</TabsTrigger>
            </TabsList>

            <TabsContent value="auto" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Training Days</Label>
                <div className="flex flex-wrap gap-2">
                  {weekDays.map((day) => (
                    <Button
                      key={day}
                      type="button"
                      size="sm"
                      variant={selectedWeekdays.includes(day) ? "default" : "outline"}
                      onClick={() => toggleWeekday(day)}
                    >
                      {day.slice(0, 3)}
                    </Button>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="space-y-4 pt-4">
              {loading && !selectedProgram ? (
                <div className="text-sm text-center text-muted-foreground p-4">Loading program workouts...</div>
              ) : selectedProgram ? (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                  {((selectedProgram.workouts as any[]) || []).map((w, index) => (
                    <div key={w.id} className="flex items-center justify-between border p-3 rounded-md">
                      <div>
                        <div className="font-medium text-sm">{w.name}</div>
                        <div className="text-xs text-muted-foreground">Week {w.weekIndex + 1}, Day {w.dayIndex + 1}</div>
                      </div>
                      <Input
                        type="date"
                        className="w-auto h-8 text-sm"
                        value={customDates[w.id] || startDate}
                        onChange={(e) => setCustomDates(prev => ({ ...prev, [w.id]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-center text-muted-foreground p-4">Please select a program first</div>
              )}
            </TabsContent>
          </Tabs>
        </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={loading}>
            {loading ? "Assigning..." : "Assign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}